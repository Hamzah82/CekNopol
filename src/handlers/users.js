/**
 * users.js — Handler /users
 *
 * Menampilkan daftar user bot beserta affiliator yang mengundangnya.
 * Bisa dijalankan SEMUA admin (main admin & db/admin.json).
 *
 * Pemakaian:
 *   /users           → halaman 1
 *   /users <halaman> → halaman tertentu
 *   /users <keyword> → cari berdasarkan ID user atau ID affiliator
 */

const userService = require('../services/userService');
const sellerService = require('../services/sellerService');
const roleManager = require('../services/roleManager');
const { formatError } = require('../utils/format');

/** Item per halaman */
const PER_PAGE = 10;

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
 * Escape HTML
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format tanggal singkat
 * @param {string|null} iso
 * @returns {string}
 */
function shortDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      timeZone: 'Asia/Jakarta',
    });
  } catch (_) {
    return '-';
  }
}

/**
 * Bangun teks daftar user
 *
 * @param {object} opts
 * @param {number} [opts.page]
 * @param {string} [opts.keyword]
 * @returns {{text: string, keyboard: object|null}}
 */
function buildUserList({ page = 1, keyword = '' } = {}) {
  let users = userService.getAllUsers();

  // Filter pencarian
  const kw = String(keyword || '').trim();
  if (kw) {
    const lower = kw.toLowerCase();
    users = users.filter((u) => {
      if (u.userId.includes(lower)) return true;
      const ref = sellerService.getReferrer(u.userId);
      return ref !== null && String(ref).includes(lower);
    });
  }

  const total = users.length;

  if (!total) {
    return {
      text: kw
        ? `🔍 <b>HASIL PENCARIAN</b>\n\n<i>Tidak ada user yang cocok dengan "${escapeHtml(kw)}".</i>`
        : `👥 <b>DAFTAR USER</b>\n\n<i>Belum ada user yang tercatat.</i>`,
      keyboard: null,
    };
  }

  const totalPages = Math.ceil(total / PER_PAGE) || 1;
  let p = Math.floor(Number(page)) || 1;
  if (p > totalPages) p = totalPages;
  if (p < 1) p = 1;

  const start = (p - 1) * PER_PAGE;
  const items = users.slice(start, start + PER_PAGE);

  // Statistik singkat
  const denganAff = users.filter((u) => sellerService.getReferrer(u.userId) !== null).length;

  const lines = [
    kw ? `🔍 <b>HASIL PENCARIAN "${escapeHtml(kw)}"</b>` : `👥 <b>DAFTAR USER</b>`,
    `─────────────────────`,
    ``,
  ];

  items.forEach((u, i) => {
    const num = start + i + 1;
    const ref = sellerService.getReferrer(u.userId);

    lines.push(`<b>${num}.</b> <code>${u.userId}</code>`);

    if (ref !== null) {
      const aff = sellerService.getSeller(ref);
      const nama = aff && aff.username ? ` (@${aff.username})` : '';
      lines.push(`   🤝 Seller: <code>${ref}</code>${nama}`);
    } else {
      lines.push(`   🤝 Seller: <i>-</i>`);
    }

    lines.push(`   📅 Sejak: ${shortDate(u.firstSeen)}`);
    lines.push('');
  });

  lines.push(`─────────────────────`);
  lines.push(`📄 Halaman <b>${p}</b> / <b>${totalPages}</b>`);
  lines.push(`👥 Total: <b>${total}</b> user | Dari seller: <b>${denganAff}</b>`);

  // Tombol navigasi (hanya untuk daftar tanpa pencarian)
  const nav = [];
  if (!kw) {
    if (p > 1) nav.push({ text: '◀ Sebelumnya', callback_data: `usrpg:${p - 1}` });
    if (p < totalPages) nav.push({ text: 'Berikutnya ▶', callback_data: `usrpg:${p + 1}` });
  }

  return {
    text: lines.join('\n'),
    keyboard: nav.length ? { inline_keyboard: [nav] } : null,
  };
}

/**
 * Register handler /users
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.command('users', (ctx) => {
    const userId = ctx.from.id;

    if (!isAnyAdmin(userId)) {
      ctx.reply(formatError('Hanya <b>admin</b> yang bisa melihat daftar user.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    const raw = ctx.message.text.replace(/^\/users(@\w+)?\s*/i, '').trim();

    // Helper kirim
    const kirim = (hasil) => {
      const opts = { parse_mode: 'HTML' };
      if (hasil.keyboard) opts.reply_markup = hasil.keyboard;
      ctx.reply(hasil.text, opts);
    };

    // Tanpa argumen -> halaman 1
    if (!raw) {
      kirim(buildUserList({ page: 1 }));
      return;
    }

    // Angka dianggap NOMOR HALAMAN hanya bila tidak melebihi jumlah halaman.
    // ID Telegram panjang (mis. 8938368465), jadi tidak mungkin jadi halaman.
    if (/^\d+$/.test(raw)) {
      const n = parseInt(raw, 10);
      const total = userService.getAllUsers().length;
      const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

      if (n >= 1 && n <= totalPages) {
        kirim(buildUserList({ page: n }));
        return;
      }

      // Di luar jangkauan halaman -> perlakukan sebagai pencarian ID
      kirim(buildUserList({ page: 1, keyword: raw }));
      return;
    }

    // Selain angka -> pencarian
    kirim(buildUserList({ page: 1, keyword: raw }));
  });

  // ─── Tombol navigasi halaman /users ─────────────────────
  bot.action(/^usrpg:/, async (ctx) => {
    const userId = ctx.from.id;

    if (!isAnyAdmin(userId)) {
      await ctx.answerCbQuery('Khusus admin.', { show_alert: true });
      return;
    }

    const data = (ctx.callbackQuery && ctx.callbackQuery.data) || '';
    const halaman = parseInt(data.split(':')[1], 10) || 1;

    const hasil = buildUserList({ page: halaman });

    const opts = { parse_mode: 'HTML' };
    if (hasil.keyboard) opts.reply_markup = hasil.keyboard;

    try {
      await ctx.editMessageText(hasil.text, opts);
    } catch (err) {
      if (!/message is not modified/i.test(err.message || '')) {
        console.error('[users] gagal edit halaman:', err.message);
      }
    }

    await ctx.answerCbQuery().catch(() => {});
  });
}

module.exports = { register, initSetupAdmins, buildUserList };
