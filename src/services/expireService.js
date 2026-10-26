/**
 * expireService.js — Pembersih order kedaluwarsa
 *
 * Order yang masih berstatus menunggu (belum kirim bukti atau belum
 * diverifikasi) dan umurnya melewati batas akan ditandai 'kedaluwarsa'.
 *
 * User diberi tahu lebih dulu, baru statusnya diubah — supaya kalau
 * pengiriman notifikasi gagal, order tidak hilang diam-diam.
 */

const orderService = require('./orderService');

/** Interval pemeriksaan (ms) — 10 menit */
const INTERVAL_MS = 10 * 60 * 1000;

/** Timer agar tidak dobel saat register dipanggil berkali-kali */
let timer = null;

/**
 * Format rupiah
 * @param {number} n
 * @returns {string}
 */
function rupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

/**
 * Periksa & tandai order kedaluwarsa, lalu beri tahu user.
 *
 * @param {object} telegram - bot.telegram
 * @returns {Promise<number>} jumlah order yang kedaluwarsa
 */
async function prosesKedaluwarsa(telegram) {
  const daftar = orderService.getExpiredOrders();
  if (!daftar.length) return 0;

  const berhasilDiberiTahu = [];

  for (const o of daftar) {
    try {
      await telegram.sendMessage(
        o.userId,
        `⏰ <b>Pembayaran kedaluwarsa</b>\n\n` +
          `<b>Order ID:</b> <code>${o.id}</code>\n` +
          `<b>Jumlah:</b> ${o.amount} token\n` +
          `<b>Total:</b> ${rupiah(o.total)}\n\n` +
          `Order ini melewati batas waktu <b>${orderService.ORDER_EXPIRE_HOURS} jam</b> ` +
          `dan otomatis dibatalkan. Token tidak terpotong, tidak ada dana yang hangus.\n\n` +
          `Kalau masih ingin membeli, silakan buat order baru dengan ` +
          `<code>/buy &lt;jumlah&gt;</code>.`,
        { parse_mode: 'HTML' }
      );
      berhasilDiberiTahu.push(o.id);
    } catch (err) {
      // Gagal kirim (mis. diblokir) -> tetap tandai kedaluwarsa
      console.error(`[expire] gagal notifikasi user ${o.userId}:`, err.message);
      berhasilDiberiTahu.push(o.id);
    }
  }

  const n = orderService.markExpired(berhasilDiberiTahu);
  if (n > 0) {
    console.log(`[expire] ${n} order ditandai kedaluwarsa`);
  }
  return n;
}

/**
 * Jalankan pemeriksaan berkala.
 *
 * @param {import('telegraf').Telegraf} bot
 */
function mulaiPembersih(bot) {
  if (timer) return;

  // Pemeriksaan pertama setelah 1 menit bot hidup
  setTimeout(() => {
    prosesKedaluwarsa(bot.telegram).catch((err) =>
      console.error('[expire] gagal proses awal:', err.message)
    );
  }, 60 * 1000);

  timer = setInterval(() => {
    prosesKedaluwarsa(bot.telegram).catch((err) =>
      console.error('[expire] gagal proses berkala:', err.message)
    );
  }, INTERVAL_MS);

  // Jangan menahan proses tetap hidup hanya karena timer ini
  if (timer.unref) timer.unref();

  console.log(`⏰ Pembersih order kedaluwarsa aktif (batas ${orderService.ORDER_EXPIRE_HOURS} jam)`);
}

/**
 * Hentikan pemeriksaan berkala (untuk shutdown)
 */
function hentikanPembersih() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  INTERVAL_MS,
  prosesKedaluwarsa,
  mulaiPembersih,
  hentikanPembersih,
};