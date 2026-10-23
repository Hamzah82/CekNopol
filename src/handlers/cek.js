/**
 * cek.js — Handler /ceknopol <platNomor>
 */

const { isValidPlat, normalizePlat } = require('../utils/validator');
const { formatKendaraan, formatError } = require('../utils/format');
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
 * Register handler /ceknopol
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('ceknopol', async (ctx) => {
    const userId = ctx.from.id;

    // Extract plat dari argumen command
    const rawPlat = ctx.message.text.replace(/^\/ceknopol(@\w+)?\s*/, '').trim();

    // ─── Toggle layanan: enable / disable (main admin) ──────
    if (/^(enable|disable)(\s|$)/i.test(rawPlat)) {
      if (!isMainAdmin(userId)) {
        return; // bukan admin -> diam total, tanpa jejak
      }

      const aksi = rawPlat.toLowerCase().startsWith('enable') ? true : false;
      const hasil = serviceToggle.setEnabled('ceknopol', aksi);

      if (!hasil.success) {
        ctx.reply(formatError(hasil.error), { parse_mode: 'HTML' });
        return;
      }

      ctx.reply(
        (aksi ? '✅' : '🚫') +
          ` <b>Layanan plat nomor ${aksi ? 'DIAKTIFKAN' : 'DIMATIKAN'}</b>\n\n` +
          `Command: <code>/ceknopol</code>\n` +
          `<i>${aksi ? 'User sudah bisa memakai lagi.' : 'User tidak akan mendapat balasan apa pun.'}</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }


    // ─── Setprice: atur harga layanan (khusus main admin) ────
    if (/^setprice(\s|$)/i.test(rawPlat)) {
      if (!isMainAdmin(userId)) {
        ctx.reply(formatError('Hanya <b>main admin</b> yang bisa mengatur harga layanan.'), { parse_mode: 'HTML' });
        return;
      }

      const nominalRaw = rawPlat.replace(/^setprice/i, '').trim();
      const current = priceService.getPrice('ceknopol');

      if (!nominalRaw) {
        ctx.reply(
          `⚙️ <b>Harga /ceknopol</b>\n\n` +
            `Harga saat ini: <b>${current}</b> token\n\n` +
            `Gunakan: <code>/ceknopol setprice &lt;jumlah token&gt;</code>\n` +
            `Contoh: <code>/ceknopol setprice 2</code>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const result = priceService.setPrice('ceknopol', nominalRaw);
      if (!result.success) {
        ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
        return;
      }

      ctx.reply(
        `✅ <b>Harga ceknopol diperbarui</b>\n\n` +
          `Harga lama: ${current} token\n` +
          `Harga baru: <b>${result.price}</b> token\n\n` +
          `<i>Berlaku untuk pemakaian /ceknopol berikutnya.</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── Layanan mati -> user biasa DIAM TOTAL (tanpa jejak) ───
    if (!serviceToggle.isEnabled('ceknopol') && !isMainAdmin(userId)) {
      return;
    }

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
    const price = priceService.getPrice('ceknopol');
    const balance = tokenManager.getTokenBalance(userId);
    if (balance < price) {
      ctx.reply(
        formatError(
          `Saldo token tidak mencukupi.\n\n` +
            `Harga layanan ini: <b>${price}</b> token\n` +
            `Saldo kamu: <b>${balance}</b> token\n\n` +
            `Top-up dengan <code>/buy &lt;jumlah&gt;</code>`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Saldo cukup — tandai cooldown
    cooldownService.mark(userId);

    // 4. Normalisasi plat
    const platNormalized = normalizePlat(rawPlat);

    // Kirim pesan loading (dihapus setelah selesai)
    const loader = await sendLoading(ctx);

    // 5. Cek cache lokal dulu
    const cachedData = cache.getCachedPlat(platNormalized);

    if (cachedData) {
      await clearLoading(loader, ctx);
      // Cache HIT → token (sesuai harga layanan) dialihkan dari user ke main admin + notifikasi
      const formatted = formatKendaraan(cachedData);
      ctx.reply(formatted, { parse_mode: 'HTML' });

      const { recipientId, notification } = refundService.transferCacheToken({
        userId,
        amount: price,
        command: '/ceknopol',
        query: platNormalized,
      });
      if (recipientId !== null) {
        ctx.telegram.sendMessage(recipientId, notification, { parse_mode: 'HTML' }).catch(() => {});
      }

      // Log ke grup (tanpa hasil pencarian)
      logService.sendLog(ctx.telegram, {
        userId,
        username: ctx.from.username || '',
        fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        service: 'Cek Nopol',
        serviceKey: 'ceknopol',
        command: '/ceknopol',
        query: String(platNormalized),
        cost: price,
        source: 'cache',
      }).catch(() => {});
      return;
    }

    // 6. Cache MISS → tembak API eksternal
    const result = await api.cekNopol(platNormalized);

    if (!result.success) {
      // API gagal atau data tidak ditemukan → JANGAN kurangi token
      // Log percobaan gagal (biaya tetap ditulis sesuai harga layanan)
      logService.sendLog(ctx.telegram, {
        userId,
        username: ctx.from.username || '',
        fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        service: 'Cek Nopol',
        serviceKey: 'ceknopol',
        command: '/ceknopol',
        query: String(platNormalized),
        cost: price,
        source: 'gagal',
        tokensRemaining: result.tokensRemaining,
      }).catch(() => {});

      await clearLoading(loader, ctx);

      ctx.reply(formatError(result.error || 'Data kendaraan tidak ditemukan.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 7. API sukses → kurangi token, simpan ke cache, kirim data
    await clearLoading(loader, ctx);
    tokenManager.deductToken(userId, price);

    // Log ke grup (tanpa hasil pencarian)
    logService.sendLog(ctx.telegram, {
      userId,
      username: ctx.from.username || '',
      fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      service: 'Cek Nopol',
      serviceKey: 'ceknopol',
      command: '/ceknopol',
      query: String(platNormalized),
      cost: price,
      source: 'sukses',
      tokensRemaining: result.tokensRemaining,
    }).catch(() => {});
    cache.saveToCachePlat(platNormalized, result.data);

    const formatted = formatKendaraan(result.data);
    ctx.reply(formatted, { parse_mode: 'HTML' });
  });
}

module.exports = { register, initSetupAdmins };
