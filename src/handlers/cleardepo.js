/**
 * cleardepo.js — Handler /cleardepo
 *
 * Menghapus SEMUA order berstatus 'ditolak' dari database.
 * Hanya main admin (setup.json).
 *
 * Pemakaian:
 *   /cleardepo → hapus semua order ditolak, laporkan hasilnya
 */

const orderService = require('../services/orderService');
const { formatError, formatSuccess } = require('../utils/format');

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
 * Format nominal rupiah
 * @param {number} n
 * @returns {string}
 */
function rupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

/**
 * Register handler /cleardepo
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.command('cleardepo', (ctx) => {
    const userId = ctx.from.id;

    if (!isMainAdmin(userId)) {
      ctx.reply(formatError('Hanya <b>main admin</b> yang bisa membersihkan deposit.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // Cek dulu: apakah ada yang perlu dihapus
    const preview = orderService.countRejectedOrders();
    if (!preview.count) {
      ctx.reply(
        formatSuccess('Tidak ada order <b>ditolak</b> yang perlu dibersihkan.'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    const result = orderService.clearRejectedOrders();

    const lines = [
      `🧹 <b>DEPOSIT DIBERSIHKAN</b>`,
      `─────────────────────`,
      ``,
      `Order ditolak dihapus: <b>${result.deleted}</b>`,
      `Total nominal: <b>${rupiah(result.totalNominal)}</b>`,
      ``,
    ];

    // Tampilkan maksimal 10 ID agar pesan tidak kepanjangan
    const shown = result.ids.slice(0, 10);
    if (shown.length) {
      lines.push(`<b>Order ID:</b>`);
      for (const id of shown) {
        lines.push(`• <code>${id}</code>`);
      }
      if (result.ids.length > shown.length) {
        lines.push(`<i>...dan ${result.ids.length - shown.length} lainnya</i>`);
      }
    }

    lines.push(``, `─────────────────────`);
    lines.push(`<i>Order berstatus lain (diterima / menunggu) tidak disentuh.</i>`);

    ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });
}

module.exports = { register, initSetupAdmins };
