/**
 * broadcast.js — Handler /broadcast
 *
 * Cara pakai:
 *   1. Admin kirim pesan apa saja ke bot (teks / foto / video / dokumen)
 *   2. Admin REPLY pesan itu dengan /broadcast
 *   3. Pesan diteruskan ke SELURUH user yang tercatat di db/users.json
 *
 * Penerima diambil dari users.json (user yang pernah /start),
 * BUKAN dari tokens.json — supaya user yang belum pernah beli tetap dapat.
 *
 * Bisa dijalankan SEMUA admin (main admin & db/admin.json).
 */

const userService = require('../services/userService');
const roleManager = require('../services/roleManager');
const { formatError } = require('../utils/format');

/** Jeda antar kirim (ms) agar tidak kena rate limit Telegram */
const DELAY_MS = 60;

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
 * Jeda
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Register handler /broadcast
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.command('broadcast', async (ctx) => {
    const userId = ctx.from.id;

    // 1. Harus admin
    if (!isAnyAdmin(userId)) {
      ctx.reply(formatError('Hanya <b>admin</b> yang bisa melakukan broadcast.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 2. Harus berupa REPLY
    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) {
      ctx.reply(
        formatError(
          'Gunakan dengan cara <b>reply</b> ke pesan yang ingin disebar.\n\n' +
            '<b>Caranya:</b>\n' +
            '1. Kirim pesan ke bot (teks / foto / video / dokumen)\n' +
            '2. Tekan lama pesan itu → Reply\n' +
            '3. Ketik <code>/broadcast</code>'
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // 3. Ambil daftar penerima dari users.json
    const users = userService.getAllUsers();
    const targets = users
      .map((u) => Number(u.userId))
      .filter((id) => Number.isFinite(id) && id !== Number(userId)); // jangan kirim ke diri sendiri

    if (!targets.length) {
      ctx.reply(formatError('Belum ada user yang tercatat untuk dikirimi broadcast.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // 4. Kabari mulai
    const infoMsg = await ctx
      .reply(
        `📢 <b>Broadcast dimulai</b>\n\n` +
          `Penerima: <b>${targets.length}</b> user\n` +
          `<i>Mohon tunggu, proses berjalan...</i>`,
        { parse_mode: 'HTML' }
      )
      .catch(() => null);

    // 5. Kirim satu per satu
    let sukses = 0;
    let gagal = 0;
    const gagalIds = [];

    for (const targetId of targets) {
      try {
        await ctx.telegram.copyMessage(targetId, ctx.chat.id, replyTo.message_id);
        sukses += 1;
      } catch (err) {
        gagal += 1;
        gagalIds.push(targetId);
      }

      await sleep(DELAY_MS);
    }

    // 6. Laporan akhir
    const lines = [
      `📢 <b>BROADCAST SELESAI</b>`,
      `─────────────────────`,
      ``,
      `✅ Terkirim: <b>${sukses}</b>`,
      `❌ Gagal: <b>${gagal}</b>`,
      `👥 Total: <b>${targets.length}</b>`,
    ];

    if (gagalIds.length) {
      const shown = gagalIds.slice(0, 10);
      lines.push(``, `<b>Gagal ke:</b>`);
      for (const id of shown) {
        lines.push(`• <code>${id}</code>`);
      }
      if (gagalIds.length > shown.length) {
        lines.push(`<i>...dan ${gagalIds.length - shown.length} lainnya</i>`);
      }
      lines.push(``, `<i>Umumnya karena user memblokir bot atau menghapus akun.</i>`);
    }

    // Hapus pesan "sedang berjalan", lalu kirim laporan
    if (infoMsg && infoMsg.message_id) {
      await ctx.telegram.deleteMessage(ctx.chat.id, infoMsg.message_id).catch(() => {});
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });
}

module.exports = { register, initSetupAdmins, isAnyAdmin };