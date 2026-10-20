/**
 * backupService.js — Membuat file .zip dari folder DB
 *
 * Memakai perintah sistem `zip` (tidak menambah dependency npm).
 *
 * Alur:
 *   1. Buat folder temporer
 *   2. Zip seluruh isi folder DB ke file .zip di folder temporer
 *   3. Handler mengirim file, lalu memanggil cleanup()
 *   4. Folder temporer dihapus
 *
 * Keamanan:
 *   - Folder temporer memakai mkdtemp (nama acak, izin 0700)
 *   - Nama file zip mengikuti tanggal & jam
 *   - cleanup() selalu dipanggil di blok finally oleh handler
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

/**
 * Buat nama file backup berdasarkan waktu (zona Asia/Jakarta)
 * @param {Date} [d]
 * @returns {string}
 */
function buildFileName(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(',', '');

  // en-CA: "2026-10-20 14:30" -> "2026-10-20_1430"
  const [datePart, timePart] = parts.split(' ');
  const jam = (timePart || '00:00').replace(':', '');

  return `db-backup-${datePart}_${jam}.zip`;
}

/**
 * Jalankan perintah zip
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<{ok: boolean, stderr?: string}>}
 */
function runZip(args, cwd) {
  return new Promise((resolve) => {
    execFile('zip', args, { cwd, timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, stderr: stderr || err.message });
        return;
      }
      resolve({ ok: true, stderr });
    });
  });
}

/**
 * Buat backup zip dari folder DB.
 *
 * @param {string} sourceDir - Folder yang akan di-zip (folder DB)
 * @param {string} [destDir] - Folder tujuan (default: temp baru)
 * @returns {Promise<{ok: boolean, zipPath?: string, fileName?: string, size?: number, tmpDir?: string, error?: string}>}
 */
async function createBackup(sourceDir, destDir) {
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    return { ok: false, error: 'Folder database tidak ditemukan.' };
  }

  let tmpDir = destDir;
  let createdTmp = false;

  try {
    if (!tmpDir) {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ruka-backup-'));
      createdTmp = true;
    }

    const fileName = buildFileName();
    const zipPath = path.join(tmpDir, fileName);

    // Zip semua isi folder DB (rekursif), simpan path relatifnya
    const res = await runZip(['-r', '-q', zipPath, '.'], sourceDir);

    if (!res.ok || !fs.existsSync(zipPath)) {
      return {
        ok: false,
        error: `Gagal membuat zip: ${(res.stderr || 'tidak diketahui').trim()}`,
        tmpDir: createdTmp ? tmpDir : undefined,
      };
    }

    const stat = fs.statSync(zipPath);

    return {
      ok: true,
      zipPath,
      fileName,
      size: stat.size,
      tmpDir,
    };
  } catch (err) {
    return { ok: false, error: err.message, tmpDir: createdTmp ? tmpDir : undefined };
  }
}

/**
 * Hapus folder temporer beserta isinya.
 * Tidak melempar error bila gagal.
 *
 * @param {string} tmpDir
 */
function cleanup(tmpDir) {
  if (!tmpDir) return;
  try {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error('[backupService] gagal membersihkan folder temporer:', err.message);
  }
}

/**
 * Format ukuran file
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

module.exports = {
  createBackup,
  cleanup,
  buildFileName,
  formatSize,
};
