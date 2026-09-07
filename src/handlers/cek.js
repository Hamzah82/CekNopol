/**
 * cek.js — Handler /ceknopol <platNomor>
 */

const { isValidPlat, normalizePlat } = require('../utils/validator');
const { formatKendaraan, formatError } = require('../utils/format');
const tokenManager = require('../services/tokenManager');
const cache = require('../services/cache');
const api = require('../services/api');
const refundService = require('../services/refundService');

/**
 * Register handler /ceknopol
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('ceknopol', async (ctx) => {
    const userId = ctx.from.id;

    // Extract plat dari argumen command
    const rawPlat = ctx.message.text.replace(/^\/ceknopol(@\w+)?\s*/, '').trim();

    // 1. Validasi input tidak kosong
    if (!rawPlat) {
      ctx.reply(formatError('Masukkan plat nomor.\n\nContoh: /ceknopol B1234XYZ'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 2. Validasi format plat
    if (!isValidPlat(rawPlat)) {
      ctx.reply(
        formatError('Format plat tidak valid.\n\nContoh yang benar:\n• B1234XYZ\n• D 1234 ABC\n• AB123CD'),
        { parse_mode: 'HTML' }
      );
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

    // 4. Normalisasi plat
    const platNormalized = normalizePlat(rawPlat);

    // Kirim typing indicator
    await ctx.sendChatAction('typing');

    // 5. Cek cache lokal dulu
    const cachedData = cache.getCachedPlat(platNormalized);

    if (cachedData) {
      // Cache HIT → token TIDAK dimusnahkan, refund ke main admin + notifikasi
      const formatted = formatKendaraan(cachedData);
      ctx.reply(formatted, { parse_mode: 'HTML' });

      const { notification } = refundService.refundCacheToken({
        userId,
        command: '/ceknopol',
        query: platNormalized,
      });
      for (const adminId of refundService.getMainAdmins()) {
        ctx.telegram.sendMessage(adminId, notification, { parse_mode: 'HTML' }).catch(() => {});
      }
      return;
    }

    // 6. Cache MISS → tembak API eksternal
    const result = await api.cekNopol(platNormalized);

    if (!result.success) {
      // API gagal atau data tidak ditemukan → JANGAN kurangi token
      ctx.reply(formatError(result.error || 'Data kendaraan tidak ditemukan.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 7. API sukses → kurangi token, simpan ke cache, kirim data
    tokenManager.deductToken(userId, 1);
    cache.saveToCachePlat(platNormalized, result.data);

    const formatted = formatKendaraan(result.data);
    ctx.reply(formatted, { parse_mode: 'HTML' });
  });
}

module.exports = { register };
