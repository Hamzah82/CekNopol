/**
 * nik2kk.js — Handler /nik2kk <NIK>
 * Mencari data kependudukan berdasarkan NIK 16 digit
 */

const { formatNik2kk, formatError } = require('../utils/format');
const tokenManager = require('../services/tokenManager');
const cache = require('../services/cache');
const api = require('../services/api');
const refundService = require('../services/refundService');
const priceService = require('../services/priceService');

// Regex validasi NIK: 16 digit angka
const NIK_REGEX = /^\d{16}$/;

/** @type {number[]} */
let setupAdminIds = [];

/**
 * Inisialisasi admin IDs dari setup.json (main admin)
 * @param {number[]} ids
 */
function initSetupAdmins(ids) {
  setupAdminIds = ids || [];
}

/**
 * Cek apakah user adalah main admin (dari setup.json)
 * @param {number} userId
 * @returns {boolean}
 */
function isMainAdmin(userId) {
  return setupAdminIds.includes(Number(userId));
}

/**
 * Register handler /nik2kk
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('nik2kk', async (ctx) => {
    const userId = ctx.from.id;

    // Extract NIK dari argumen command
    const nik = ctx.message.text.replace(/^\/nik2kk(@\w+)?\s*/, '').trim();

    // SETPRICE_BLOCK
    if (/^setprice(\s|$)/i.test(nik)) {
      if (!isMainAdmin(userId)) {
        ctx.reply(formatError('Hanya <b>main admin</b> yang bisa mengatur harga layanan.'), { parse_mode: 'HTML' });
        return;
      }

      const nominalRaw = nik.replace(/^setprice/i, '').trim();
      const current = priceService.getPrice('nik2kk');

      if (!nominalRaw) {
        ctx.reply(
          `⚙️ <b>Harga /nik2kk</b>\n\n` +
            `Harga saat ini: <b>${current}</b> token\n\n` +
            `Gunakan: <code>/nik2kk setprice &lt;jumlah token&gt;</code>\n` +
            `Contoh: <code>/nik2kk setprice 2</code>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const result = priceService.setPrice('nik2kk', nominalRaw);
      if (!result.success) {
        ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
        return;
      }

      ctx.reply(
        `✅ <b>Harga nik2kk diperbarui</b>\n\n` +
          `Harga lama: ${current} token\n` +
          `Harga baru: <b>${result.price}</b> token\n\n` +
          `<i>Berlaku untuk pemakaian /nik2kk berikutnya.</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // 1. Validasi input tidak kosong
    if (!nik) {
      ctx.reply(formatError('Masukkan NIK 16 digit.\n\nContoh: /nik2kk 127703XXXXXXX006'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 2. Validasi format NIK (harus 16 digit angka)
    if (!NIK_REGEX.test(nik)) {
      ctx.reply(formatError('Format NIK tidak valid. NIK harus 16 digit angka.\n\nContoh: /nik2kk 127703XXXXXXX006'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // Cek saldo token (harga sesuai layanan)
    const price = priceService.getPrice('nik2kk');
    const balance = tokenManager.getTokenBalance(userId);
    if (balance < price) {
      ctx.reply(
        formatError(
          `Saldo token tidak mencukupi.

` +
            `Harga layanan ini: <b>${price}</b> token
` +
            `Saldo kamu: <b>${balance}</b> token

` +
            `Top-up dengan <code>/buy &lt;jumlah&gt;</code>`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Kirim typing indicator
    await ctx.sendChatAction('typing');

    // 4. Cek cache lokal dulu
    const cachedData = cache.getCachedNik2kk(nik);

    if (cachedData) {
      // Cache HIT → token (sesuai harga layanan) dialihkan dari user ke main admin + notifikasi
      const formatted = formatNik2kk(cachedData);
      ctx.reply(formatted, { parse_mode: 'HTML' });

      const { recipientId, notification } = refundService.transferCacheToken({
        userId,
        amount: price,
        command: '/nik2kk',
        query: nik,
      });
      if (recipientId !== null) {
        ctx.telegram.sendMessage(recipientId, notification, { parse_mode: 'HTML' }).catch(() => {});
      }
      return;
    }

    // 5. Cache MISS → tembak API eksternal
    const result = await api.cekNik2kk(nik);

    if (!result.success) {
      // API gagal atau data tidak ditemukan → JANGAN kurangi token
      ctx.reply(formatError(result.error || 'Data NIK tidak ditemukan.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 6. API sukses → kurangi token, simpan ke cache, kirim data
    tokenManager.deductToken(userId, price);
    cache.saveToCacheNik2kk(nik, result.data);

    const formatted = formatNik2kk(result.data);
    ctx.reply(formatted, { parse_mode: 'HTML' });
  });
}

module.exports = { register, initSetupAdmins };