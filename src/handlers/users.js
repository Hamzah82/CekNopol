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
const affiliateService = require('../services/affiliateService');
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
 * @returns {string}
 */
function buildUserList({ page = 1, keyword = '' } = {}) {
  let users = userService.getAllUsers();

  // Filter pencarian
  const kw = String(keyword || '').trim();
  if (kw) {
    const lower = kw.toLowerCase();
    users = users.filter((u) => {
      if (u.userId.includes(lower)) return true;
      const ref = affiliateService.getReferrer(u.userId);
      return ref !== null && String(ref).includes(lower);
    });
  }

  const total = users.length;

  if (!total) {
    return kw
      ? `🔍 <b>HASIL PENCARIAN</b>\n\n<i>Tidak ada user yang cocok dengan "${escapeHtml(kw)}".</i>`
      : `👥 <b>DAFTAR USER</b>\n\n<i>Belum ada user yang tercatat.</i>`;
  }

  const totalPages = Math.ceil(total / PER_PAGE) || 1;
  let p = Math.floor(Number(page)) || 1;
  if (p > totalPages) p = totalPages;
  if (p < 1) p = 1;

  const start = (p - 1) * PER_PAGE;
  const items = users.slice(start, start + PER_PAGE);

  // Statistik singkat
  const denganAff = users.filter((u) => affiliateService.getReferrer(u.userId) !== null).length;

  const lines = [
    kw ? `🔍 <b>HASIL PENCARIAN "${escapeHtml(kw)}"</b>` : `👥 <b>DAFTAR USER</b>`,
    `─────────────────────`,
    ``,
  ];

  items.forEach((u, i) => {
    const num = start + i + 1;
    const ref = affiliateService.getReferrer(u.userId);

    lines.push(`<b>${num}.</b> <code>${u.userId}</code>`);

    if (ref !== null) {
      const aff = affiliateService.getAffiliator(ref);
      const nama = aff && aff.username ? ` (@${aff.username})` : '';
      lines.push(`   🤝 Diundang: <code>${ref}</code>${nama}`);
    } else {
      lines.push(`   🤝 Diundang: <i>-</i>`);
    }

    lines.push(`   📅 Sejak: ${shortDate(u.firstSeen)}`);
    lines.push('');
  });

  lines.push(`─────────────────────`);
  lines.push(`📄 Halaman <b>${p}</b> / <b>${totalPages}</b>`);
  lines.push(`👥 Total: <b>${total}</b> user | Diundang affiliator: <b>${denganAff}</b>`);

  if (p < totalPages) {
    lines.push(``, `➡️ Lanjut: <code>/users ${p + 1}</code>`);
  }

  return lines.join('\n');
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

    // Tanpa argumen -> halaman 1
    if (!raw) {
      ctx.reply(buildUserList({ page: 1 }), { parse_mode: 'HTML' });
      return;
    }

    // Angka dianggap NOMOR HALAMAN hanya bila tidak melebihi jumlah halaman.
    // ID Telegram panjang (mis. 8938368465), jadi tidak mungkin jadi halaman.
    if (/^\d+$/.test(raw)) {
      const n = parseInt(raw, 10);
      const total = userService.getAllUsers().length;
      const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

      if (n >= 1 && n <= totalPages) {
        ctx.reply(buildUserList({ page: n }), { parse_mode: 'HTML' });
        return;
      }

      // Di luar jangkauan halaman -> perlakukan sebagai pencarian ID
      ctx.reply(buildUserList({ page: 1, keyword: raw }), { parse_mode: 'HTML' });
      return;
    }

    // Selain angka -> pencarian
    ctx.reply(buildUserList({ page: 1, keyword: raw }), { parse_mode: 'HTML' });
  });
}

module.exports = { register, initSetupAdmins, buildUserList };
