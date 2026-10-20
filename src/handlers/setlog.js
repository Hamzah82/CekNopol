/**
 * setlog.js — Handler /setlog & /unsetlog
 *
 * Menjadikan sebuah GRUP sebagai tujuan log pencarian user.
 * Hanya main admin (setup.json) yang boleh mengatur.
 *
 * Pemakaian (di dalam grup):
 *   /setlog    → grup ini menjadi grup log (menimpa grup log sebelumnya)
 *   /unsetlog  → matikan log untuk grup ini
 */

const logService = require('../services/logService');
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
 * Cek apakah user adalah main admin (hanya dari setup.json)
 * @param {number} userId
 * @returns {boolean}
 */
function isMainAdmin(userId) {
  return setupAdminIds.includes(Number(userId));
}

/**
 * Cek apakah chat adalah grup/supergrup
 * @param {object} chat - ctx.chat
 * @returns {boolean}
 */
function isGroupChat(chat) {
  if (!chat) return false;
  return chat.type === 'group' || chat.type === 'supergroup';
}

/**
 * Amankan judul grup untuk HTML
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
 * Register handler /setlog & /unsetlog
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  // ─── /setlog ─────────────────────────────────────────────
  bot.command('setlog', async (ctx) => {
    const userId = ctx.from.id;

    if (!isMainAdmin(userId)) {
      ctx.reply(formatError('Hanya <b>main admin</b> yang bisa mengatur grup log.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    if (!isGroupChat(ctx.chat)) {
      ctx.reply(
        formatError(
          'Command ini hanya bisa dijalankan di dalam <b>grup</b>.\n\n' +
            'Tambahkan bot ke grup, lalu jalankan <code>/setlog</code> di grup tersebut.'
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    const title = ctx.chat.title || 'Grup Tanpa Nama';
    const previous = logService.getConfig();
    logService.setLogGroup(ctx.chat.id, title, userId);

    let message =
      formatSuccess(
        `<b>Grup log diaktifkan</b>\n\n` +
          `Grup: <b>${escapeHtml(title)}</b>\n` +
          `Chat ID: <code>${ctx.chat.id}</code>\n\n` +
          `Semua pencarian user akan dilaporkan ke grup ini.`
      );

    // Beri tahu bila mengganti grup log sebelumnya
    if (previous.chatId && Number(previous.chatId) !== Number(ctx.chat.id)) {
      message +=
        `\n\n<i>Grup log sebelumnya (${escapeHtml(previous.title || String(previous.chatId))}) ` +
        `otomatis dinonaktifkan — hanya satu grup log yang aktif.</i>`;
    }

    // Uji kirim agar admin tahu bot punya izin mengirim pesan
    try {
      await ctx.reply(message, { parse_mode: 'HTML' });
      await ctx.reply(
        formatSuccess('Bot siap mengirim log ke grup ini. Contoh format log akan muncul saat ada pencarian.'),
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[setlog] gagal kirim pesan:', err.message);
    }
  });

  // ─── /unsetlog ───────────────────────────────────────────
  bot.command('unsetlog', async (ctx) => {
    const userId = ctx.from.id;

    if (!isMainAdmin(userId)) {
      ctx.reply(formatError('Hanya <b>main admin</b> yang bisa mengatur grup log.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    if (!isGroupChat(ctx.chat)) {
      ctx.reply(formatError('Command ini hanya bisa dijalankan di dalam <b>grup</b>.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    const config = logService.getConfig();
    if (!config.chatId) {
      ctx.reply(formatError('Belum ada grup log yang aktif.'), { parse_mode: 'HTML' });
      return;
    }

    if (Number(config.chatId) !== Number(ctx.chat.id)) {
      ctx.reply(
        formatError(
          `Grup log aktif bukan grup ini.\n\n` +
            `Grup log sekarang: <b>${escapeHtml(config.title || String(config.chatId))}</b>\n` +
            `Jalankan <code>/unsetlog</code> di grup tersebut untuk mematikan.`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    logService.clearLogGroup();
    ctx.reply(
      formatSuccess(
        `<b>Grup log dinonaktifkan</b>\n\n` +
          `Grup: <b>${escapeHtml(ctx.chat.title || 'Grup')}</b>\n\n` +
          `Pencarian user tidak lagi dilaporkan ke sini.`
      ),
      { parse_mode: 'HTML' }
    );
  });
}

module.exports = { register, initSetupAdmins };
