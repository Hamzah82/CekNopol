/**
 * loading.js — Pesan "sedang diproses" yang bisa dihapus setelah selesai.
 *
 * Dipakai saat menunggu respons API yang bisa memakan waktu lama
 * (timeout request kini 60 detik). User jadi tahu bot sedang bekerja,
 * bukan hang.
 *
 * Dipakai:
 *   const loader = await sendLoading(ctx);
 *   ... kerja ...
 *   await clearLoading(loader);
 */

const LOADING_TEXT = '⏳ Sedang memproses... mohon tunggu.';

/**
 * Kirim pesan loading.
 *
 * @param {import('telegraf').Context} ctx
 * @param {string} [text] - Teks kustom (opsional)
 * @returns {Promise<object|null>} Objek pesan (untuk dihapus), atau null bila gagal
 */
async function sendLoading(ctx, text) {
  try {
    return await ctx.reply(text || LOADING_TEXT);
  } catch (err) {
    console.error('[loading] gagal kirim pesan loading:', err.message);
    return null;
  }
}

/**
 * Hapus pesan loading. Tidak melempar error bila gagal
 * (mis. pesan sudah dihapus user, atau lewat batas waktu).
 *
 * @param {object|null} loader - Hasil sendLoading
 * @param {import('telegraf').Context} ctx
 * @returns {Promise<void>}
 */
async function clearLoading(loader, ctx) {
  if (!loader || !loader.message_id) return;
  try {
    await ctx.telegram.deleteMessage(loader.chat.id, loader.message_id);
  } catch (err) {
    // Gagal hapus bukan masalah — abaikan diam-diam
  }
}

module.exports = { sendLoading, clearLoading, LOADING_TEXT };
