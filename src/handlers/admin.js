/**
 * admin.js — Handler /admin add|list|remove
 */

const roleManager = require('../services/roleManager');
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
 * Format list admin
 * @param {number[]} admins - Array admin IDs
 * @returns {string}
 */
function formatAdminList(admins) {
  if (admins.length === 0) {
    return `📋 <b>Daftar Admin</b>\n\n<i>Belum ada admin terdaftar.</i>`;
  }

  const lines = [
    `📋 <b>Daftar Admin</b>`,
    `─────────────────────`,
    ``,
  ];

  for (let i = 0; i < admins.length; i++) {
    lines.push(`<b>${i + 1}.</b> <code>${admins[i]}</code>`);
  }

  lines.push(``);
  lines.push(`─────────────────────`);
  lines.push(`👥 Total admin: <b>${admins.length}</b>`);

  return lines.join('\n');
}

/**
 * Register handler /admin
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('admin', (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.replace(/^\/admin(@\w+)?\s*/, '').trim();

    // Cek apakah pengirim admin
    if (!isMainAdmin(userId)) {
      ctx.reply(formatError('Kamu bukan admin.'), { parse_mode: 'HTML' });
      return;
    }

    if (!args) {
      ctx.reply(
        formatError('Gunakan:\n/admin add &lt;ID&gt;\n/admin list\n/admin remove &lt;ID&gt;'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    const parts = args.split(/\s+/);

    // ─── /admin list ─────────────────────────────────────────
    if (parts[0].toLowerCase() === 'list') {
      const admins = roleManager.getAdmins();
      ctx.reply(formatAdminList(admins), { parse_mode: 'HTML' });
      return;
    }

    // ─── /admin add <ID> ─────────────────────────────────────
    if (parts[0].toLowerCase() === 'add') {
      if (!parts[1]) {
        ctx.reply(formatError('Masukkan ID user.\nContoh: /admin add 123456789'), { parse_mode: 'HTML' });
        return;
      }
      const targetId = parseInt(parts[1], 10);
      if (isNaN(targetId)) {
        ctx.reply(formatError('ID user harus berupa angka.'), { parse_mode: 'HTML' });
        return;
      }

      const added = roleManager.addAdmin(targetId);
      if (added) {
        ctx.reply(formatSuccess(`Admin <code>${targetId}</code> berhasil ditambahkan.`), { parse_mode: 'HTML' });
      } else {
        ctx.reply(formatError(`User <code>${targetId}</code> sudah menjadi admin.`), { parse_mode: 'HTML' });
      }
      return;
    }

    // ─── /admin remove <ID> ──────────────────────────────────
    if (parts[0].toLowerCase() === 'remove') {
      if (!parts[1]) {
        ctx.reply(formatError('Masukkan ID user.\nContoh: /admin remove 123456789'), { parse_mode: 'HTML' });
        return;
      }
      const targetId = parseInt(parts[1], 10);
      if (isNaN(targetId)) {
        ctx.reply(formatError('ID user harus berupa angka.'), { parse_mode: 'HTML' });
        return;
      }

      const removed = roleManager.removeAdmin(targetId);
      if (removed) {
        ctx.reply(formatSuccess(`Admin <code>${targetId}</code> berhasil dihapus.`), { parse_mode: 'HTML' });
      } else {
        ctx.reply(formatError(`User <code>${targetId}</code> bukan admin.`), { parse_mode: 'HTML' });
      }
      return;
    }

    // Unknown subcommand
    ctx.reply(
      formatError('Subcommand tidak dikenal.\n\nGunakan:\n/admin add &lt;ID&gt;\n/admin list\n/admin remove &lt;ID&gt;'),
      { parse_mode: 'HTML' }
    );
  });
}

module.exports = { register, initSetupAdmins };