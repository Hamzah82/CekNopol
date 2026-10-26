/**
 * jsonStore.js — Baca/tulis file JSON yang aman
 *
 * Dua masalah yang ditangani:
 *
 * 1. ATOMIC WRITE
 *    Menulis langsung ke file tujuan berisiko: bila proses mati di
 *    tengah penulisan, file bisa kosong atau terpotong. Solusinya
 *    tulis ke file sementara lalu rename (rename bersifat atomik di
 *    filesystem POSIX).
 *
 * 2. LOCK (mutex dalam proses)
 *    Bila dua operasi menulis file yang sama hampir bersamaan
 *    (mis. dua user membeli token), hasilnya bisa saling menimpa.
 *    Setiap nama file diberi antrian agar operasi berjalan bergantian.
 *
 * Catatan: lock ini hanya berlaku di DALAM satu proses Node.
 * Untuk perlindungan lintas-proses diperlukan lock file terpisah.
 */

const fs = require('fs');
const path = require('path');

/** Antrian per file: { [pathFile]: Promise } */
const antrian = new Map();

/**
 * Jalankan fungsi secara bergantian untuk file tertentu.
 *
 * @template T
 * @param {string} filePath
 * @param {() => T} fn
 * @returns {Promise<T>}
 */
function denganLock(filePath, fn) {
  const kunci = path.resolve(filePath);
  const sebelumnya = antrian.get(kunci) || Promise.resolve();

  const berikutnya = sebelumnya
    .catch(() => {}) // kegagalan sebelumnya tidak boleh memblokir antrian
    .then(async () => fn());

  antrian.set(kunci, berikutnya);

  // Bersihkan entri antrian setelah selesai agar tidak menumpuk
  berikutnya.finally(() => {
    if (antrian.get(kunci) === berikutnya) antrian.delete(kunci);
  });

  return berikutnya;
}

/**
 * Tulis file secara atomik.
 *
 * @param {string} filePath
 * @param {string} isi
 */
function tulisAtomik(filePath, isi) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Nama sementara unik agar tidak bentrok antar proses
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    fs.writeFileSync(tmp, isi, 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Bersihkan file sementara bila gagal
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_) {
      /* abaikan */
    }
    throw err;
  }
}

/**
 * Tulis JSON secara aman (dengan lock + atomic).
 *
 * @param {string} filePath
 * @param {*} data
 * @returns {Promise<void>}
 */
function tulisJson(filePath, data) {
  const isi = JSON.stringify(data, null, 2);
  return denganLock(filePath, () => tulisAtomik(filePath, isi));
}

/**
 * Tulis JSON secara SINKRON (dengan lock + atomic).
 * Dipakai oleh kode yang belum async.
 *
 * @param {string} filePath
 * @param {*} data
 */
function tulisJsonSync(filePath, data) {
  tulisAtomik(filePath, JSON.stringify(data, null, 2));
}

/**
 * Baca JSON dengan aman. File tidak ada -> kembalikan nilai default.
 *
 * @param {string} filePath
 * @param {*} fallback
 * @returns {*}
 */
function bacaJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return fallback;
    const data = JSON.parse(raw);
    return data === null || data === undefined ? fallback : data;
  } catch (err) {
    console.error(`[jsonStore] gagal baca ${path.basename(filePath)}:`, err.message);
    return fallback;
  }
}

module.exports = {
  denganLock,
  tulisAtomik,
  tulisJson,
  tulisJsonSync,
  bacaJson,
};