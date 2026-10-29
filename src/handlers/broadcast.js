/**
 * broadcast.js — Handler /broadcast dengan klasifikasi penerima
 *
 * Cara pakai:
 *   1. Admin reply pesan yang ingin disebar
 *   2. Ketik salah satu:
 *        /broadcast          -> SEMUA user terdaftar
 *        /broadcast user     -> hanya user yang TIDAK punya seller
 *        /broadcast seller   -> hanya seller terdaftar
 *        /broadcast reseller -> hanya reseller terdaftar
 *
 * "user" = user yang langsung bergabung tanpa lewat link seller/reseller.
 *
 * Penerima diambil dari users.json (pernah /start), bukan tokens.json,
 * supaya user yang belum pernah beli tetap menerima.
 *
 * Bisa dijalankan SEMUA admin (main admin & db/admin.json).
 */

const userService = require('../services/userService');
const roleManager = require('../services/roleManager');
const sellerService = require('../services/sellerService');
const resellerService = require('../services/resellerService');
const { formatError } = require('../utils/format');

/** Jeda antar kirim (ms) agar tidak kena rate limit Telegram */
const DELAY_MS = 60;

/** Mode broadcast yang didukung */
const MODES = {
  all: { label: 'SEMUA USER', deskripsi: 'seluruh user terdaftar' },
  user: { label: 'USER TANPA SELLER', deskripsi: 'user yang tidak diundang seller/reseller' },
  seller: { label: 'SELLER', deskripsi: 'seluruh seller terdaftar' },
  reseller: { label: 'RESELLER', deskripsi: 'seluruh reseller terdaftar' },
};

/** @type {number[]} */
let setupAdminIds = [];

/**
 * Inisialisasi admin IDs dari setup.json
 * @param {number[]} ids
 */
function initSetupAdmins(ids) {
  setupAdminIds = ids || [];
}

/**
 * Cek apakah user admin (setup.json ATAU db/admin.json)
 * @param {number} userId
 * @returns {boolean}
 */
function isAnyAdmin(userId) {
  return setupAdminIds.includes(Number(userId)) || roleManager.isAdmin(userId);
}

/**
 * Jeda
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ambil daftar ID penerima sesuai mode.
 *
 * @param {string} mode - 'all' | 'user' | 'seller' | 'reseller'
 * @param {number} pengirimId - admin yang menjalankan (tidak dikirimi)
 * @returns {number[]}
 */
function ambilPenerima(mode, pengirimId) {
  const kecuali = Number(pengirimId);

  if (mode === 'seller') {
    return sellerService
      .getAllSellers()
      .map((s) => Number(s.userId))
      .filter((id) => Number.isFinite(id) && id !== kecuali);
  }

  if (mode === 'reseller') {
    return resellerService
      .getAllResellers()
      .map((r) => Number(r.userId))
      .filter((id) => Number.isFinite(id) && id !== kecuali);
  }

  // Basis: seluruh user terdaftar
  let daftar = userService.getAllUsers().map((u) => Number(u.userId));

  // Mode 'all' harus benar-benar SEMUA: gabungkan seller & reseller juga.
  // Mereka bisa saja tidak tercatat di users.json bila belum pernah /start
  // (mis. didaftarkan admin lewat /seller add tanpa pernah membuka bot).
  if (mode === 'all') {
    const tambahan = [
      ...sellerService.getAllSellers().map((s) => Number(s.userId)),
      ...resellerService.getAllResellers().map((r) => Number(r.userId)),
    ];
    daftar = [...new Set([...daftar, ...tambahan])];
  }

  if (mode === 'user') {
    // "User murni" = tidak diundang seller/reseller DAN bukan seller/reseller.
    // Cek kedua sisi: akun seller sendiri pun tidak punya referrer,
    // sehingga tanpa pengecekan peran, mereka akan ikut terkirim.
    daftar = daftar.filter((id) => {
      if (!Number.isFinite(id)) return false;

      const diundangSeller = sellerService.getReferrer(id) !== null;
      const diundangReseller = resellerService.getReferrer(id) !== null;
      if (diundangSeller || diundangReseller) return false;

      const adalahSeller = sellerService.isSeller(id);
      const adalahReseller = resellerService.isReseller(id);
      if (adalahSeller || adalahReseller) return false;

      return true;
    });
  }

  return daftar.filter((id) => Number.isFinite(id) && id !== kecuali);
}

/**
 * Format petunjuk pemakaian
 * @returns {string}
 */
