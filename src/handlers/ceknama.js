/**
 * ceknama.js — Handler /ceknama <nama>
 */

const { formatNama, formatError } = require('../utils/format');
const tokenManager = require('../services/tokenManager');
const cache = require('../services/cache');
const api = require('../services/api');
const refundService = require('../services/refundService');

/**
 * Register handler /ceknama
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('ceknama', async (ctx) => {
    const userId = ctx.from.id;

    // Extract nama dari argumen command
    const nama = ctx.message.text.replace(/^\/ceknama(@\w+)?\s*/, '').trim();

    // 1. Validasi input tidak kosong
    if (!nama) {
      ctx.reply(formatError('Masukkan nama yang ingin dicari.\n\nContoh: /ceknama JANICE'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 2. Cek saldo token
    const balance = tokenManager.getTokenBalance(userId);
    if (balance <= 0) {
      ctx.reply(formatError('Saldo token tidak mencukupi.\nHubungi admin untuk menambah token.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 3. Normalisasi nama (hapus spasi, uppercase)
    const namaNormalized = cache.normalizeKey(nama);

    // Kirim typing indicator
    await ctx.sendChatAction('typing');

    // 4. Cek cache lokal dulu
    const cachedData = cache.getCachedNama(namaNormalized);

    if (cachedData) {
      // Cache HIT → token TIDAK dimusnahkan, refund ke main admin + notifikasi
      const dataList = cachedData.data;
      const total = cachedData.total;

      for (let i = 0; i < dataList.length; i++) {
        const formatted = formatNama(dataList[i]);
        await ctx.reply(formatted, { parse_mode: 'HTML' });
      }

      if (total > 1) {
        await ctx.reply(
          `📊 Total hasil: <b>${total}</b> data ditemukan.\n<i>📦 Data dari cache (${new Date(cachedData.cachedAt).toLocaleString('id-ID')})</i>`,
          { parse_mode: 'HTML' }
        );
      }

      const { notification } = refundService.refundCacheToken({
        userId,
        command: '/ceknama',
        query: nama,
      });
      for (const adminId of refundService.getMainAdmins()) {
        ctx.telegram.sendMessage(adminId, notification, { parse_mode: 'HTML' }).catch(() => {});
      }
      return;
    }

    // 5. Cache MISS → tembak API eksternal
    const result = await api.cekNama(nama);

    if (!result.success) {
      // API gagal atau data tidak ditemukan → JANGAN kurangi token
      ctx.reply(formatError(result.error || 'Data tidak ditemukan.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 6. API sukses → kurangi token, simpan ke cache, kirim data
    tokenManager.deductToken(userId, 1);
    cache.saveToCacheNama(namaNormalized, { total: result.total, data: result.data });

    const total = result.total;
    const dataList = result.data;

    for (let i = 0; i < dataList.length; i++) {
      const formatted = formatNama(dataList[i]);
      await ctx.reply(formatted, { parse_mode: 'HTML' });
    }

    if (total > 1) {
      await ctx.reply(`📊 Total hasil: <b>${total}</b> data ditemukan.`, { parse_mode: 'HTML' });
    }
  });
}

module.exports = { register };