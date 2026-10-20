/**
 * cooldownService.js — Batas jeda antar pemakaian layanan pencarian
 *
 * Tujuan: mencegah user spam command sehingga terjadi double call ke API
 * provider (boros kuota & berisiko data ganda).
 *
 * Cooldown disimpan DI MEMORI (bukan file), karena hanya perlu bertahan
 * beberapa detik. Restart bot akan mereset cooldown — tidak masalah.
 *
 * Cakupan: per USER, berlaku untuk SEMUA layanan pencarian.
 * Artinya setelah memakai satu layanan, user harus menunggu sebelum
 * memakai layanan apa pun.
 */

/** Jeda antar pemakaian (detik) */
const COOLDOWN_SECONDS = 10;

/** @type {Map<number, number>} userId -> timestamp terakhir (ms) */
const lastUsed = new Map();

/**
 * Bersihkan entri lama agar Map tidak tumbuh terus.
 * Dipanggil sesekali saat cek; murah karena hanya menyapu entri kedaluwarsa.
 */
function cleanup() {
  const now = Date.now();
  const ttl = COOLDOWN_SECONDS * 1000;
  for (const [userId, ts] of lastUsed.entries()) {
    if (now - ts >= ttl) lastUsed.delete(userId);
  }
}

/**
 * Cek apakah user masih dalam masa cooldown.
 * TIDAK mengubah state apa pun.
 *
 * @param {number} userId - Telegram user ID
 * @returns {{blocked: boolean, remaining: number}}
 *   remaining = sisa detik (dibulatkan ke atas)
 */
function check(userId) {
  const uid = Number(userId);
  const ts = lastUsed.get(uid);
  if (!ts) return { blocked: false, remaining: 0 };

  const elapsed = Date.now() - ts;
  const total = COOLDOWN_SECONDS * 1000;
  if (elapsed >= total) {
    lastUsed.delete(uid);
    return { blocked: false, remaining: 0 };
  }

  const remaining = Math.ceil((total - elapsed) / 1000);
  return { blocked: true, remaining };
}

/**
 * Tandai user baru saja memakai layanan.
 * @param {number} userId
 */
function mark(userId) {
  lastUsed.set(Number(userId), Date.now());
  cleanup();
}

/**
 * Cek sekaligus tandai (untuk pemakaian normal).
 *
 * @param {number} userId
 * @returns {{blocked: boolean, remaining: number}}
 *   blocked=true  → user harus menunggu, JANGAN lanjutkan pencarian
 *   blocked=false → sudah ditandai, pencarian boleh lanjut
 */
function hit(userId) {
  const result = check(userId);
  if (result.blocked) return result;
  mark(userId);
  return { blocked: false, remaining: 0 };
}

/**
 * Reset cooldown seorang user (untuk keperluan internal/debug).
 * @param {number} userId
 */
function reset(userId) {
  lastUsed.delete(Number(userId));
}

/**
 * Hapus semua entri cooldown (untuk keperluan internal/debug).
 */
function resetAll() {
  lastUsed.clear();
}

/**
 * Durasi cooldown dalam detik
 * @returns {number}
 */
function getDuration() {
  return COOLDOWN_SECONDS;
}

/**
 * Jumlah user yang sedang tercatat dalam cooldown
 * @returns {number}
 */
function activeCount() {
  return lastUsed.size;
}

module.exports = {
  COOLDOWN_SECONDS,
  check,
  mark,
  hit,
  reset,
  resetAll,
  getDuration,
  activeCount,
};
