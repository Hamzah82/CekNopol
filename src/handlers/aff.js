/**
 * aff.js — Handler /aff (affiliator) & /done (admin)
 *
 * Command:
 *   /aff add <ID>                 — daftarkan affiliator (main admin)
 *   /aff remove <ID>              — hapus affiliator (main admin)
 *   /aff list                     — daftar affiliator (main admin)
 *   /aff setprofit <ID> <nominal> — atur profit rupiah/token (main admin)
 *   /aff link                     — ambil link referral (affiliator)
 *   /aff saldo                    — lihat saldo & statistik (affiliator)
 *   /aff wd <wallet> <nominal> <no> — ajukan penarikan (affiliator)
 *   /aff wdlist                   — daftar penarikan menunggu (main admin)
 *   /done                         — reply notifikasi WD, tandai selesai (main admin)
 */

const affiliateService = require('../services/affiliateService');
const orderService = require('../services/orderService');
const cooldownService = require('../services/cooldownService');
const { formatError, formatSuccess } = require('../utils/format');

/** @type {number[]} */
let setupAdminIds = [];

/** @type {string} */
let botUsername = '';

/**
 * Inisialisasi admin IDs & username bot
 * @param {number[]} ids
 * @param {string} [username]
 */
function initSetupAdmins(ids, username) {
  setupAdminIds = ids || [];
  botUsername = username || '';
}

/**
 * Cek main admin
 * @param {number} userId
 * @returns {boolean}
 */
function isMainAdmin(userId) {
  return setupAdminIds.includes(Number(userId));
}

/**
 * Format rupiah
 * @param {number} n
 * @returns {string}
 */
function rupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

/**
 * Bangun link referral
 * @param {number} userId
 * @returns {string|null}
 */
function buildRefLink(userId) {
  if (!botUsername) return null;
  return `https://t.me/${botUsername}?start=aff_${userId}`;
}

