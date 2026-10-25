/**
 * give.js — Handler /give (admin & seller)
 *
 * Mentransfer token dari saldo pengirim ke user lain.
 *
 * Aturan:
 *   - ADMIN  : boleh ke siapa pun, TANPA batas bawah (saldo boleh minus)
 *              agar supply token tetap seimbang.
 *   - SELLER : boleh ke siapa pun, tapi TIDAK BOLEH minus — transfer
 *              ditolak bila saldo token-nya tidak mencukupi.
 */

const tokenManager = require('../services/tokenManager');
const sellerService = require('../services/sellerService');
const { formatError } = require('../utils/format');

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
 * Cek main admin
 */
function isMainAdmin(userId) {
  return setupAdminIds.includes(Number(userId));
}

/**
 * Register handler /give
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.command('give', (ctx) => {
    const userId = ctx.from.id;

    const admin = isMainAdmin(userId);
    const seller = sellerService.isSeller(userId);

    if (!admin && !seller) {
      ctx.reply(formatError('Hanya <b>admin</b> atau <b>seller</b> yang bisa memakai command ini.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    const args = ctx.message.text.replace(/^\/give(@\w+)?\s*/, '').trim();

    if (!args) {
      ctx.reply(
        formatError('Gunakan: <code>/give &lt;ID&gt; &lt;nominal&gt;</code>\n\nContoh: <code>/give 123456789 10</code>'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    const parts = args.split(/\s+/);
    if (parts.length !== 2) {
      ctx.reply(
        formatError('Format salah.\nGunakan: <code>/give &lt;ID&gt; &lt;nominal&gt;</code>'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    const targetId = parseInt(parts[0], 10);
    const nominal = parseInt(parts[1], 10);

    if (isNaN(targetId)) {
      ctx.reply(formatError('ID user harus berupa angka.'), { parse_mode: 'HTML' });
      return;
    }

    if (isNaN(nominal) || nominal <= 0) {
      ctx.reply(formatError('Nominal harus lebih besar dari 0.'), { parse_mode: 'HTML' });
      return;
    }

    if (targetId === userId) {
      ctx.reply(formatError('Tidak bisa transfer token ke diri sendiri.'), { parse_mode: 'HTML' });
      return;
    }

    const saldoSebelum = tokenManager.getTokenBalance(userId);

    // ─── SELLER: tidak boleh minus ───
    if (!admin && seller) {
      if (saldoSebelum < nominal) {
        ctx.reply(
          formatError(
            `Saldo token kamu tidak mencukupi.\n\n` +
              `Saldo kamu: <b>${saldoSebelum}</b> token\n` +
              `Diminta: <b>${nominal}</b> token`
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      const berhasil = tokenManager.deductToken(userId, nominal);
      if (!berhasil) {
        ctx.reply(formatError('Gagal memotong saldo token kamu.'), { parse_mode: 'HTML' });
        return;
      }

      const saldoBaru = tokenManager.getTokenBalance(userId);
      const saldoUserBaru = tokenManager.addToken(targetId, nominal);

      ctx.reply(
        `✅ <b>Transfer Berhasil</b>\n\n` +
          `💰 Nominal: <b>${nominal}</b> token\n` +
          `📤 Dari: <code>${userId}</code>\n` +
          `📥 Ke: <code>${targetId}</code>\n\n` +
          `─────────────────────\n` +
          `<b>Saldo kamu:</b> ${saldoSebelum} → <b>${saldoBaru}</b> token\n` +
          `<b>Saldo penerima:</b> <b>${saldoUserBaru}</b> token`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── ADMIN: boleh minus agar supply seimbang ───
    const saldoAdminBaru = tokenManager.deductTokenAllowNegative(userId, nominal);
    const saldoUserBaru = tokenManager.addToken(targetId, nominal);

    ctx.reply(
      `✅ <b>Transfer Berhasil</b>\n\n` +
        `💰 Nominal: <b>${nominal}</b> token\n` +
        `📤 Dari: <code>${userId}</code>\n` +
        `📥 Ke: <code>${targetId}</code>\n\n` +
        `─────────────────────\n` +
        `<b>Saldo kamu:</b> ${saldoSebelum} → <b>${saldoAdminBaru}</b> token\n` +
        `<b>Saldo penerima:</b> <b>${saldoUserBaru}</b> token` +
        (saldoAdminBaru < 0 ? `\n\n⚠️ <i>Saldo admin minus — suplai token tetap seimbang.</i>` : ''),
      { parse_mode: 'HTML' }
    );
  });
}

module.exports = { register, initSetupAdmins, isMainAdmin };