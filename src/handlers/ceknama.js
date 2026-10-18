/**
 * ceknama.js — Handler /ceknama <nama>
 */

const { formatNama, formatError } = require('../utils/format');
const tokenManager = require('../services/tokenManager');
const cache = require('../services/cache');
const api = require('../services/api');
const refundService = require('../services/refundService');
const priceService = require('../services/priceService');

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
 * Register handler /ceknama
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('ceknama', async (ctx) => {
    const userId = ctx.from.id;

    // Extract nama dari argumen command
    const nama = ctx.message.text.replace(/^\/ceknama(@\w+)?\s*/, '').trim();

    // SETPRICE_BLOCK
    if (/^setprice(\s|$)/i.test(nama)) {
      if (!isMainAdmin(userId)) {
        ctx.reply(formatError('Hanya <b>main admin</b> yang bisa mengatur harga layanan.'), { parse_mode: 'HTML' });
        return;
      }

      const nominalRaw = nama.replace(/^setprice/i, '').trim();
      const current = priceService.getPrice('ceknama');

      if (!nominalRaw) {
        ctx.reply(
          `⚙️ <b>Harga /ceknama</b>\n\n` +
            `Harga saat ini: <b>${current}</b> token\n\n` +
            `Gunakan: <code>/ceknama setprice &lt;jumlah token&gt;</code>\n` +
            `Contoh: <code>/ceknama setprice 2</code>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const result = priceService.setPrice('ceknama', nominalRaw);
      if (!result.success) {
        ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
        return;
      }

      ctx.reply(
        `✅ <b>Harga ceknama diperbarui</b>\n\n` +
          `Harga lama: ${current} token\n` +
          `Harga baru: <b>${result.price}</b> token\n\n` +
          `<i>Berlaku untuk pemakaian /ceknama berikutnya.</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // 1. Validasi input tidak kosong
    if (!nama) {
      ctx.reply(formatError('Masukkan nama yang ingin dicari.\n\nContoh: /ceknama JANICE'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // Cek saldo token (harga sesuai layanan)
    const price = priceService.getPrice('ceknama');
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

    // 3. Normalisasi nama (hapus spasi, uppercase)
    const namaNormalized = cache.normalizeKey(nama);

    // Kirim typing indicator
    await ctx.sendChatAction('typing');

    // 4. Cek cache lokal dulu
    const cachedData = cache.getCachedNama(namaNormalized);

    if (cachedData) {
      // Cache HIT → token (sesuai harga layanan) dialihkan dari user ke main admin + notifikasi
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

      const { recipientId, notification } = refundService.transferCacheToken({
        userId,
        amount: price,
        command: '/ceknama',
        query: nama,
      });
      if (recipientId !== null) {
        ctx.telegram.sendMessage(recipientId, notification, { parse_mode: 'HTML' }).catch(() => {});
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
    tokenManager.deductToken(userId, price);
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

module.exports = { register, initSetupAdmins };