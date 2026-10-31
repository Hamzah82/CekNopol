/**
 * kampusService.js — Cari data mahasiswa di PDDikti
 *
 * Memakai skrip Python yang sudah ada (pddikti_scraper.py) lewat
 * child_process. Dipilih memakai skrip itu agar tidak menulis ulang
 * logika API PDDikti (header Referer/Origin wajib, ID base64 mentah).
 *
 * ATURAN PENTING:
 *   Data hanya dianggap "ketemu" bila 100% identik dengan input.
 *   Skrip Python sudah memfilter ini; service ini memverifikasi ulang
 *   sebagai pengaman kedua.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const SKRIP_KANDIDAT = [
  path.join(__dirname, '..', '..', 'scripts', 'pddikti_scraper.py'),
  path.join(process.cwd(), 'scripts', 'pddikti_scraper.py'),
  '/home/nyx/work/dev/dumpPDDikti/pddikti_scraper.py',
];

const SKRIP = SKRIP_KANDIDAT.find((p) => fs.existsSync(p)) || SKRIP_KANDIDAT[0];

/** Batas waktu pemanggilan skrip (ms) */
const TIMEOUT_MS = 90 * 1000;

/**
 * Normalisasi nama untuk perbandingan:
 * huruf besar, tanpa aksen, spasi tunggal, hanya huruf/angka/spasi.
 *
 * @param {string} teks
 * @returns {string}
 */
function normalisasi(teks) {
  if (!teks) return '';
  return String(teks)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Apakah input berupa NIM (seluruhnya angka setelah spasi/titik/strip dibuang).
 *
 * @param {string} query
 * @returns {boolean}
 */
function deteksiNim(query) {
  const bersih = String(query || '').replace(/[\s.\-]/g, '');
  return bersih.length > 0 && /^\d+$/.test(bersih);
}

/**
 * Bandingkan NIM: hanya angka yang dihitung.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function nimSama(a, b) {
  const x = String(a || '').replace(/[\s.\-]/g, '');
  const y = String(b || '').replace(/[\s.\-]/g, '');
  return x.length > 0 && x === y;
}

/**
 * Jalankan skrip Python dan kembalikan JSON-nya.
 *
 * @param {string} query
 * @returns {Promise<{ok: boolean, data?: Array, error?: string}>}
 */
function jalankanScraper(query) {
  return new Promise((resolve) => {
    execFile(
      'python3',
      [SKRIP, query, '--json'],
      {
        timeout: TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' },
      },
      (err, stdout, stderr) => {
        // Skrip mengembalikan exit code 0 walau data kosong,
        // jadi error di sini berarti masalah nyata (timeout, crash, dll).
        if (err) {
          const pesan = (stderr || err.message || '').trim();

          if (err.killed || err.signal === 'SIGTERM') {
            return resolve({ ok: false, error: 'Pencarian terlalu lama (timeout).' });
          }
          if (/timeout/i.test(pesan)) {
            return resolve({ ok: false, error: 'Koneksi ke PDDikti timeout.' });
          }
          if (/403/.test(pesan)) {
            return resolve({ ok: false, error: 'PDDikti sedang membatasi permintaan (403).' });
          }
          if (/ConnectionError|Tidak dapat terhubung/i.test(pesan)) {
            return resolve({ ok: false, error: 'Tidak dapat terhubung ke PDDikti.' });
          }

          console.error('[kampusService] scraper gagal:', pesan.slice(0, 400));
          // tampilkan pesan asli (terpotong) agar penyebab sebenarnya terlihat
          return resolve({ ok: false, error: pesan.slice(0, 200) || 'Gagal mengambil data dari PDDikti.' });
        }

        // Skrip Python tidak mengeluarkan JSON sama sekali ketika tidak ada
        // hasil yang 100% cocok (lihat proses() di pddikti_scraper.py).
        // Ini BUKAN error — artinya "data tidak ditemukan".
        const teks = String(stdout || '').trim();
        if (!teks) {
          return resolve({ ok: true, data: [], status: 'empty' });
        }

        try {
          const parsed = JSON.parse(teks);
          return resolve({ ok: true, data: parsed.data || [], status: parsed.status });
        } catch (e) {
          console.error('[kampusService] output bukan JSON:', teks.slice(0, 200));
          return resolve({ ok: false, error: 'Format data dari PDDikti tidak dikenali.' });
        }
      }
    );
  });
}

/**
 * Cari data mahasiswa.
 *
 * Hanya mengembalikan hasil yang 100% cocok. Bila tidak ada yang cocok,
 * `hasil` berisi array kosong — pemanggil tidak boleh memotong token.
 *
 * @param {string} query - NIM atau nama lengkap
 * @returns {Promise<{ok: boolean, hasil: Array, error?: string}>}
 */
async function cariMahasiswa(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, hasil: [], error: 'Input kosong.' };

  const res = await jalankanScraper(q);
  if (!res.ok) {
    return { ok: false, hasil: [], error: res.error };
  }

  const daftar = Array.isArray(res.data) ? res.data : [];
  if (!daftar.length) {
    return { ok: true, hasil: [] };
  }

  const pakaiNim = deteksiNim(q);

  // Verifikasi ulang 100% cocok (pengaman kedua)
  const cocok = daftar.filter((d) => {
    if (pakaiNim) return nimSama(d.nim, q);
    return normalisasi(d.nama) === normalisasi(q);
  });

  return { ok: true, hasil: cocok };
}

module.exports = {
  SKRIP,
  TIMEOUT_MS,
  normalisasi,
  deteksiNim,
  nimSama,
  cariMahasiswa,
};
