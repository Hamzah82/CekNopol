/**
 * nik2kk.js — Handler /nik2kk <NIK>
 * Mencari data kependudukan berdasarkan NIK 16 digit
 */

const { formatNik2kk, formatError } = require('../utils/format');
const tokenManager = require('../services/tokenManager');
const cache = require('../services/cache');
const api = require('../services/api');
const refundService = require('../services/refundService');

// Regex validasi NIK: 16 digit angka
const NIK_REGEX = /^\d{16}$/;

/**
 * Register handler /nik2kk
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('nik2kk', async (ctx) => {
    const userId = ctx.from.id;

    // Extract NIK dari argumen command
    const nik = ctx.message.text.replace(/^\/nik2kk(@\w+)?\s*/, '').trim();

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

    // 3. Cek saldo token
    const balance = tokenManager.getTokenBalance(userId);
    if (balance <= 0) {
      ctx.reply(formatError('Saldo token tidak mencukupi.\nHubungi admin untuk menambah token.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // Kirim typing indicator
    await ctx.sendChatAction('typing');

    // 4. Cek cache lokal dulu
    const cachedData = cache.getCachedNik2kk(nik);

    if (cachedData) {
      // Cache HIT → 1 token dialihkan dari user ke main admin + notifikasi
      const formatted = formatNik2kk(cachedData);
      ctx.reply(formatted, { parse_mode: 'HTML' });

      const { recipientId, notification } = refundService.transferCacheToken({
        userId,
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
    tokenManager.deductToken(userId, 1);
    cache.saveToCacheNik2kk(nik, result.data);

    const formatted = formatNik2kk(result.data);
    ctx.reply(formatted, { parse_mode: 'HTML' });
  });
}

module.exports = { register };