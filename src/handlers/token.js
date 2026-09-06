/**
 * token.js — Handler /token (user & admin)
 */

const tokenManager = require('../services/tokenManager');
const { formatSuccess, formatError } = require('../utils/format');

/** @type {number[]} */
let adminIds = [];

/**
 * Inisialisasi daftar admin
 * @param {number[]} ids - Array Telegram User ID admin
 */
function initAdmins(ids) {
  adminIds = ids || [];
}

/**
 * Cek apakah user adalah admin
 * @param {number} userId
 * @returns {boolean}
 */
function isAdmin(userId) {
  return adminIds.includes(userId);
}

/**
 * Parse argumen command admin: /token <userId> <+/-jumlah>
 * @param {string} args - String argumen setelah /token
 * @returns {{userId: number, operator: string, amount: number}|null}
 */
function parseAdminTokenArgs(args) {
  if (!args) return null;

  const parts = args.trim().split(/\s+/);
  if (parts.length !== 2) return null;

  const userId = parseInt(parts[0], 10);
  const tokenStr = parts[1];

  if (isNaN(userId)) return null;

  const match = tokenStr.match(/^([+-])(\d+)$/);
  if (!match) return null;

  return {
    userId,
    operator: match[1],
    amount: parseInt(match[2], 10),
  };
}

/**
 * Parse argumen command list: /token list [halaman]
 * @param {string} args - String argumen setelah /token
 * @returns {{page: number}|null}
 */
function parseListArgs(args) {
  if (!args) return { page: 1 };

  const parts = args.trim().split(/\s+/);
  // Format: list [halaman]
  if (parts[0].toLowerCase() !== 'list') return null;

  if (parts.length === 1) return { page: 1 };

  const page = parseInt(parts[1], 10);
  if (isNaN(page) || page < 1) return null;

  return { page };
}

/**
 * Format halaman list token untuk admin
 * @param {Array<{userId: string, balance: number}>} allTokens - Semua data token
 * @param {number} page - Halaman yang diminta
 * @param {number} perPage - Item per halaman
 * @returns {string} Pesan terformat
 */
function formatTokenList(allTokens, page, perPage) {
  const totalUsers = allTokens.length;
  const totalPages = Math.ceil(totalUsers / perPage) || 1;

  // Clamp halaman
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;

  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, totalUsers);
  const pageItems = allTokens.slice(start, end);

  // Hitung total token
  const totalTokens = allTokens.reduce((sum, t) => sum + t.balance, 0);

  const lines = [
    `📋 <b>Daftar Token User</b>`,
    `─────────────────────`,
    ``,
  ];

  if (pageItems.length === 0) {
    lines.push(`<i>Belum ada user yang memiliki token.</i>`);
  } else {
    for (let i = 0; i < pageItems.length; i++) {
      const t = pageItems[i];
      const num = start + i + 1;
      lines.push(`<b>${num}.</b> <code>${t.userId}</code> — <b>${t.balance}</b> token`);
    }
  }

  lines.push(``);
  lines.push(`─────────────────────`);
  lines.push(`📄 Halaman <b>${page}</b> / <b>${totalPages}</b>`);
  lines.push(`👥 Total user: <b>${totalUsers}</b> | 💰 Total token: <b>${totalTokens}</b>`);

  if (page < totalPages) {
    lines.push(``);
    lines.push(`➡️ Lanjut: <code>/token list ${page + 1}</code>`);
  }

  return lines.join('\n');
}

/**
 * Register handler /token
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('token', (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.replace(/^\/token(@\w+)?\s*/, '').trim();

    // Jika ada argumen → coba parse sebagai command admin
    if (args) {
      // Cek apakah pengirim adalah admin
      if (!isAdmin(userId)) {
        ctx.reply(formatError('Kamu bukan admin. Gunakan /token tanpa argumen untuk melihat saldo.'), {
          parse_mode: 'HTML',
        });
        return;
      }

      // ─── /token list [halaman] ─────────────────────────────
      const listArgs = parseListArgs(args);
      if (listArgs) {
        const allTokens = tokenManager.getAllTokens();
        const perPage = 10;
        const formatted = formatTokenList(allTokens, listArgs.page, perPage);
        ctx.reply(formatted, { parse_mode: 'HTML' });
        return;
      }

      // ─── /token <userId> +/-<jumlah> ───────────────────────
      const parsed = parseAdminTokenArgs(args);
      if (!parsed) {
        ctx.reply(
          formatError('Format salah.\n\nGunakan:\n/token &lt;UserID&gt; +&lt;jumlah&gt;\n/token &lt;UserID&gt; -&lt;jumlah&gt;\n/token list [halaman]\n\nContoh:\n/token 123456789 +10\n/token list\n/token list 2'),
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Eksekusi operasi admin
      if (parsed.operator === '+') {
        const newBalance = tokenManager.addToken(parsed.userId, parsed.amount);
        ctx.reply(
          formatSuccess(`Berhasil menambah <b>${parsed.amount}</b> token ke user <code>${parsed.userId}</code>.\nSaldo baru: <b>${newBalance}</b> token.`),
          { parse_mode: 'HTML' }
        );
      } else {
        // Operator '-'
        const currentBalance = tokenManager.getTokenBalance(parsed.userId);
        if (currentBalance < parsed.amount) {
          ctx.reply(
            formatError(`Saldo user <code>${parsed.userId}</code> tidak mencukupi.\nSaldo saat ini: <b>${currentBalance}</b> token.`),
            { parse_mode: 'HTML' }
          );
          return;
        }
        tokenManager.deductToken(parsed.userId, parsed.amount);
        const newBalance = tokenManager.getTokenBalance(parsed.userId);
        ctx.reply(
          formatSuccess(`Berhasil mengurangi <b>${parsed.amount}</b> token dari user <code>${parsed.userId}</code>.\nSaldo baru: <b>${newBalance}</b> token.`),
          { parse_mode: 'HTML' }
        );
      }
      return;
    }

    // Tanpa argumen → tampilkan saldo user sendiri
    const balance = tokenManager.getTokenBalance(userId);
    if (balance <= 0) {
      ctx.reply('💰 Kamu belum memiliki token.\nHubungi admin untuk mendapatkan token.', {
        parse_mode: 'HTML',
      });
    } else {
      ctx.reply(`💰 Sisa token kamu: <b>${balance}</b> token.`, { parse_mode: 'HTML' });
    }
  });
}

module.exports = { register, initAdmins };
