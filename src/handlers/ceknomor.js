/**
 * ceknomor.js — Handler /ceknomor <nomorHP>
 * Cek data pemilik nomor HP via GetContact API
 */

const { formatNomor, formatError } = require('../utils/format');
const tokenManager = require('../services/tokenManager');
const cache = require('../services/cache');
const api = require('../services/api');
const refundService = require('../services/refundService');

// Regex validasi nomor HP: 08xx atau +628xx (min 10 digit, max 15 digit)
const NOMOR_REGEX = /^(0|\+62)\d{8,13}$/;

/**
 * Register handler /ceknomor
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('ceknomor', async (ctx) => {
    const userId = ctx.from.id;

    // Extract nomor dari argumen command
    const nomor = ctx.message.text.replace(/^\/ceknomor(@\w+)?\s*/, '').trim();

    // 1. Validasi input tidak kosong
    if (!nomor) {
      ctx.reply(formatError('Masukkan nomor HP yang ingin dicek.\n\nContoh: /ceknomor 0812XXXXXXX89'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 2. Validasi format nomor HP
    if (!NOMOR_REGEX.test(nomor)) {
      ctx.reply(formatError('Format nomor HP tidak valid.\nGunakan format 08xx atau +628xx (min 10 digit).\n\nContoh: /ceknomor 0812XXXXXXX89'), {
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
    const nomorNormalized = cache.normalizeKey(nomor);
    const cachedData = cache.getCachedNomor(nomorNormalized);

    if (cachedData) {
      // Cache HIT → 1 token dialihkan dari user ke main admin + notifikasi
      const formatted = formatNomor(cachedData);
      ctx.reply(formatted, { parse_mode: 'HTML' });

      const { recipientId, notification } = refundService.transferCacheToken({
        userId,
        command: '/ceknomor',
        query: nomor,
      });
      if (recipientId !== null) {
        ctx.telegram.sendMessage(recipientId, notification, { parse_mode: 'HTML' }).catch(() => {});
      }
      return;
    }

    // 5. Cache MISS → tembak API eksternal
    const result = await api.cekNomor(nomor);

    if (!result.success) {
      // API gagal atau data tidak ditemukan → JANGAN kurangi token
      ctx.reply(formatError(result.error || 'Data nomor HP tidak ditemukan.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 6. API sukses → kurangi token, simpan ke cache, kirim data
    tokenManager.deductToken(userId, 1);
    cache.saveToCacheNomor(nomorNormalized, result.data);

    const formatted = formatNomor(result.data);
    ctx.reply(formatted, { parse_mode: 'HTML' });
  });
}

module.exports = { register };