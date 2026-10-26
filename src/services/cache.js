/**
 * cache.js — Baca/tulis cache (db/plat.json & db/nama.json)
 */

const fs = require('fs');
const path = require('path');
const jsonStore = require('./jsonStore');

let dbPath = './db';

// ─── Helpers ─────────────────────────────────────────────────

function setDbPath(basePath) {
  dbPath = basePath;
}

function readJsonFile(filename) {
  const filePath = path.join(dbPath, filename);
  try {
    if (!fs.existsSync(filePath)) {
      jsonStore.tulisJsonSync(filePath, {});
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    // JANGAN menimpa file saat gagal baca. Bisa jadi file sedang ditulis
    // proses lain atau rusak sementara — menimpanya berarti kehilangan
    // seluruh cache secara permanen. Cukup laporkan dan pakai objek kosong.
    console.error(`[cache] Gagal membaca ${filename}:`, err.message);
    return {};
  }
}

function writeJsonFile(filename, data) {
  try {
    const filePath = path.join(dbPath, filename);
    // Tulis atomik agar cache tidak korup bila proses mati di tengah
    jsonStore.tulisJsonSync(filePath, data);
  } catch (err) {
    console.error(`[cache] Error menulis ${filename}:`, err.message);
  }
}

function normalizeKey(raw) {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Normalisasi untuk PLAT NOMOR.
 * Beda spasi dianggap SAMA (spasi dihapus, huruf kecil/besar disamakan).
 * Contoh: "B 1234 XYZ" == "b1234xyz" == "B1234XYZ"
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizePlatKey(raw) {
  return String(raw || '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Normalisasi untuk NAMA.
 * Huruf besar/kecil dianggap SAMA, tetapi SPASI tetap dipertahankan
 * (hanya dirapikan menjadi satu spasi).
 * Contoh:
 *   "budi santoso" == "BUDI SANTOSO"   (beda kapital -> sama)
 *   "BUDI SANTOSO" != "BUDISANTOSO"    (beda spasi -> beda)
 *   "BUDI  SANTOSO" == "BUDI SANTOSO"  (spasi berlebih dirapikan)
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizeNamaKey(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

// ─── Cache Plat (db/plat.json) ───────────────────────────────

function getCachedPlat(platNormalized) {
  const cache = readJsonFile('plat.json');
  return cache[platNormalized] || null;
}

function saveToCachePlat(platNormalized, data) {
  const cache = readJsonFile('plat.json');
  cache[platNormalized] = {
    ...data,
    cachedAt: new Date().toISOString(),
  };
  writeJsonFile('plat.json', cache);
}

// ─── Cache Nama (db/nama.json) ───────────────────────────────

/**
 * Cek apakah nama ada di cache
 * @param {string} nama - Nama yang sudah dinormalisasi (tanpa spasi, uppercase)
 * @returns {object|null} Object { total, data[] } atau null
 */
function getCachedNama(namaNormalized) {
  const cache = readJsonFile('nama.json');
  return cache[namaNormalized] || null;
}

/**
 * Simpan hasil pencarian nama ke cache
 * @param {string} namaNormalized - Nama yang sudah dinormalisasi
 * @param {object} result - { total, data[] } dari API
 */
function saveToCacheNama(namaNormalized, result) {
  const cache = readJsonFile('nama.json');
  cache[namaNormalized] = {
    total: result.total,
    data: result.data,
    cachedAt: new Date().toISOString(),
  };
  writeJsonFile('nama.json', cache);
}

// ─── Cache Nik2kk (db/nik2kk.json) ───────────────────────────

/**
 * Cek apakah NIK ada di cache
 * @param {string} nikNormalized - NIK yang sudah dinormalisasi
 * @returns {object|null} Data NIK atau null
 */
function getCachedNik2kk(nikNormalized) {
  const cache = readJsonFile('nik2kk.json');
  return cache[nikNormalized] || null;
}

/**
 * Simpan hasil pencarian NIK ke cache
 * @param {string} nikNormalized - NIK yang sudah dinormalisasi
 * @param {object} data - Data dari API
 */
function saveToCacheNik2kk(nikNormalized, data) {
  const cache = readJsonFile('nik2kk.json');
  cache[nikNormalized] = {
    ...data,
    cachedAt: new Date().toISOString(),
  };
  writeJsonFile('nik2kk.json', cache);
}

// ─── Cache Nomor HP (db/nomor.json) ──────────────────────────

/**
 * Cek apakah nomor HP ada di cache
 * @param {string} nomorNormalized - Nomor yang sudah dinormalisasi
 * @returns {object|null} Data nomor atau null
 */
function getCachedNomor(nomorNormalized) {
  const cache = readJsonFile('nomor.json');
  return cache[nomorNormalized] || null;
}

/**
 * Simpan hasil pencarian nomor HP ke cache
 * @param {string} nomorNormalized - Nomor yang sudah dinormalisasi
 * @param {object} data - Data dari API
 */
function saveToCacheNomor(nomorNormalized, data) {
  const cache = readJsonFile('nomor.json');
  cache[nomorNormalized] = {
    ...data,
    cachedAt: new Date().toISOString(),
  };
  writeJsonFile('nomor.json', cache);
}


// ─── Cache KK (db/kk.json) ───────────────────────────────────

/**
 * Ambil data KK dari cache
 * @param {string} nokkNormalized - Nomor KK yang sudah dinormalisasi
 * @returns {object|null} Data KK (berisi kk_terbaru & kk_lama) atau null
 */
function getCachedKK(nokkNormalized) {
  const cache = readJsonFile('kk.json');
  return cache[nokkNormalized] || null;
}

/**
 * Simpan hasil pencarian KK ke cache.
 * Kedua bagian disimpan: kk_terbaru dan kk_lama.
 *
 * @param {string} nokkNormalized - Nomor KK yang sudah dinormalisasi
 * @param {object} data - { kk_terbaru, kk_lama }
 */
function saveToCacheKK(nokkNormalized, data) {
  const cache = readJsonFile('kk.json');
  cache[nokkNormalized] = {
    kk_terbaru: data.kk_terbaru || null,
    kk_lama: Array.isArray(data.kk_lama) ? data.kk_lama : [],
    cachedAt: new Date().toISOString(),
  };
  writeJsonFile('kk.json', cache);
}

module.exports = {
  setDbPath,
  normalizeKey,
  normalizePlatKey,
  normalizeNamaKey,
  // Plat
  getCachedPlat,
  saveToCachePlat,
  // Nama
  getCachedNama,
  saveToCacheNama,
  // Nik2kk
  getCachedNik2kk,
  saveToCacheNik2kk,
  // Nomor
  getCachedNomor,
  saveToCacheNomor,
  // KK
  getCachedKK,
  saveToCacheKK,
};