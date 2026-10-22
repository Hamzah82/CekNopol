/**
 * seller.js — Handler /seller & /selesai
 *
 * Model: seller menjual token lebih mahal dari harga admin.
 *   harga user = modal + profit admin + profit seller
 * Profit admin TIDAK berkurang — seller punya bagiannya sendiri.
 *
 * Command:
 *   /seller add <ID>                — daftarkan seller (owner)
 *   /seller remove <ID>             — hapus seller (owner)
 *   /seller list                    — daftar seller (owner)
 *   /seller wdlist                  — penarikan menunggu (owner)
 *   /seller setprofit <nominal>     — atur profit seller (seller sendiri)
 *   /seller link                    — link referral
 *   /seller saldo                   — saldo & statistik
 *   /seller wd <wallet> <nominal> <no> — cairkan saldo
 *   /selesai                        — reply notifikasi WD, tandai lunas (owner)
 */

const sellerService = require('../services/sellerService');
const orderService = require('../services/orderService');
const cooldownService = require('../services/cooldownService');
const { formatError, formatSuccess } = require('../utils/format');

/** @type {number[]} */
let setupAdminIds = [];

/** @type {string} */
let botUsername = '';

/**
 * Inisialisasi
 * @param {number[]} ids
 * @param {string} [username]
 */
function initSetupAdmins(ids, username) {
  setupAdminIds = ids || [];
  botUsername = username || '';
}

/**
 * Cek main admin
 */
function isMainAdmin(userId) {
  return setupAdminIds.includes(Number(userId));
}

/**
 * Format rupiah
 */
function rupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

/**
 * Bangun link referral seller
 * @param {number} userId
 * @returns {string|null}
 */
function buildRefLink(userId) {
  if (!botUsername) return null;
  return `https://t.me/${botUsername}?start=seller_${userId}`;
}

/**
 * Hitung komisi seller untuk sebuah order
 *
 * @param {object} params
 * @param {number} params.userId - pembeli
 * @param {number} params.amount - jumlah token
 * @param {number} params.sellerProfitPerToken - profit seller per token pada order
 * @returns {{sellerId: number, earned: number, profitPerToken: number}|null}
 */
function rewardSeller({ userId, amount, sellerProfitPerToken }) {
  const sellerId = sellerService.getReferrer(userId);
  if (!sellerId) return null;

  const seller = sellerService.getSeller(sellerId);
  if (!seller) return null;

  const perToken = Math.max(0, Math.floor(Number(sellerProfitPerToken) || 0));
  const earned = perToken * Math.max(0, Number(amount) || 0);

  if (earned > 0) {
    sellerService.addBalance(sellerId, earned);
  }

  return { sellerId, earned, profitPerToken: perToken };
}