function petunjuk() {
  const L = [
    `📢 <b>BROADCAST</b>`,
    `─────────────────────`,
    ``,
    `<b>Caranya:</b>`,
    `1. Kirim pesan ke bot (teks / foto / video / dokumen)`,
    `2. Tekan lama pesan itu → Reply`,
    `3. Ketik command broadcast`,
    ``,
    `<b>Pilihan penerima:</b>`,
    `<code>/broadcast</code> — semua user terdaftar`,
    `<code>/broadcast user</code> — user tanpa seller/reseller`,
    `<code>/broadcast seller</code> — seluruh seller`,
    `<code>/broadcast reseller</code> — seluruh reseller`,
    ``,
    `<b>Jumlah saat ini:</b>`,
  ];

  const semua = userService.getAllUsers().length;
  const seller = sellerService.getAllSellers().length;
  const reseller = resellerService.getAllResellers().length;

  // hitung user tanpa seller/reseller
  const murni = ambilPenerima('user', 0).length;

  L.push(`• Semua user : <b>${semua}</b>`);
  L.push(`• Tanpa seller: <b>${murni}</b>`);
  L.push(`• Seller     : <b>${seller}</b>`);
  L.push(`• Reseller   : <b>${reseller}</b>`);

  return L.join('\n');
}

/**
 * Register handler /broadcast
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.command('broadcast', async (ctx) => {
    const userId = ctx.from.id;

    // 1. Harus admin
    if (!isAnyAdmin(userId)) {
      ctx.reply(formatError('Hanya <b>admin</b> yang bisa melakukan broadcast.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 2. Parse mode
    const raw = ctx.message.text.replace(/^\/broadcast(@\w+)?\s*/i, '').trim();
    const mode = raw ? raw.toLowerCase().split(/\s+/)[0] : 'all';

    if (raw && !MODES[mode]) {
      ctx.reply(
        formatError(
          `Mode "<b>${raw}</b>" tidak dikenal.\n\n` +
            `Pilihan: <code>user</code>, <code>seller</code>, <code>reseller</code>, ` +
            `atau tanpa argumen untuk semua.`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // 3. Harus berupa REPLY
    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) {
      ctx.reply(petunjuk(), { parse_mode: 'HTML' });
      return;
    }

    // 4. Ambil penerima
    const targets = ambilPenerima(mode, userId);

    if (!targets.length) {
      ctx.reply(
        formatError(`Tidak ada penerima untuk kategori <b>${MODES[mode].label}</b>.`),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // 5. Kabari mulai
    let infoMsg = null;
    try {
      infoMsg = await ctx.reply(
        `📢 <b>Broadcast dimulai</b>\n\n` +
          `<b>Kategori:</b> ${MODES[mode].label}\n` +
          `<b>Penerima:</b> ${targets.length} ${MODES[mode].deskripsi}\n\n` +
          `<i>Mohon tunggu, proses berjalan...</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (_) {
      infoMsg = null;
    }

    // 6. Kirim satu per satu
    let sukses = 0;
    let gagal = 0;
    const gagalIds = [];

    for (const targetId of targets) {
      try {
        await ctx.telegram.copyMessage(targetId, ctx.chat.id, replyTo.message_id);
        sukses += 1;
      } catch (err) {
        gagal += 1;
        gagalIds.push(targetId);
      }

      await sleep(DELAY_MS);
    }

    // 7. Laporan akhir
    const lines = [
      `📢 <b>BROADCAST SELESAI</b>`,
      `─────────────────────`,
      ``,
      `<b>Kategori:</b> ${MODES[mode].label}`,
      ``,
      `✅ Terkirim: <b>${sukses}</b>`,
      `❌ Gagal: <b>${gagal}</b>`,
      `👥 Total: <b>${targets.length}</b>`,
    ];

    if (gagalIds.length) {
      const shown = gagalIds.slice(0, 10);
      lines.push(``, `<b>Gagal ke:</b>`);
      for (const id of shown) lines.push(`• <code>${id}</code>`);
      if (gagalIds.length > shown.length) {
        lines.push(`<i>...dan ${gagalIds.length - shown.length} lainnya</i>`);
      }
      lines.push(``, `<i>Umumnya karena user memblokir bot atau menghapus akun.</i>`);
    }

    if (infoMsg && infoMsg.message_id) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, infoMsg.message_id);
      } catch (_) {
        /* abaikan */
      }
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });
}

module.exports = { register, initSetupAdmins, isAnyAdmin, ambilPenerima, MODES };