/**
 * Register handler /aff & /done
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.command('aff', async (ctx) => {
    const userId = ctx.from.id;
    const raw = ctx.message.text.replace(/^\/aff(@\w+)?\s*/i, '').trim();
    const parts = raw ? raw.split(/\s+/) : [];
    const sub = (parts[0] || '').toLowerCase();

    // ─── Tanpa argumen: bantuan ─────────────────────────────
    if (!raw) {
      const isAff = affiliateService.isAffiliator(userId);
      const isAdmin = isMainAdmin(userId);

      const lines = [`🤝 <b>AFFILIATOR</b>`, ``];

      if (isAff) {
        lines.push(`Kamu terdaftar sebagai <b>affiliator</b>.`, ``);
        lines.push(`<code>/aff link</code> — ambil link referral`);
        lines.push(`<code>/aff saldo</code> — lihat saldo`);
        lines.push(`<code>/aff wd &lt;wallet&gt; &lt;nominal&gt; &lt;no&gt;</code> — cairkan`);
        lines.push(``, `<i>Wallet: ${affiliateService.WALLETS.map((w) => affiliateService.walletLabel(w)).join(', ')}</i>`);
      } else if (isAdmin) {
        lines.push(`<b>Kelola Affiliator</b>`, ``);
        lines.push(`<code>/aff add &lt;ID&gt;</code>`);
        lines.push(`<code>/aff remove &lt;ID&gt;</code>`);
        lines.push(`<code>/aff list</code>`);
        lines.push(`<code>/aff setprofit &lt;ID&gt; &lt;nominal&gt;</code>`);
        lines.push(`<code>/aff wdlist</code>`);
        lines.push(``, `<i>Hanya main admin.</i>`);
      } else {
        lines.push(`Kamu belum terdaftar sebagai affiliator.`);
        lines.push(``, `<i>Hubungi admin untuk mendaftar.</i>`);
      }

      ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
      return;
    }

    // ─── /aff link ──────────────────────────────────────────
    if (sub === 'link') {
      if (!affiliateService.isAffiliator(userId)) {
        ctx.reply(formatError('Kamu belum terdaftar sebagai affiliator.'), { parse_mode: 'HTML' });
        return;
      }

      const link = buildRefLink(userId);
      if (!link) {
        ctx.reply(
          formatError('Username bot belum diset di setup.json (<code>botUsername</code>), sehingga link tidak bisa dibuat.'),
          { parse_mode: 'HTML' }
        );
        return;
      }

      const aff = affiliateService.getAffiliator(userId);
      const lines = [
        `🔗 <b>LINK REFERRAL KAMU</b>`,
        ``,
        `<code>${link}</code>`,
        ``,
        `Bagikan link ini. Setiap user <b>baru</b> yang masuk lewat link ini`,
        `akan terhubung ke kamu secara permanen.`,
        ``,
        `💰 Profit kamu: <b>${rupiah(aff.profitPerToken || 0)}</b> / token`,
        `💳 Saldo: <b>${rupiah(aff.balance || 0)}</b>`,
      ];

      ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
      return;
    }

    // ─── /aff saldo ─────────────────────────────────────────
    if (sub === 'saldo') {
      const aff = affiliateService.getAffiliator(userId);
      if (!aff) {
        ctx.reply(formatError('Kamu belum terdaftar sebagai affiliator.'), { parse_mode: 'HTML' });
        return;
      }

      const link = buildRefLink(userId);

      const lines = [
        `💳 <b>SALDO AFFILIATOR</b>`,
        `─────────────────────`,
        ``,
        `Saldo: <b>${rupiah(aff.balance || 0)}</b>`,
        `Total pendapatan: <b>${rupiah(aff.totalEarned || 0)}</b>`,
        `Profit per token: <b>${rupiah(aff.profitPerToken || 0)}</b>`,
        ``,
        `Minimum penarikan: <b>${rupiah(affiliateService.MIN_WITHDRAW)}</b>`,
      ];

      if (link) {
        lines.push(``, `🔗 Link referral:`, `<code>${link}</code>`);
      }

      ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
      return;
    }

    // ─── /aff wd <wallet> <nominal> <no> ────────────────────
    if (sub === 'wd' || sub === 'wdlist') {
      // wdlist ditangani terpisah di bawah
      if (sub === 'wdlist') {
        if (!isMainAdmin(userId)) {
          ctx.reply(formatError('Hanya <b>main admin</b>.'), { parse_mode: 'HTML' });
          return;
        }

        const list = Object.values(affiliateService.readWithdrawals())
          .filter((w) => w.status === 'menunggu')
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        if (!list.length) {
          ctx.reply(formatSuccess('Tidak ada penarikan yang menunggu.'), { parse_mode: 'HTML' });
          return;
        }

        const lines = [`📋 <b>PENARIKAN MENUNGGU</b>`, `─────────────────────`, ``];
        list.forEach((w, i) => {
          lines.push(`<b>${i + 1}. ${w.id}</b>`);
          lines.push(`Affiliator: <code>${w.affiliatorId}</code>`);
          lines.push(`Wallet: ${affiliateService.walletLabel(w.wallet)} — <code>${w.account}</code>`);
          lines.push(`Nominal: <b>${rupiah(w.amount)}</b>`);
          lines.push('');
        });
        lines.push(`─────────────────────`);
        lines.push(`Total: <b>${list.length}</b> penarikan`);

        ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
        return;
      }

      const aff = affiliateService.getAffiliator(userId);
      if (!aff) {
        ctx.reply(formatError('Kamu belum terdaftar sebagai affiliator.'), { parse_mode: 'HTML' });
        return;
      }

      // Format: /aff wd <wallet> <nominal> <no>
      const walletRaw = parts[1];
      const nominalRaw = parts[2];
      const account = parts.slice(3).join(' ');

      if (!walletRaw || !nominalRaw || !account) {
        ctx.reply(
          formatError(
            `Format salah.\n\n` +
              `<code>/aff wd &lt;wallet&gt; &lt;nominal&gt; &lt;no.wallet&gt;</code>\n\n` +
              `Contoh:\n<code>/aff wd gopay 50000 08123456789</code>\n\n` +
              `Wallet: ${affiliateService.WALLETS.map((w) => affiliateService.walletLabel(w)).join(', ')}`
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      const wallet = affiliateService.normalizeWallet(walletRaw);
      if (!wallet) {
        ctx.reply(
          formatError(
            `Wallet tidak didukung.\n\nYang tersedia: ${affiliateService.WALLETS.map((w) =>
              affiliateService.walletLabel(w)
            ).join(', ')}`
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      const nominal = parseInt(String(nominalRaw).replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(nominal) || nominal <= 0) {
        ctx.reply(formatError('Nominal harus berupa angka.'), { parse_mode: 'HTML' });
        return;
      }

      const cd = cooldownService.check(userId);
      if (cd.blocked) {
        ctx.reply(
          formatError(`Terlalu cepat. Tunggu <b>${cd.remaining} detik</b> lagi.`),
          { parse_mode: 'HTML' }
        );
        return;
      }

      const result = affiliateService.createWithdrawal({
        affiliatorId: userId,
        wallet,
        account,
        amount: nominal,
      });

      if (!result.success) {
        ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
        return;
      }

      cooldownService.mark(userId);

      const wd = result.data;

      // Notifikasi ke ADMIN
      const notif = [
        `💸 <b>PENGAJUAN PENARIKAN</b>`,
        `─────────────────────`,
        ``,
        `<b>ID:</b> <code>${wd.id}</code>`,
        `<b>Affiliator:</b> <code>${wd.affiliatorId}</code>${aff.username ? ` (@${aff.username})` : ''}`,
        `<b>Wallet:</b> ${affiliateService.walletLabel(wd.wallet)}`,
        `<b>No. Tujuan:</b> <code>${wd.account}</code>`,
        `<b>Nominal:</b> <b>${rupiah(wd.amount)}</b>`,
        ``,
        `Sisa saldo affiliator: ${rupiah(result.balance)}`,
        ``,
        `─────────────────────`,
        `Balas (reply) pesan ini dengan <code>/done</code> setelah transfer.`,
      ].join('\n');

      for (const adminId of setupAdminIds) {
        try {
          const sent = await bot.telegram.sendMessage(adminId, notif, { parse_mode: 'HTML' });
          if (sent && sent.message_id) {
            affiliateService.attachAdminMessage(wd.id, { chatId: adminId, messageId: sent.message_id });
          }
        } catch (err) {
          console.error(`[aff] gagal notifikasi admin ${adminId}:`, err.message);
        }
      }

      ctx.reply(
        formatSuccess(
          `Pengajuan penarikan dikirim.\n\n` +
            `<b>Nominal:</b> ${rupiah(wd.amount)}\n` +
            `<b>Wallet:</b> ${affiliateService.walletLabel(wd.wallet)}\n` +
            `<b>Ke:</b> <code>${wd.account}</code>\n\n` +
            `Sisa saldo: <b>${rupiah(result.balance)}</b>\n\n` +
            `<i>Admin akan memproses penarikanmu.</i>`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── Subcommand khusus main admin ───────────────────────
    if (['add', 'remove', 'list', 'setprofit'].includes(sub)) {
      if (!isMainAdmin(userId)) {
        ctx.reply(formatError('Hanya <b>main admin</b> yang bisa mengelola affiliator.'), {
          parse_mode: 'HTML',
        });
        return;
      }

      // /aff add <ID>
      if (sub === 'add') {
        const targetId = parseInt(parts[1], 10);
        if (!Number.isFinite(targetId)) {
          ctx.reply(formatError('Masukkan ID user.\nContoh: <code>/aff add 123456789</code>'), {
            parse_mode: 'HTML',
          });
          return;
        }

        const result = affiliateService.addAffiliator({
          userId: targetId,
          addedBy: userId,
        });

        if (!result.success) {
          ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
          return;
        }

        ctx.reply(
          formatSuccess(
            `Affiliator <code>${targetId}</code> ditambahkan.\n\n` +
              `Atur profit per token dengan:\n<code>/aff setprofit ${targetId} &lt;nominal&gt;</code>`
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      // /aff remove <ID>
      if (sub === 'remove') {
        const targetId = parseInt(parts[1], 10);
        if (!Number.isFinite(targetId)) {
          ctx.reply(formatError('Masukkan ID user.'), { parse_mode: 'HTML' });
          return;
        }

        const ok = affiliateService.removeAffiliator(targetId);
        if (!ok) {
          ctx.reply(formatError(`User <code>${targetId}</code> bukan affiliator.`), {
            parse_mode: 'HTML',
          });
          return;
        }

        ctx.reply(formatSuccess(`Affiliator <code>${targetId}</code> dihapus.`), {
          parse_mode: 'HTML',
        });
        return;
      }

      // /aff list
      if (sub === 'list') {
        const all = affiliateService.getAllAffiliators();
        if (!all.length) {
          ctx.reply(formatSuccess('Belum ada affiliator.'), { parse_mode: 'HTML' });
          return;
        }

        const profitAdmin = orderService.getProfit();
        const lines = [`🤝 <b>DAFTAR AFFILIATOR</b>`, `─────────────────────`, ``];

        all.forEach((a, i) => {
          lines.push(`<b>${i + 1}. <code>${a.userId}</code></b>${a.username ? ` (@${a.username})` : ''}`);
          lines.push(`   Profit: ${rupiah(a.profitPerToken || 0)} / token`);
          lines.push(`   Saldo: ${rupiah(a.balance || 0)}`);
          lines.push('');
        });

        lines.push(`─────────────────────`);
        lines.push(`Total: <b>${all.length}</b> affiliator`);
        lines.push(`<i>Profit admin saat ini: ${rupiah(profitAdmin)} / token</i>`);

        ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
        return;
      }

      // /aff setprofit <ID> <nominal>
      if (sub === 'setprofit') {
        const targetId = parseInt(parts[1], 10);
        const nominal = parseInt(String(parts[2] || '').replace(/[^0-9]/g, ''), 10);

        if (!Number.isFinite(targetId) || !Number.isFinite(nominal)) {
          ctx.reply(
            formatError(
              `Format salah.\n\n<code>/aff setprofit &lt;ID Affiliator&gt; &lt;nominal&gt;</code>\n\n` +
                `Contoh: <code>/aff setprofit 123456789 200</code>`
            ),
            { parse_mode: 'HTML' }
          );
          return;
        }

        const profitAdmin = orderService.getProfit();
        const result = affiliateService.setProfitPerToken(targetId, nominal, profitAdmin);

        if (!result.success) {
          ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
          return;
        }

        ctx.reply(
          formatSuccess(
            `Profit affiliator <code>${targetId}</code> diatur.\n\n` +
              `Profit per token: <b>${rupiah(result.data.profitPerToken)}</b>\n` +
              `Profit admin: ${rupiah(profitAdmin)} / token\n` +
              `Sisa untuk admin: ${rupiah(Math.max(0, profitAdmin - result.data.profitPerToken))} / token`
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }
    }

    // Subcommand tidak dikenal
    ctx.reply(formatError('Subcommand tidak dikenal. Ketik <code>/aff</code> untuk bantuan.'), {
      parse_mode: 'HTML',
    });
  });

  // ─── /done (reply notifikasi penarikan) ──────────────────
  bot.command('done', async (ctx) => {
    const userId = ctx.from.id;

    if (!isMainAdmin(userId)) {
      ctx.reply(formatError('Hanya <b>main admin</b>.'), { parse_mode: 'HTML' });
      return;
    }

    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) {
      ctx.reply(
        formatError(
          'Gunakan dengan cara <b>reply</b> ke pesan pengajuan penarikan.\n\n' +
            'Cara: tekan lama pesan penarikan → Reply → ketik <code>/done</code>'
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    const wd = affiliateService.findByAdminMessage(ctx.chat.id, replyTo.message_id);
    if (!wd) {
      ctx.reply(formatError('Tidak ada pengajuan penarikan yang terhubung dengan pesan ini.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    if (wd.status === 'selesai') {
      ctx.reply(formatError(`Penarikan <code>${wd.id}</code> sudah ditandai selesai.`), {
        parse_mode: 'HTML',
      });
      return;
    }

    const updated = affiliateService.markWithdrawalDone(wd.id, userId);

    ctx.reply(
      formatSuccess(
        `<b>Penarikan ditandai selesai</b>\n\n` +
          `<b>ID:</b> <code>${updated.id}</code>\n` +
          `<b>Affiliator:</b> <code>${updated.affiliatorId}</code>\n` +
          `<b>Nominal:</b> ${rupiah(updated.amount)}\n` +
          `<b>Wallet:</b> ${affiliateService.walletLabel(updated.wallet)} — <code>${updated.account}</code>`
      ),
      { parse_mode: 'HTML' }
    );

    // Notifikasi ke affiliator
    try {
      await ctx.telegram.sendMessage(
        updated.affiliatorId,
        `✅ <b>Penarikan selesai</b>\n\n` +
          `<b>Nominal:</b> ${rupiah(updated.amount)}\n` +
          `<b>Wallet:</b> ${affiliateService.walletLabel(updated.wallet)}\n` +
          `<b>Ke:</b> <code>${updated.account}</code>\n\n` +
          `<i>Dana sudah ditransfer admin. Terima kasih!</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error(`[aff] gagal notifikasi affiliator ${updated.affiliatorId}:`, err.message);
      ctx.reply('⚠️ Status diperbarui, tapi gagal mengirim notifikasi ke affiliator (mungkin bot diblokir).');
    }
  });
}

/**
 * Hitung & bagikan profit affiliator saat order diterima.
 *
 * @param {object} params
 * @param {number} params.userId - pembeli
 * @param {number} params.amount - jumlah token
 * @param {number} params.adminProfitPerToken - profit admin saat order
 * @returns {{affiliatorId: number, earned: number, profitPerToken: number}|null}
 */
function rewardAffiliate({ userId, amount, adminProfitPerToken }) {
  const affiliatorId = affiliateService.getReferrer(userId);
  if (!affiliatorId) return null;

  const aff = affiliateService.getAffiliator(affiliatorId);
  if (!aff) return null;

  // Minimal antara profit affiliator & profit admin saat order
  const perToken = Math.min(
    Math.max(0, Number(aff.profitPerToken) || 0),
    Math.max(0, Number(adminProfitPerToken) || 0)
  );

  const earned = perToken * Math.max(0, Number(amount) || 0);
  if (earned <= 0) {
    return { affiliatorId, earned: 0, profitPerToken: perToken };
  }

  affiliateService.addBalance(affiliatorId, earned);
  return { affiliatorId, earned, profitPerToken: perToken };
}

module.exports = { register, initSetupAdmins, rewardAffiliate, isMainAdmin, rupiah, buildRefLink };