/**
 * Register handler /seller & /selesai
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.command('seller', async (ctx) => {
    const userId = ctx.from.id;
    const raw = ctx.message.text.replace(/^\/seller(@\w+)?\s*/i, '').trim();
    const parts = raw ? raw.split(/\s+/) : [];
    const sub = (parts[0] || '').toLowerCase();

    // ─── Tanpa argumen: bantuan ─────────────────────────────
    if (!raw) {
      const isS = sellerService.isSeller(userId);
      const isAdmin = isMainAdmin(userId);
      const lines = [`🏪 <b>SELLER</b>`, ``];

      if (isS) {
        const s = sellerService.getSeller(userId);
        lines.push(`Kamu terdaftar sebagai <b>seller</b>.`, ``);
        lines.push(`<code>/seller link</code> — link referral`);
        lines.push(`<code>/seller saldo</code> — saldo & statistik`);
        lines.push(`<code>/seller setprofit &lt;nominal&gt;</code> — atur profit/token`);
        lines.push(`<code>/seller wd &lt;wallet&gt; &lt;nominal&gt; &lt;no&gt;</code> — cairkan`);
        lines.push(``, `<b>Profit kamu sekarang:</b> ${rupiah(s.profitPerToken || 0)} / token`);
        lines.push(``, `<i>Wallet: ${sellerService.WALLETS.map((w) => sellerService.walletLabel(w)).join(', ')}</i>`);
      } else if (isAdmin) {
        lines.push(`<b>Kelola Seller</b>`, ``);
        lines.push(`<code>/seller add &lt;ID&gt;</code>`);
        lines.push(`<code>/seller remove &lt;ID&gt;</code>`);
        lines.push(`<code>/seller list</code>`);
        lines.push(`<code>/seller wdlist</code>`);
        lines.push(``, `<i>Hanya owner.</i>`);
      } else {
        lines.push(`Kamu belum terdaftar sebagai seller.`);
        lines.push(``, `<i>Hubungi admin untuk mendaftar.</i>`);
      }

      ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
      return;
    }

    // ─── /seller link ───────────────────────────────────────
    if (sub === 'link') {
      const s = sellerService.getSeller(userId);
      if (!s) {
        ctx.reply(formatError('Kamu belum terdaftar sebagai seller.'), { parse_mode: 'HTML' });
        return;
      }

      const link = buildRefLink(userId);
      if (!link) {
        ctx.reply(
          formatError('Username bot belum diset (<code>botUsername</code> di setup.json).'),
          { parse_mode: 'HTML' }
        );
        return;
      }

      const hargaAdmin = orderService.getPricePerToken();
      const hargaSeller = orderService.getPricePerToken(undefined, s.profitPerToken || 0);

      ctx.reply(
        [
          `🔗 <b>LINK REFERRAL SELLER</b>`,
          ``,
          `<code>${link}</code>`,
          ``,
          `Bagikan link ini. Setiap user <b>baru</b> yang masuk lewat link ini`,
          `akan terhubung ke kamu secara permanen.`,
          ``,
          `💰 Profit kamu: <b>${rupiah(s.profitPerToken || 0)}</b> / token`,
          `🏷️ Harga untuk user kamu: <b>${rupiah(hargaSeller)}</b> / token`,
          `🏷️ Harga user biasa: ${rupiah(hargaAdmin)} / token`,
          `💳 Saldo: <b>${rupiah(s.balance || 0)}</b>`,
        ].join('\n'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── /seller saldo ──────────────────────────────────────
    if (sub === 'saldo') {
      const s = sellerService.getSeller(userId);
      if (!s) {
        ctx.reply(formatError('Kamu belum terdaftar sebagai seller.'), { parse_mode: 'HTML' });
        return;
      }

      const link = buildRefLink(userId);
      const hargaAdmin = orderService.getPricePerToken();
      const hargaSeller = orderService.getPricePerToken(undefined, s.profitPerToken || 0);

      const lines = [
        `💳 <b>SALDO SELLER</b>`,
        `─────────────────────`,
        ``,
        `Saldo: <b>${rupiah(s.balance || 0)}</b>`,
        `Total pendapatan: <b>${rupiah(s.totalEarned || 0)}</b>`,
        `Profit per token: <b>${rupiah(s.profitPerToken || 0)}</b>`,
        ``,
        `Harga user kamu: <b>${rupiah(hargaSeller)}</b> / token`,
        `Harga user biasa: ${rupiah(hargaAdmin)} / token`,
        ``,
        `Minimum penarikan: <b>${rupiah(sellerService.MIN_WITHDRAW)}</b>`,
      ];

      if (link) lines.push(``, `🔗 Link referral:`, `<code>${link}</code>`);

      ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
      return;
    }

    // ─── /seller setprofit <nominal> ────────────────────────
    if (sub === 'setprofit') {
      const s = sellerService.getSeller(userId);
      if (!s) {
        ctx.reply(
          formatError(
            'Hanya <b>seller</b> yang bisa mengatur profit.\n\n' +
              '<i>Owner mengatur profit admin lewat</i> <code>/setprofit</code>'
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      const nominalRaw = parts[1];
      const hargaAdmin = orderService.getPricePerToken();

      if (!nominalRaw) {
        const hargaSeller = orderService.getPricePerToken(undefined, s.profitPerToken || 0);
        ctx.reply(
          [
            `⚙️ <b>PROFIT SELLER</b>`,
            ``,
            `Profit kamu: <b>${rupiah(s.profitPerToken || 0)}</b> / token`,
            `Harga user kamu: <b>${rupiah(hargaSeller)}</b> / token`,
            ``,
            `Harga dasar dari admin: ${rupiah(hargaAdmin)} / token`,
            `<i>Profit kamu ditambahkan di atas harga admin.</i>`,
            ``,
            `Gunakan: <code>/seller setprofit &lt;nominal&gt;</code>`,
            `Contoh: <code>/seller setprofit 500</code>`,
          ].join('\n'),
          { parse_mode: 'HTML' }
        );
        return;
      }

      const nominal = parseInt(String(nominalRaw).replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(nominal) || nominal < 0) {
        ctx.reply(formatError('Nominal harus berupa angka ≥ 0.'), { parse_mode: 'HTML' });
        return;
      }

      const result = sellerService.setProfitPerToken(userId, nominal);
      if (!result.success) {
        ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
        return;
      }

      const hargaBaru = orderService.getPricePerToken(undefined, result.data.profitPerToken);

      ctx.reply(
        formatSuccess(
          `<b>Profit seller diperbarui</b>\n\n` +
            `Profit kamu: <b>${rupiah(result.data.profitPerToken)}</b> / token\n` +
            `Harga untuk user kamu: <b>${rupiah(hargaBaru)}</b> / token\n\n` +
            `<i>Berlaku untuk order berikutnya. Profit admin tidak terpengaruh.</i>`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── /seller wd / wdlist ────────────────────────────────
    if (sub === 'wdlist') {
      if (!isMainAdmin(userId)) {
        ctx.reply(formatError('Hanya <b>owner</b>.'), { parse_mode: 'HTML' });
        return;
      }

      const list = Object.values(sellerService.readWithdrawals())
        .filter((w) => w.status === 'menunggu')
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      if (!list.length) {
        ctx.reply(formatSuccess('Tidak ada penarikan seller yang menunggu.'), { parse_mode: 'HTML' });
        return;
      }

      const lines = [`📋 <b>PENARIKAN SELLER MENUNGGU</b>`, `─────────────────────`, ``];
      list.forEach((w, i) => {
        lines.push(`<b>${i + 1}. ${w.id}</b>`);
        lines.push(`Seller: <code>${w.sellerId}</code>`);
        lines.push(`Wallet: ${sellerService.walletLabel(w.wallet)} — <code>${w.account}</code>`);
        lines.push(`Nominal: <b>${rupiah(w.amount)}</b>`);
        lines.push('');
      });
      lines.push(`─────────────────────`, `Total: <b>${list.length}</b> penarikan`);

      ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
      return;
    }

    if (sub === 'wd') {
      const s = sellerService.getSeller(userId);
      if (!s) {
        ctx.reply(formatError('Kamu belum terdaftar sebagai seller.'), { parse_mode: 'HTML' });
        return;
      }

      const walletRaw = parts[1];
      const nominalRaw = parts[2];
      const account = parts.slice(3).join(' ');

      if (!walletRaw || !nominalRaw || !account) {
        ctx.reply(
          formatError(
            `Format salah.\n\n<code>/seller wd &lt;wallet&gt; &lt;nominal&gt; &lt;no.wallet&gt;</code>\n\n` +
              `Contoh:\n<code>/seller wd gopay 50000 08123456789</code>\n\n` +
              `Wallet: ${sellerService.WALLETS.map((w) => sellerService.walletLabel(w)).join(', ')}`
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      const wallet = sellerService.normalizeWallet(walletRaw);
      if (!wallet) {
        ctx.reply(
          formatError(
            `Wallet tidak didukung.\n\nTersedia: ${sellerService.WALLETS.map((w) =>
              sellerService.walletLabel(w)
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

      const result = sellerService.createWithdrawal({
        sellerId: userId,
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

      const notif = [
        `💸 <b>PENGAJUAN PENARIKAN SELLER</b>`,
        `─────────────────────`,
        ``,
        `<b>ID:</b> <code>${wd.id}</code>`,
        `<b>Seller:</b> <code>${wd.sellerId}</code>`,
        `<b>Wallet:</b> ${sellerService.walletLabel(wd.wallet)}`,
        `<b>No. Tujuan:</b> <code>${wd.account}</code>`,
        `<b>Nominal:</b> <b>${rupiah(wd.amount)}</b>`,
        ``,
        `Sisa saldo seller: ${rupiah(result.balance)}`,
        ``,
        `─────────────────────`,
        `Balas (reply) pesan ini dengan <code>/selesai</code> setelah transfer.`,
      ].join('\n');

      for (const adminId of setupAdminIds) {
        try {
          const sent = await bot.telegram.sendMessage(adminId, notif, { parse_mode: 'HTML' });
          if (sent && sent.message_id) {
            sellerService.attachAdminMessage(wd.id, { chatId: adminId, messageId: sent.message_id });
          }
        } catch (err) {
          console.error(`[seller] gagal notif admin ${adminId}:`, err.message);
        }
      }

      ctx.reply(
        formatSuccess(
          `Pengajuan penarikan dikirim.\n\n` +
            `<b>Nominal:</b> ${rupiah(wd.amount)}\n` +
            `<b>Wallet:</b> ${sellerService.walletLabel(wd.wallet)}\n` +
            `<b>Ke:</b> <code>${wd.account}</code>\n\n` +
            `Sisa saldo: <b>${rupiah(result.balance)}</b>\n\n` +
            `<i>Owner akan memproses penarikanmu.</i>`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── Subcommand owner ───────────────────────────────────
    if (['add', 'remove', 'list'].includes(sub)) {
      if (!isMainAdmin(userId)) {
        ctx.reply(formatError('Hanya <b>owner</b> yang bisa mengelola seller.'), {
          parse_mode: 'HTML',
        });
        return;
      }

      if (sub === 'add') {
        const targetId = parseInt(parts[1], 10);
        if (!Number.isFinite(targetId)) {
          ctx.reply(formatError('Masukkan ID user.\nContoh: <code>/seller add 123456789</code>'), {
            parse_mode: 'HTML',
          });
          return;
        }

        const result = sellerService.addSeller({ userId: targetId, addedBy: userId });
        if (!result.success) {
          ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
          return;
        }

        ctx.reply(
          formatSuccess(
            `Seller <code>${targetId}</code> ditambahkan.\n\n` +
              `<i>Seller mengatur profitnya sendiri lewat</i> <code>/seller setprofit</code>`
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (sub === 'remove') {
        const targetId = parseInt(parts[1], 10);
        if (!Number.isFinite(targetId)) {
          ctx.reply(formatError('Masukkan ID user.'), { parse_mode: 'HTML' });
          return;
        }

        if (!sellerService.removeSeller(targetId)) {
          ctx.reply(formatError(`User <code>${targetId}</code> bukan seller.`), {
            parse_mode: 'HTML',
          });
          return;
        }

        ctx.reply(formatSuccess(`Seller <code>${targetId}</code> dihapus.`), { parse_mode: 'HTML' });
        return;
      }

      if (sub === 'list') {
        const all = sellerService.getAllSellers();
        if (!all.length) {
          ctx.reply(formatSuccess('Belum ada seller.'), { parse_mode: 'HTML' });
          return;
        }

        const hargaAdmin = orderService.getPricePerToken();
        const lines = [`🏪 <b>DAFTAR SELLER</b>`, `─────────────────────`, ``];

        all.forEach((s, i) => {
          const hargaSeller = orderService.getPricePerToken(undefined, s.profitPerToken || 0);
          lines.push(`<b>${i + 1}. <code>${s.userId}</code></b>`);
          lines.push(`   Profit: ${rupiah(s.profitPerToken || 0)} / token`);
          lines.push(`   Harga user: ${rupiah(hargaSeller)} / token`);
          lines.push(`   Saldo: ${rupiah(s.balance || 0)}`);
          lines.push('');
        });

        lines.push(`─────────────────────`);
        lines.push(`Total: <b>${all.length}</b> seller`);
        lines.push(`<i>Harga dasar admin: ${rupiah(hargaAdmin)} / token</i>`);

        ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
        return;
      }
    }

    ctx.reply(formatError('Subcommand tidak dikenal. Ketik <code>/seller</code> untuk bantuan.'), {
      parse_mode: 'HTML',
    });
  });

  // ─── /selesai (reply notifikasi penarikan seller) ────────
  bot.command('selesai', async (ctx) => {
    const userId = ctx.from.id;

    if (!isMainAdmin(userId)) {
      ctx.reply(formatError('Hanya <b>owner</b>.'), { parse_mode: 'HTML' });
      return;
    }

    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) {
      ctx.reply(
        formatError(
          'Gunakan dengan cara <b>reply</b> ke pesan pengajuan penarikan.\n\n' +
            'Ketik <code>/selesai</code> setelah transfer dilakukan.'
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    const wd = sellerService.findByAdminMessage(ctx.chat.id, replyTo.message_id);
    if (!wd) {
      ctx.reply(formatError('Tidak ada pengajuan seller yang terhubung dengan pesan ini.'), {
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

    const updated = sellerService.markWithdrawalDone(wd.id, userId);

    ctx.reply(
      formatSuccess(
        `<b>Penarikan seller ditandai selesai</b>\n\n` +
          `<b>ID:</b> <code>${updated.id}</code>\n` +
          `<b>Seller:</b> <code>${updated.sellerId}</code>\n` +
          `<b>Nominal:</b> ${rupiah(updated.amount)}\n` +
          `<b>Wallet:</b> ${sellerService.walletLabel(updated.wallet)} — <code>${updated.account}</code>`
      ),
      { parse_mode: 'HTML' }
    );

    try {
      await ctx.telegram.sendMessage(
        updated.sellerId,
        `✅ <b>Penarikan selesai</b>\n\n` +
          `<b>Nominal:</b> ${rupiah(updated.amount)}\n` +
          `<b>Wallet:</b> ${sellerService.walletLabel(updated.wallet)}\n` +
          `<b>Ke:</b> <code>${updated.account}</code>\n\n` +
          `<i>Dana sudah ditransfer. Terima kasih!</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error(`[seller] gagal notif seller ${updated.sellerId}:`, err.message);
    }
  });
}

module.exports = { register, initSetupAdmins, rewardSeller, isMainAdmin, rupiah, buildRefLink };
