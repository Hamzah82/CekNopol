/**
 * channelGuard.js — Pengecekan keanggotaan channel informasi
 *
 * Tujuan: memastikan user sudah bergabung ke channel informasi bot
 * sebelum bisa memakai menu /start.
 *
 * Catatan penting:
 *   - Butuh CHAT ID channel (bentuk -100xxxxxxxxxx), bukan invite link
 *   - Bot HARUS admin di channel tersebut agar getChatMember bekerja
 *   - Bila pengecekan GAGAL (bot bukan admin / error jaringan),
 *     user DIIZINKAN LEWAT (fail-open) supaya tidak ada user yang
 *     terkunci dari bot hanya karena masalah akses
 */

const { formatError } = require('../utils/format');

/** Chat ID channel informasi */
const CHANNEL_ID = '-1004118205718';

/** Link undangan channel (untuk tombol) */
const CHANNEL_INVITE = 'https://t.me/+fbp8j7_NZr84NTk1';

/** Username channel bila publik (kosongkan bila privat) */
const CHANNEL_USERNAME = '';

/** Status keanggotaan yang dianggap "sudah gabung" */
const JOINED_STATUSES = ['creator', 'administrator', 'member', 'restricted'];

/**
 * Cek apakah user sudah bergabung ke channel.
 *
 * @param {object} telegram - ctx.telegram
 * @param {number} userId
 * @returns {Promise<{ok: boolean, joined: boolean, error?: string}>}
 *   ok=false  → pengecekan gagal, user sebaiknya DIIZINKAN (fail-open)
 *   joined    → true bila user sudah anggota
 */
async function checkMembership(telegram, userId) {
  try {
    const member = await telegram.getChatMember(CHANNEL_ID, userId);
    const status = member && member.status;
    return { ok: true, joined: JOINED_STATUSES.includes(status) };
  } catch (err) {
    // Bot bukan admin channel, channel tidak ditemukan, atau error lain
    console.error('[channelGuard] gagal cek keanggotaan:', err.message);
    return { ok: false, joined: false, error: err.message };
  }
}

/**
 * Bangun pesan "belum gabung" beserta tombol.
 *
 * @returns {{text: string, keyboard: object}}
 */
function buildJoinPrompt() {
  const text = [
    `📢 <b>GABUNG CHANNEL DULU</b>`,
    ``,
    `Untuk memakai bot ini, kamu perlu bergabung ke`,
    `<b>channel informasi</b> terlebih dahulu.`,
    ``,
    `Di channel itu kamu akan mendapat:`,
    `• Info update &amp; fitur baru`,
    `• Pengumuman penting`,
    `• Info maintenance`,
    ``,
    `Setelah bergabung, tekan tombol <b>Cek Ulang</b>.`,
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: '📢 Gabung Channel', url: CHANNEL_INVITE }],
      [{ text: '✅ Sudah Gabung, Cek Ulang', callback_data: 'chk:recheck' }],
    ],
  };

  return { text, keyboard };
}

/**
 * Kirim pesan ajakan gabung channel.
 *
 * @param {import('telegraf').Context} ctx
 * @returns {Promise<void>}
 */
async function promptJoin(ctx) {
  const { text, keyboard } = buildJoinPrompt();
  await ctx.reply(text, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });
}

module.exports = {
  CHANNEL_ID,
  CHANNEL_INVITE,
  CHANNEL_USERNAME,
  JOINED_STATUSES,
  checkMembership,
  buildJoinPrompt,
  promptJoin,
};