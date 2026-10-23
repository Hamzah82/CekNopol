/**
 * cekkk.js — Handler /cekKK <noKK>
 *
 * Cek data Kartu Keluarga (seluruh anggota keluarga).
 *
 * Aturan tampilan:
 *   - Ada data KK terbaru  -> HANYA kirim data terbaru
 *   - Data terbaru kosong  -> kirim data lama (maksimal 3 entri)
 *
 * Cache menyimpan KEDUANYA (kk_terbaru & kk_lama).
 *
 * Subcommand admin (hanya main admin):
 *   /cekKK setprice <n>
 */

const { formatCekKK, formatError, formatSuccess } = require('../utils/format');
const tokenManager = require('../services/tokenManager');
const cache = require('../services/cache');
const api = require('../services/api');
const refundService = require('../services/refundService');
const priceService = require('../services/priceService');
const logService = require('../services/logService');
const cooldownService = require('../services/cooldownService');
const serviceToggle = require('../services/serviceToggle');
const { sendLoading, clearLoading } = require('../utils/loading');

// Nomor KK: 16 digit angka
const KK_REGEX = /^\d{16}$/;

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
 * Register handler /cekKK
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.command('cekKK', async (ctx) => {
    const userId = ctx.from.id;

    const arg = ctx.message.text.replace(/^\/cekKK(@\w+)?\s*/i, '').trim();

    // ─── Toggle layanan: enable / disable (main admin) ──────
    if (/^(enable|disable)(\s|$)/i.test(arg)) {
      if (!isMainAdmin(userId)) {
        return; // bukan admin -> diam total, tanpa jejak
      }

      const aksi = arg.toLowerCase().startsWith('enable') ? true : false;
      const hasil = serviceToggle.setEnabled('cekkk', aksi);

      if (!hasil.success) {
        ctx.reply(formatError(hasil.error), { parse_mode: 'HTML' });
        return;
      }

      ctx.reply(
        (aksi ? '✅' : '🚫') +
          ` <b>Layanan nomor KK ${aksi ? 'DIAKTIFKAN' : 'DIMATIKAN'}</b>\n\n` +
          `Command: <code>/cekKK</code>\n` +
          `<i>${aksi ? 'User sudah bisa memakai lagi.' : 'User tidak akan mendapat balasan apa pun.'}</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }


    // ─── Setprice: atur harga layanan (khusus main admin) ────
    if (/^setprice(\s|$)/i.test(arg)) {
      if (!isMainAdmin(userId)) {
        ctx.reply(formatError('Hanya <b>main admin</b> yang bisa mengatur harga layanan.'), {
          parse_mode: 'HTML',
        });
        return;
      }

      const nominalRaw = arg.replace(/^setprice/i, '').trim();
      const current = priceService.getPrice('cekkk');

      if (!nominalRaw) {
        ctx.reply(
          `⚙️ <b>Harga Cek KK</b>\n\n` +
            `Harga saat ini: <b>${current}</b> token\n\n` +
            `Gunakan: <code>/cekKK setprice &lt;jumlah token&gt;</code>\n` +
            `Contoh: <code>/cekKK setprice 2</code>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const result = priceService.setPrice('cekkk', nominalRaw);
      if (!result.success) {
        ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
        return;
      }

      ctx.reply(
        `✅ <b>Harga Cek KK diperbarui</b>\n\n` +
          `Harga lama: ${current} token\n` +
          `Harga baru: <b>${result.price}</b> token\n\n` +
          `<i>Berlaku untuk pemakaian /cekKK berikutnya.</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── Layanan mati -> user biasa DIAM TOTAL (tanpa jejak) ───
    if (!serviceToggle.isEnabled('cekkk') && !isMainAdmin(userId)) {
      return;
    }

    // ─── Validasi input ─────────────────────────────────────
    if (!arg) {
      ctx.reply(formatError('Masukkan nomor KK 16 digit.\n\nContoh: /cekKK 127703XXXXXXX003'), {
        parse_mode: 'HTML',
      });
      return;
    }

    if (!KK_REGEX.test(arg)) {
      ctx.reply(
        formatError('Format nomor KK tidak valid. Harus 16 digit angka.\n\nContoh: /cekKK 127703XXXXXXX003'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── Anti-spam ──────────────────────────────────────────
    const cd = cooldownService.check(userId);
    if (cd.blocked) {
      ctx.reply(
        formatError(
          `Terlalu cepat.\n\n` + `Tunggu <b>${cd.remaining} detik</b> lagi sebelum memakai layanan berikutnya.`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── Cek saldo ──────────────────────────────────────────
    const price = priceService.getPrice('cekkk');
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

    const nokkNormalized = cache.normalizeKey(arg);

    // Kirim pesan loading (dihapus setelah selesai)
    const loader = await sendLoading(ctx);

    // ─── Cek cache ──────────────────────────────────────────
    const cachedData = cache.getCachedKK(nokkNormalized);

    if (cachedData) {
      await clearLoading(loader, ctx);

      const text = formatCekKK(cachedData, { cachedAt: cachedData.cachedAt });

      // Telegram membatasi 4096 karakter per pesan
      for (const chunk of splitMessage(text)) {
        await ctx.reply(chunk, { parse_mode: 'HTML' });
      }

      const { recipientId, notification } = refundService.transferCacheToken({
        userId,
        amount: price,
        command: '/cekKK',
        query: arg,
      });
      if (recipientId !== null) {
        ctx.telegram.sendMessage(recipientId, notification, { parse_mode: 'HTML' }).catch(() => {});
      }

      // Log ke grup (tanpa hasil pencarian)
      logService
        .sendLog(ctx.telegram, {
          userId,
          username: ctx.from.username || '',
          fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
          service: 'Cek KK',
          serviceKey: 'cekkk',
          command: '/cekKK',
          query: String(arg),
          cost: price,
          source: 'cache',
        })
        .catch(() => {});
      return;
    }

    // ─── Cache MISS → tembak API ────────────────────────────
    const result = await api.cekKK(arg);

    if (!result.success) {
      await clearLoading(loader, ctx);

      logService
        .sendLog(ctx.telegram, {
          userId,
          username: ctx.from.username || '',
          fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
          service: 'Cek KK',
          serviceKey: 'cekkk',
          command: '/cekKK',
          query: String(arg),
          cost: price,
          source: 'gagal',
          tokensRemaining: result.tokensRemaining,
        })
        .catch(() => {});

      ctx.reply(formatError(result.error || 'Data KK tidak ditemukan.'), { parse_mode: 'HTML' });
      return;
    }

    // ─── Sukses: potong token, simpan cache (keduanya), kirim data ──
    await clearLoading(loader, ctx);
    tokenManager.deductToken(userId, price);

    // Simpan KEDUA bagian ke cache
    cache.saveToCacheKK(nokkNormalized, {
      kk_terbaru: result.data.kk_terbaru,
      kk_lama: result.data.kk_lama,
    });

    const text = formatCekKK(result.data);
    for (const chunk of splitMessage(text)) {
      await ctx.reply(chunk, { parse_mode: 'HTML' });
    }

    logService
      .sendLog(ctx.telegram, {
        userId,
        username: ctx.from.username || '',
        fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        service: 'Cek KK',
        serviceKey: 'cekkk',
        command: '/cekKK',
        query: String(arg),
        cost: price,
        source: 'sukses',
        tokensRemaining: result.tokensRemaining,
      })
      .catch(() => {});
  });
}

/**
 * Pecah pesan agar tidak melebihi batas Telegram (4096 karakter).
 * Memecah di batas baris agar HTML tidak terpotong di tengah tag.
 *
 * @param {string} text
 * @param {number} [limit]
 * @returns {string[]}
 */
function splitMessage(text, limit = 3900) {
  if (text.length <= limit) return [text];

  const lines = text.split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if ((current + '\n' + line).length > limit) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);

  return chunks.length ? chunks : [text];
}

module.exports = { register, initSetupAdmins };
