/**
 * ceknama.js — Handler /ceknama <nama>
 */

const { formatNama, formatError } = require('../utils/format');
const tokenManager = require('../services/tokenManager');
const cache = require('../services/cache');
const api = require('../services/api');
const refundService = require('../services/refundService');
const priceService = require('../services/priceService');
const logService = require('../services/logService');
const cooldownService = require('../services/cooldownService');
const serviceToggle = require('../services/serviceToggle');
const { sendLoading, clearLoading } = require('../utils/loading');

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

    // ─── Toggle layanan: enable / disable (main admin) ──────
    if (/^(enable|disable)(\s|$)/i.test(nama)) {
      if (!isMainAdmin(userId)) {
        return; // bukan admin -> diam total, tanpa jejak
      }

      const aksi = nama.toLowerCase().startsWith('enable') ? true : false;
      const hasil = serviceToggle.setEnabled('ceknama', aksi);

      if (!hasil.success) {
        ctx.reply(formatError(hasil.error), { parse_mode: 'HTML' });
        return;
      }

      ctx.reply(
        (aksi ? '✅' : '🚫') +
          ` <b>Layanan nama ${aksi ? 'DIAKTIFKAN' : 'DIMATIKAN'}</b>\n\n` +
          `Command: <code>/ceknama</code>\n` +
          `<i>${aksi ? 'User sudah bisa memakai lagi.' : 'User tidak akan mendapat balasan apa pun.'}</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }


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

    // ─── Layanan mati -> user biasa DIAM TOTAL (tanpa jejak) ───
    if (!serviceToggle.isEnabled('ceknama') && !isMainAdmin(userId)) {
      return;
    }

    // 1. Validasi input tidak kosong
    if (!nama) {
      ctx.reply(formatError('Masukkan nama yang ingin dicari.\n\nContoh: /ceknama JANICE'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // Anti-spam: batasi 1 permintaan per user tiap 10 detik
    const cd = cooldownService.check(userId);
    if (cd.blocked) {
      ctx.reply(
        formatError(
          `Terlalu cepat.

` +
            `Tunggu <b>${cd.remaining} detik</b> lagi sebelum memakai layanan berikutnya.`
        ),
        { parse_mode: 'HTML' }
      );
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

    // Saldo cukup — tandai cooldown
    cooldownService.mark(userId);

    // 3. Normalisasi nama (hapus spasi, uppercase)
    // Nama: kapital disamakan, tetapi spasi tetap dipertahankan
    const namaNormalized = cache.normalizeNamaKey(nama);

    // Kirim pesan loading (dihapus setelah selesai)
    const loader = await sendLoading(ctx);

    // 4. Cek cache lokal dulu
    const cachedData = cache.getCachedNama(namaNormalized);

    if (cachedData) {
      await clearLoading(loader, ctx);
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

      // Log ke grup (tanpa hasil pencarian)
      logService.sendLog(ctx.telegram, {
        userId,
        username: ctx.from.username || '',
        fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        service: 'Cek Nama',
        serviceKey: 'ceknama',
        command: '/ceknama',
        query: String(nama),
        cost: price,
        source: 'cache',
      }).catch(() => {});
      return;
    }

    // 5. Cache MISS → tembak API eksternal
    const result = await api.cekNama(nama);

    if (!result.success) {
      // API gagal atau data tidak ditemukan → JANGAN kurangi token
      // Log percobaan gagal (biaya tetap ditulis sesuai harga layanan)
      logService.sendLog(ctx.telegram, {
        userId,
        username: ctx.from.username || '',
        fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        service: 'Cek Nama',
        serviceKey: 'ceknama',
        command: '/ceknama',
        query: String(nama),
        cost: price,
        source: 'gagal',
        tokensRemaining: result.tokensRemaining,
      }).catch(() => {});

      await clearLoading(loader, ctx);

      ctx.reply(formatError(result.error || 'Data tidak ditemukan.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 6. API sukses → kurangi token, simpan ke cache, kirim data
    await clearLoading(loader, ctx);
    tokenManager.deductToken(userId, price);

    // Log ke grup (tanpa hasil pencarian)
    logService.sendLog(ctx.telegram, {
      userId,
      username: ctx.from.username || '',
      fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      service: 'Cek Nama',
      serviceKey: 'ceknama',
      command: '/ceknama',
      query: String(nama),
      cost: price,
      source: 'sukses',
      tokensRemaining: result.tokensRemaining,
    }).catch(() => {});
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