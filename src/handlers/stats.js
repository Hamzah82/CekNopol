/**
 * stats.js — Handler /stats
 *
 * Menampilkan ringkasan penggunaan bot untuk admin.
 * Hanya main admin (setup.json).
 *
 * Pemakaian:
 *   /stats → ringkasan hari ini, 7 hari, 30 hari, sepanjang waktu
 */

const statsService = require('../services/statsService');
const orderService = require('../services/orderService');
const { formatError } = require('../utils/format');

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
 * Format angka rupiah
 * @param {number} n
 * @returns {string}
 */
function rupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

/**
 * Label tampilan layanan
 * @param {string} service
 * @returns {string}
 */
function serviceLabel(service) {
  const map = {
    ceknopol: 'Cek Nopol',
    ceknama: 'Cek Nama',
    nik2kk: 'NIK ke KK',
    ceknomor: 'Cek Nomor HP',
  };
  return map[service] || service;
}

/**
 * Hitung persentase cache hit
 * @param {object} day
 * @returns {string}
 */
function cachePercent(day) {
  if (!day.total) return '0%';
  return Math.round((day.cache / day.total) * 100) + '%';
}

/**
 * Bangun pesan /stats
 * @param {number} days - jumlah hari untuk periode ringkasan
 * @returns {string}
 */
function buildStats() {
  const sum = statsService.getSummary();

  const lines = [
    `📊 <b>STATISTIK BOT</b>`,
    `─────────────────────`,
    ``,
    `<b>📅 HARI INI</b>`,
    `Pencarian: <b>${sum.today.total}</b>`,
    `├ Sukses: ${sum.today.sukses}`,
    `├ Gagal: ${sum.today.gagal}`,
    `└ Cache: ${sum.today.cache} <i>(${cachePercent(sum.today)})</i>`,
    `Token terpakai: <b>${sum.today.tokensUser}</b>`,
    ``,
    `<b>🗓️ 7 HARI</b>`,
    `Pencarian: <b>${sum.week.total}</b>`,
    `Token terpakai: <b>${sum.week.tokensUser}</b>`,
    `Cache hit: ${sum.week.cache} <i>(${cachePercent(sum.week)})</i>`,
    ``,
    `<b>🗓️ 30 HARI</b>`,
    `Pencarian: <b>${sum.month.total}</b>`,
    `Token terpakai: <b>${sum.month.tokensUser}</b>`,
    `Cache hit: ${sum.month.cache} <i>(${cachePercent(sum.month)})</i>`,
    ``,
    `<b>♾️ SEPANJANG WAKTU</b>`,
    `Pencarian: <b>${sum.allTime.total}</b>`,
    `Token terpakai: <b>${sum.allTime.tokensUser}</b>`,
    `Hari terlacak: ${sum.daysTracked}`,
  ];

  // Layanan terpopuler
  lines.push(``, `─────────────────────`, `<b>🏆 LAYANAN TERPOPULER</b>`);
  if (!sum.topServices.length) {
    lines.push(`<i>Belum ada data.</i>`);
  } else {
    sum.topServices.forEach(({ service, count }, i) => {
      lines.push(`${i + 1}. ${serviceLabel(service)} — <b>${count}</b>x`);
    });
  }

  // User paling aktif (30 hari)
  lines.push(``, `<b>👥 USER TERAKTIF (30 HARI)</b>`);
  if (!sum.topUsers.length) {
    lines.push(`<i>Belum ada data.</i>`);
  } else {
    sum.topUsers.forEach(({ userId, count }, i) => {
      lines.push(`${i + 1}. <code>${userId}</code> — <b>${count}</b>x`);
    });
  }

  // Sisa token provider
  lines.push(``, `─────────────────────`, `<b>🔋 SISA TOKEN PROVIDER</b>`);
  if (sum.lastTokensRemaining === null || sum.lastTokensRemaining === undefined) {
    lines.push(`<i>Belum ada data (belum pernah tembak API).</i>`);
  } else {
    const sisa = Number(sum.lastTokensRemaining);
    const warn = sisa <= 20 ? ' ⚠️ <b>SEGERA HABIS</b>' : '';
    lines.push(`Sisa: <b>${sisa}</b>${warn}`);
    if (sum.lastTokensService) {
      lines.push(`Dari: ${serviceLabel(sum.lastTokensService)}`);
    }
    if (sum.lastTokensAt) {
      lines.push(`<i>${new Date(sum.lastTokensAt).toLocaleString('id-ID')}</i>`);
    }
  }

  // ─── Pendapatan nyata dari order yang DITERIMA ───────────
  const now = new Date();
  const startToday = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  startToday.setHours(0, 0, 0, 0);

  const revToday = orderService.getRevenue({ since: startToday });
  const revMonth = orderService.getRevenue({ since: new Date(now.getTime() - 30 * 86400000) });
  const revAll = orderService.getRevenue();

  lines.push(``, `─────────────────────`, `<b>💵 PENDAPATAN (order diterima)</b>`);

  if (!revAll.diterima) {
    lines.push(`<i>Belum ada order yang diterima.</i>`);
  } else {
    lines.push(``, `<b>Hari ini</b>`);
    lines.push(`Omzet: <b>${rupiah(revToday.omzet)}</b>`);
    lines.push(`Profit admin: ${rupiah(revToday.profit)}`);
    lines.push(`Bagian seller: ${rupiah(revToday.sellerReward)}`);
    lines.push(`Profit bersih: <b>${rupiah(revToday.netProfit)}</b>`);
    lines.push(`Order: ${revToday.diterima} diterima`);

    lines.push(``, `<b>30 hari</b>`);
    lines.push(`Omzet: <b>${rupiah(revMonth.omzet)}</b>`);
    lines.push(`Profit admin: ${rupiah(revMonth.profit)}`);
    lines.push(`Bagian seller: ${rupiah(revMonth.sellerReward)}`);
    lines.push(`Profit bersih: <b>${rupiah(revMonth.netProfit)}</b>`);
    lines.push(`Order: ${revMonth.diterima} diterima`);

    lines.push(``, `<b>Total</b>`);
    lines.push(`Omzet: <b>${rupiah(revAll.omzet)}</b>`);
    lines.push(`Profit admin: ${rupiah(revAll.profit)}`);
    lines.push(`Bagian seller: ${rupiah(revAll.sellerReward)}`);
    lines.push(`Profit bersih: <b>${rupiah(revAll.netProfit)}</b>`);
    lines.push(`Modal: ${rupiah(revAll.modal)}`);
    lines.push(`Token terjual: <b>${revAll.tokens}</b>`);
    lines.push(``, `<b>Status order</b>`);
    lines.push(`Diterima: ${revAll.diterima} | Ditolak: ${revAll.ditolak} | Pending: ${revAll.pending}`);
  }

  // Harga & profit saat ini (bukan akumulatif)
  lines.push(``, `─────────────────────`, `<b>🏷️ HARGA SAAT INI</b>`);
  lines.push(`Harga: <b>${rupiah(orderService.getPricePerToken())}</b> / token`);
  lines.push(`Profit: <b>${rupiah(orderService.getProfit())}</b> / token`);

  lines.push(``, `─────────────────────`, `🐢 <i>XY Bot — Statistik</i>`);

  return lines.join('\n');
}

/**
 * Register handler /stats
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.command('stats', (ctx) => {
    const userId = ctx.from.id;

    if (!isMainAdmin(userId)) {
      ctx.reply(formatError('Hanya <b>main admin</b> yang bisa melihat statistik.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    ctx.reply(buildStats(), { parse_mode: 'HTML' });
  });
}

module.exports = { register, initSetupAdmins, buildStats };
