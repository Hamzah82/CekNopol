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

      const parsed = parseAdminTokenArgs(args);
      if (!parsed) {
        ctx.reply(
          formatError('Format salah.\n\nGunakan:\n/token &lt;UserID&gt; +&lt;jumlah&gt;\n/token &lt;UserID&gt; -&lt;jumlah&gt;\n\nContoh: /token 123456789 +10'),
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
