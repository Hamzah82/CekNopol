/**
 * ceknomor.js — Handler /ceknomor <nomorHP>
 * Cek data pemilik nomor HP via GetContact API
 */

const { formatNomor, formatError } = require('../utils/format');
const tokenManager = require('../services/tokenManager');
const cache = require('../services/cache');
const api = require('../services/api');
const refundService = require('../services/refundService');
const priceService = require('../services/priceService');
const logService = require('../services/logService');
const cooldownService = require('../services/cooldownService');
const serviceToggle = require('../services/serviceToggle');
const { sendLoading, clearLoading } = require('../utils/loading');

// Regex validasi nomor HP: 08xx atau +628xx (min 10 digit, max 15 digit)
const NOMOR_REGEX = /^(0|\+62)\d{8,13}$/;

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
 * Register handler /ceknomor
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('ceknomor', async (ctx) => {
    const userId = ctx.from.id;

    // Extract nomor dari argumen command
    const nomor = ctx.message.text.replace(/^\/ceknomor(@\w+)?\s*/, '').trim();

    // ─── Toggle layanan: enable / disable (main admin) ──────
    if (/^(enable|disable)(\s|$)/i.test(nomor)) {
      if (!isMainAdmin(userId)) {
        return; // bukan admin -> diam total, tanpa jejak
      }

      const aksi = nomor.toLowerCase().startsWith('enable') ? true : false;
      const hasil = serviceToggle.setEnabled('ceknomor', aksi);

      if (!hasil.success) {
        ctx.reply(formatError(hasil.error), { parse_mode: 'HTML' });
        return;
      }

      ctx.reply(
        (aksi ? '✅' : '🚫') +
          ` <b>Layanan nomor HP ${aksi ? 'DIAKTIFKAN' : 'DIMATIKAN'}</b>\n\n` +
          `Command: <code>/ceknomor</code>\n` +
          `<i>${aksi ? 'User sudah bisa memakai lagi.' : 'User tidak akan mendapat balasan apa pun.'}</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }


    // SETPRICE_BLOCK
    if (/^setprice(\s|$)/i.test(nomor)) {
      if (!isMainAdmin(userId)) {
        ctx.reply(formatError('Hanya <b>main admin</b> yang bisa mengatur harga layanan.'), { parse_mode: 'HTML' });
        return;
      }

      const nominalRaw = nomor.replace(/^setprice/i, '').trim();
      const current = priceService.getPrice('ceknomor');

      if (!nominalRaw) {
        ctx.reply(
          `⚙️ <b>Harga /ceknomor</b>\n\n` +
            `Harga saat ini: <b>${current}</b> token\n\n` +
            `Gunakan: <code>/ceknomor setprice &lt;jumlah token&gt;</code>\n` +
            `Contoh: <code>/ceknomor setprice 2</code>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const result = priceService.setPrice('ceknomor', nominalRaw);
      if (!result.success) {
        ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
        return;
      }

      ctx.reply(
        `✅ <b>Harga ceknomor diperbarui</b>\n\n` +
          `Harga lama: ${current} token\n` +
          `Harga baru: <b>${result.price}</b> token\n\n` +
          `<i>Berlaku untuk pemakaian /ceknomor berikutnya.</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── Layanan mati -> user biasa DIAM TOTAL (tanpa jejak) ───
    if (!serviceToggle.isEnabled('ceknomor') && !isMainAdmin(userId)) {
      return;
    }

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
    const price = priceService.getPrice('ceknomor');
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

    // Kirim pesan loading (dihapus setelah selesai)
    const loader = await sendLoading(ctx);

    // 4. Cek cache lokal dulu
    const nomorNormalized = cache.normalizeKey(nomor);
    const cachedData = cache.getCachedNomor(nomorNormalized);

    if (cachedData) {
      await clearLoading(loader, ctx);
      // Cache HIT → token (sesuai harga layanan) dialihkan dari user ke main admin + notifikasi
      const formatted = formatNomor(cachedData);
      ctx.reply(formatted, { parse_mode: 'HTML' });

      const { recipientId, notification } = refundService.transferCacheToken({
        userId,
        amount: price,
        command: '/ceknomor',
        query: nomor,
      });
      if (recipientId !== null) {
        ctx.telegram.sendMessage(recipientId, notification, { parse_mode: 'HTML' }).catch(() => {});
      }

      // Log ke grup (tanpa hasil pencarian)
      logService.sendLog(ctx.telegram, {
        userId,
        username: ctx.from.username || '',
        fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        service: 'Cek Nomor HP',
        serviceKey: 'ceknomor',
        command: '/ceknomor',
        query: String(nomor),
        cost: price,
        source: 'cache',
      }).catch(() => {});
      return;
    }

    // 5. Cache MISS → tembak API eksternal
    const result = await api.cekNomor(nomor);

    if (!result.success) {
      // API gagal atau data tidak ditemukan → JANGAN kurangi token
      // Log percobaan gagal (biaya tetap ditulis sesuai harga layanan)
      logService.sendLog(ctx.telegram, {
        userId,
        username: ctx.from.username || '',
        fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        service: 'Cek Nomor HP',
        serviceKey: 'ceknomor',
        command: '/ceknomor',
        query: String(nomor),
        cost: price,
        source: 'gagal',
        tokensRemaining: result.tokensRemaining,
      }).catch(() => {});

      await clearLoading(loader, ctx);

      ctx.reply(formatError(result.error || 'Data nomor HP tidak ditemukan.'), {
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
      service: 'Cek Nomor HP',
      serviceKey: 'ceknomor',
      command: '/ceknomor',
      query: String(nomor),
      cost: price,
      source: 'sukses',
      tokensRemaining: result.tokensRemaining,
    }).catch(() => {});
    cache.saveToCacheNomor(nomorNormalized, result.data);

    const formatted = formatNomor(result.data);
    ctx.reply(formatted, { parse_mode: 'HTML' });
  });
}

module.exports = { register, initSetupAdmins };