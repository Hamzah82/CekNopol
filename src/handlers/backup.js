/**
 * backup.js — Handler /backup
 *
 * Mengirim folder DB sebagai file .zip ke chat pribadi admin.
 *
 * Aturan:
 *   - Bisa dijalankan SEMUA admin (main admin & db/admin.json)
 *   - HANYA di chat pribadi (mencegah data sensitif terkirim ke grup)
 *   - File temporer dihapus setelah dikirim
 */

const path = require('path');
const backupService = require('../services/backupService');
const roleManager = require('../services/roleManager');
const { formatError, formatSuccess } = require('../utils/format');

/** @type {number[]} */
let setupAdminIds = [];

/** @type {string} */
let dbPath = './db';

/**
 * Inisialisasi admin IDs & path DB
 * @param {number[]} ids
 * @param {string} baseDbPath
 */
function initSetupAdmins(ids, baseDbPath) {
  setupAdminIds = ids || [];
  if (baseDbPath) dbPath = baseDbPath;
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
 * Register handler /backup
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.command('backup', async (ctx) => {
    const userId = ctx.from.id;

    // 1. Harus admin
    if (!isAnyAdmin(userId)) {
      ctx.reply(formatError('Hanya <b>admin</b> yang bisa menjalankan command ini.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 2. Hanya chat pribadi
    if (ctx.chat && ctx.chat.type !== 'private') {
      ctx.reply(
        formatError(
          'Command ini hanya bisa dijalankan di <b>chat pribadi</b>.\n\n' +
            '<i>File backup berisi data sensitif, tidak boleh terkirim ke grup.</i>'
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    const loading = await ctx
      .reply('⏳ Membuat backup database...')
      .catch(() => null);

    let result = null;

    try {
      result = await backupService.createBackup(path.resolve(dbPath));

      if (!result.ok) {
        await ctx.reply(formatError(`Gagal membuat backup.\n\n${result.error || ''}`), {
          parse_mode: 'HTML',
        });
        return;
      }

      // Kirim file zip
      await ctx.replyWithDocument(
        { source: result.zipPath, filename: result.fileName },
        {
          caption:
            `🗄️ <b>BACKUP DATABASE</b>\n\n` +
            `<b>File:</b> <code>${result.fileName}</code>\n` +
            `<b>Ukuran:</b> ${backupService.formatSize(result.size)}\n` +
            `<b>Waktu:</b> ${new Date().toLocaleString('id-ID')}\n\n` +
            `<i>Simpan file ini di tempat aman.</i>`,
          parse_mode: 'HTML',
        }
      );
    } catch (err) {
      console.error('[backup] gagal:', err.message);
      await ctx.reply(formatError(`Gagal mengirim backup.\n\n${err.message}`), {
        parse_mode: 'HTML',
      });
    } finally {
      // 3. Hapus file temporer, apa pun hasilnya
      if (result && result.tmpDir) {
        backupService.cleanup(result.tmpDir);
      }

      // Hapus pesan loading
      if (loading && loading.message_id) {
        ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
      }
    }
  });
}

module.exports = { register, initSetupAdmins };
