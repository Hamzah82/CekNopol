/**
 * reseller.js — Handler /reseller add|list|remove
 */

const roleManager = require('../services/roleManager');
const tokenManager = require('../services/tokenManager');
const { formatSuccess, formatError } = require('../utils/format');

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
 * Cek apakah user adalah main admin (hanya dari setup.json)
 * @param {number} userId
 * @returns {boolean}
 */
function isMainAdmin(userId) {
  return setupAdminIds.includes(userId);
}

/**
 * Format list reseller
 * @param {number[]} resellers - Array reseller IDs
 * @returns {string}
 */
function formatResellerList(resellers) {
  if (resellers.length === 0) {
    return `📋 <b>Daftar Reseller</b>\n\n<i>Belum ada reseller terdaftar.</i>`;
  }

  const lines = [
    `📋 <b>Daftar Reseller</b>`,
    `─────────────────────`,
    ``,
  ];

  for (let i = 0; i < resellers.length; i++) {
    lines.push(`<b>${i + 1}.</b> <code>${resellers[i]}</code>`);
  }

  lines.push(``);
  lines.push(`─────────────────────`);
  lines.push(`👥 Total reseller: <b>${resellers.length}</b>`);

  return lines.join('\n');
}

/**
 * Register handler /reseller
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('reseller', (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.replace(/^\/reseller(@\w+)?\s*/, '').trim();

    // Cek apakah pengirim admin
    if (!isMainAdmin(userId)) {
      ctx.reply(formatError('Kamu bukan admin.'), { parse_mode: 'HTML' });
      return;
    }

    if (!args) {
      ctx.reply(
        formatError('Gunakan:\n/reseller add &lt;ID&gt;\n/reseller list\n/reseller remove &lt;ID&gt;'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    const parts = args.split(/\s+/);

    // ─── /reseller list ──────────────────────────────────────
    if (parts[0].toLowerCase() === 'list') {
      const resellers = roleManager.getResellers();
      ctx.reply(formatResellerList(resellers), { parse_mode: 'HTML' });
      return;
    }

    // ─── /reseller add <ID> ──────────────────────────────────
    if (parts[0].toLowerCase() === 'add') {
      if (!parts[1]) {
        ctx.reply(formatError('Masukkan ID user.\nContoh: /reseller add 123456789'), { parse_mode: 'HTML' });
        return;
      }
      const targetId = parseInt(parts[1], 10);
      if (isNaN(targetId)) {
        ctx.reply(formatError('ID user harus berupa angka.'), { parse_mode: 'HTML' });
        return;
      }

      const added = roleManager.addReseller(targetId);
      if (added) {
        ctx.reply(formatSuccess(`Reseller <code>${targetId}</code> berhasil ditambahkan.`), { parse_mode: 'HTML' });
      } else {
        ctx.reply(formatError(`User <code>${targetId}</code> sudah menjadi reseller.`), { parse_mode: 'HTML' });
      }
      return;
    }

    // ─── /reseller remove <ID> ───────────────────────────────
    if (parts[0].toLowerCase() === 'remove') {
      if (!parts[1]) {
        ctx.reply(formatError('Masukkan ID user.\nContoh: /reseller remove 123456789'), { parse_mode: 'HTML' });
        return;
      }
      const targetId = parseInt(parts[1], 10);
      if (isNaN(targetId)) {
        ctx.reply(formatError('ID user harus berupa angka.'), { parse_mode: 'HTML' });
        return;
      }

      const removed = roleManager.removeReseller(targetId);
      if (removed) {
        ctx.reply(formatSuccess(`Reseller <code>${targetId}</code> berhasil dihapus.`), { parse_mode: 'HTML' });
      } else {
        ctx.reply(formatError(`User <code>${targetId}</code> bukan reseller.`), { parse_mode: 'HTML' });
      }
      return;
    }

    // Unknown subcommand
    ctx.reply(
      formatError('Subcommand tidak dikenal.\n\nGunakan:\n/reseller add &lt;ID&gt;\n/reseller list\n/reseller remove &lt;ID&gt;'),
      { parse_mode: 'HTML' }
    );
  });
}

module.exports = { register, initSetupAdmins };

/**
 * Register handler /give (untuk reseller)
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function registerGive(bot) {
  bot.command('give', (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.replace(/^\/give(@\w+)?\s*/, '').trim();

    // 1. Cek apakah user adalah reseller
    if (!roleManager.isReseller(userId)) {
      ctx.reply(formatError('Kamu bukan reseller. Command ini hanya untuk reseller.'), { parse_mode: 'HTML' });
      return;
    }

    // 2. Validasi input
    if (!args) {
      ctx.reply(formatError('Gunakan: /give &lt;ID&gt; &lt;nominal&gt;\n\nContoh: /give 123456789 10'), { parse_mode: 'HTML' });
      return;
    }

    const parts = args.split(/\s+/);
    if (parts.length !== 2) {
      ctx.reply(formatError('Format salah.\nGunakan: /give &lt;ID&gt; &lt;nominal&gt;\n\nContoh: /give 123456789 10'), { parse_mode: 'HTML' });
      return;
    }

    const targetId = parseInt(parts[0], 10);
    const nominal = parseInt(parts[1], 10);

    // 3. Validasi ID
    if (isNaN(targetId)) {
      ctx.reply(formatError('ID user harus berupa angka.'), { parse_mode: 'HTML' });
      return;
    }

    // 4. Validasi nominal (tidak boleh <= 0)
    if (isNaN(nominal) || nominal <= 0) {
      ctx.reply(formatError('Nominal harus lebih besar dari 0.'), { parse_mode: 'HTML' });
      return;
    }

    // 5. Tidak boleh transfer ke diri sendiri
    if (targetId === userId) {
      ctx.reply(formatError('Kamu tidak bisa transfer token ke diri sendiri.'), { parse_mode: 'HTML' });
      return;
    }

    // 6. Cek saldo reseller
    const balance = tokenManager.getTokenBalance(userId);
    if (balance < nominal) {
      ctx.reply(
        formatError(`Saldo token tidak mencukupi.\n\nSaldo kamu: <b>${balance}</b> token\nDibutuhkan: <b>${nominal}</b> token`),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // 7. Transfer token
    const result = tokenManager.transferToken(userId, targetId, nominal);

    if (!result.success) {
      ctx.reply(formatError(result.error || 'Gagal transfer token.'), { parse_mode: 'HTML' });
      return;
    }

    // 8. Konfirmasi
    ctx.reply(
      `✅ <b>Transfer Berhasil!</b>\n\n` +
      `💰 Nominal: <b>${nominal}</b> token\n` +
      `📤 Dari: <code>${userId}</code>\n` +
      `📥 Ke: <code>${targetId}</code>\n\n` +
      `💎 Sisa saldo kamu: <b>${result.fromBalance}</b> token`,
      { parse_mode: 'HTML' }
    );
  });
}