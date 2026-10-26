/**
 * reseller.js — Handler /reseller (lapis kedua di bawah seller)
 *
 * Struktur: Owner -> Seller -> Reseller -> User
 *
 * Aturan penting:
 *   - SELLER hanya bisa mendaftarkan reseller dari user yang DIUNDANGNYA
 *   - Reseller mengambil profit dari penjualan ke user-nya sendiri
 *   - Profit owner & seller tidak berkurang
 *
 * Command:
 *   /reseller add <ID>            — daftarkan reseller (seller)
 *   /reseller remove <ID>         — hapus reseller (seller/owner)
 *   /reseller list                — daftar reseller (seller/owner)
 *   /reseller setprofit <nominal> — profit reseller per token
 *   /reseller setwallet           — atur wallet (wizard)
 *   /reseller link                — link referral
 *   /reseller saldo               — saldo & statistik
 *   /reseller wd <nominal>        — cairkan saldo
 *   /reseller wdlist              — penarikan menunggu (owner)
 *   /resdone                      — reply notifikasi WD reseller (owner)
 */

const resellerService = require('../services/resellerService');
const sellerService = require('../services/sellerService');
const orderService = require('../services/orderService');
const cooldownService = require('../services/cooldownService');
const { formatError, formatSuccess } = require('../utils/format');

/** @type {number[]} */
let setupAdminIds = [];

/** @type {string} */
let botUsername = '';

/** Permintaan WD menunggu konfirmasi tombol */
const pendingWd = new Map();

/** Wizard setwallet menunggu input nomor */
const pendingWallet = new Map();

/**
 * Inisialisasi
 */
function initSetupAdmins(ids, username) {
  setupAdminIds = ids || [];
  botUsername = username || '';
}

function isMainAdmin(userId) {
  return setupAdminIds.includes(Number(userId));
}

function rupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

function buildRefLink(userId) {
  if (!botUsername) return null;
  return `https://t.me/${botUsername}?start=rsl_${userId}`;
}

/**
 * Harga jual reseller ke user-nya.
 * = harga seller ke reseller + profit reseller
 *
 * @param {object} reseller
 * @returns {number}
 */
function hitungHargaJualReseller(reseller) {
  const hargaDasarOwner = orderService.getPricePerToken();
  const seller = sellerService.getSeller(reseller.sellerId);

  // Harga seller ke reseller (default = harga jual seller ke user biasa)
  const sellerProfit = seller ? Math.max(0, Math.floor(Number(seller.profitPerToken) || 0)) : 0;
  const hargaUserSeller = orderService.getPricePerToken(undefined, sellerProfit);
  const hargaKeReseller = sellerService.getPriceToReseller(reseller.sellerId, hargaUserSeller);

  const profitReseller = Math.max(0, Math.floor(Number(reseller.profitPerToken) || 0));

  return {
    hargaDasarOwner,
    hargaKeReseller,
    hargaJual: hargaKeReseller + profitReseller,
    profitReseller,
    sellerProfit,
  };
}

/**
 * Bagikan profit reseller saat order diterima
 */
function rewardReseller({ userId, amount, resellerProfitPerToken, resellerId: resellerIdTerkunci }) {
  // Utamakan resellerId yang TERKUNCI di order.
  const resellerId = resellerIdTerkunci || resellerService.getResellerIdForUser(userId);
  if (!resellerId) return null;

  const r = resellerService.getReseller(resellerId);
  if (!r) {
    const perTokenHilang = Math.max(0, Math.floor(Number(resellerProfitPerToken) || 0));
    return {
      resellerId: Number(resellerId),
      earned: perTokenHilang * Math.max(0, Number(amount) || 0),
      profitPerToken: perTokenHilang,
      hilang: true,
    };
  }

  const perToken = Math.max(0, Math.floor(Number(resellerProfitPerToken) || 0));
  const earned = perToken * Math.max(0, Number(amount) || 0);

  if (earned > 0) resellerService.addBalance(resellerId, earned);

  return { resellerId, earned, profitPerToken: perToken };
}

/**
 * Register handler /reseller & /resdone
 */
function register(bot) {
  bot.command('reseller', async (ctx) => {
    const userId = ctx.from.id;
    const raw = ctx.message.text.replace(/^\/reseller(@\w+)?\s*/i, '').trim();
    const parts = raw ? raw.split(/\s+/) : [];
    const sub = (parts[0] || '').toLowerCase();

    const sayaReseller = resellerService.isReseller(userId);
    const sayaSeller = sellerService.isSeller(userId);
    const sayaOwner = isMainAdmin(userId);

    // ─── Tanpa argumen: bantuan ─────────────────────────────
    if (!raw) {
      const lines = [`🏬 <b>RESELLER</b>`, ``];

      if (sayaReseller) {
        const r = resellerService.getReseller(userId);
        const h = hitungHargaJualReseller(r);
        const saved = resellerService.getWallet(userId);

        lines.push(`Kamu terdaftar sebagai <b>reseller</b>.`, ``);
        lines.push(`<b>💰 Kondisi kamu</b>`);
        lines.push(`Profit: <b>${rupiah(r.profitPerToken || 0)}</b> / token`);
        lines.push(`Harga jual kamu: <b>${rupiah(h.hargaJual)}</b> / token`);
        lines.push(`Saldo: <b>${rupiah(r.balance || 0)}</b>`);
        lines.push(``, `<b>🏦 Wallet</b>`);
        lines.push(saved ? `${resellerService.walletLabel(saved.wallet)} — <code>${saved.account}</code>` : `<i>Belum diatur</i> ⚠️`);
        lines.push(``, `<b>📋 Command</b>`);
        lines.push(`<code>/reseller link</code> — link referral`);
        lines.push(`<code>/reseller saldo</code> — rincian saldo`);
        lines.push(`<code>/reseller setprofit &lt;nominal&gt;</code> — atur profit`);
        lines.push(`<code>/reseller setwallet</code> — atur wallet`);
        lines.push(`<code>/reseller wd &lt;nominal&gt;</code> — cairkan`);
        lines.push(``, `<i>Harga dari seller: ${rupiah(h.hargaKeReseller)} / token</i>`);
      } else if (sayaSeller) {
        lines.push(`<b>Kelola Reseller</b>`, ``);
        lines.push(`<code>/reseller add &lt;ID&gt;</code> — daftarkan reseller`);
        lines.push(`<code>/reseller remove &lt;ID&gt;</code> — hapus reseller`);
        lines.push(`<code>/reseller list</code> — daftar reseller kamu`);
        lines.push(``, `<i>Hanya user yang kamu undang yang bisa didaftarkan.</i>`);
      } else if (sayaOwner) {
        lines.push(`<b>Kelola Reseller (owner)</b>`, ``);
        lines.push(`<code>/reseller list</code> — semua reseller`);
        lines.push(`<code>/reseller remove &lt;ID&gt;</code> — hapus reseller`);
        lines.push(`<code>/reseller wdlist</code> — penarikan menunggu`);
      } else {
        lines.push(`Kamu belum terdaftar sebagai reseller.`);
        lines.push(``, `<i>Hubungi seller yang mengundangmu.</i>`);
      }

      ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
      return;
    }

    // ─── /reseller link ─────────────────────────────────────
    if (sub === 'link') {
      const r = resellerService.getReseller(userId);
      if (!r) {
        ctx.reply(formatError('Kamu belum terdaftar sebagai reseller.'), { parse_mode: 'HTML' });
        return;
      }

      const link = buildRefLink(userId);
      if (!link) {
        ctx.reply(formatError('Username bot belum diset (<code>botUsername</code>).'), { parse_mode: 'HTML' });
        return;
      }

      const h = hitungHargaJualReseller(r);

      ctx.reply(
        [
          `🔗 <b>LINK REFERRAL RESELLER</b>`,
          ``,
          `<code>${link}</code>`,
          ``,
          `Setiap user <b>baru</b> yang masuk lewat link ini terhubung`,
          `ke kamu secara permanen.`,
          ``,
          `💰 Profit kamu: <b>${rupiah(r.profitPerToken || 0)}</b> / token`,
          `🏷️ Harga jual kamu: <b>${rupiah(h.hargaJual)}</b> / token`,
          `🏷️ Harga dari seller: ${rupiah(h.hargaKeReseller)} / token`,
          `💳 Saldo: <b>${rupiah(r.balance || 0)}</b>`,
        ].join('\n'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── /reseller saldo ────────────────────────────────────
    if (sub === 'saldo') {
      const r = resellerService.getReseller(userId);
      if (!r) {
        ctx.reply(formatError('Kamu belum terdaftar sebagai reseller.'), { parse_mode: 'HTML' });
        return;
      }

      const h = hitungHargaJualReseller(r);
      const seller = sellerService.getSeller(r.sellerId);

      ctx.reply(
        [
          `💳 <b>SALDO RESELLER</b>`,
          `─────────────────────`,
          ``,
          `Saldo: <b>${rupiah(r.balance || 0)}</b>`,
          `Total pendapatan: <b>${rupiah(r.totalEarned || 0)}</b>`,
          `Profit per token: <b>${rupiah(r.profitPerToken || 0)}</b>`,
          ``,
          `Harga jual kamu: <b>${rupiah(h.hargaJual)}</b> / token`,
          `Harga dari seller: ${rupiah(h.hargaKeReseller)} / token`,
          `Seller kamu: <code>${r.sellerId}</code>${seller ? '' : ' <i>(tidak aktif)</i>'}`,
          ``,
          `Minimum penarikan: <b>${rupiah(resellerService.MIN_WITHDRAW)}</b>`,
        ].join('\n'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── /reseller setprofit ────────────────────────────────
    if (sub === 'setprofit') {
      const r = resellerService.getReseller(userId);
      if (!r) {
        ctx.reply(formatError('Hanya <b>reseller</b> yang bisa mengatur profit.'), { parse_mode: 'HTML' });
        return;
      }

      const nominalRaw = parts[1];
      const h = hitungHargaJualReseller(r);

      if (!nominalRaw) {
        ctx.reply(
          [
            `⚙️ <b>PROFIT RESELLER</b>`,
            ``,
            `Profit kamu: <b>${rupiah(r.profitPerToken || 0)}</b> / token`,
            `Harga jual kamu: <b>${rupiah(h.hargaJual)}</b> / token`,
            ``,
            `Harga dari seller: ${rupiah(h.hargaKeReseller)} / token`,
            `<i>Profit kamu ditambahkan di atas harga seller.</i>`,
            ``,
            `Gunakan: <code>/reseller setprofit &lt;nominal&gt;</code>`,
            `Contoh: <code>/reseller setprofit 2000</code>`,
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

      const result = resellerService.setProfitPerToken(userId, nominal);
      if (!result.success) {
        ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
        return;
      }

      const hBaru = hitungHargaJualReseller(result.data);

      ctx.reply(
        formatSuccess(
          `<b>Profit reseller diperbarui</b>\n\n` +
            `Profit kamu: <b>${rupiah(result.data.profitPerToken)}</b> / token\n` +
            `Harga jual kamu: <b>${rupiah(hBaru.hargaJual)}</b> / token\n\n` +
            `<i>Berlaku untuk order berikutnya.</i>`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── /reseller setwallet (wizard) ───────────────────────
    if (sub === 'setwallet') {
      const r = resellerService.getReseller(userId);
      if (!r) {
        ctx.reply(formatError('Kamu belum terdaftar sebagai reseller.'), { parse_mode: 'HTML' });
        return;
      }

      const current = resellerService.getWallet(userId);
      const lines = [`🏦 <b>ATUR WALLET PENARIKAN</b>`, `─────────────────────`, ``];

      if (current) {
        lines.push(
          `Wallet sekarang: <b>${resellerService.walletLabel(current.wallet)}</b>`,
          `Nomor: <code>${current.account}</code>`,
          ``
        );
      }

      lines.push(`Silakan pilih jenis wallet kamu:`);

      const rows = resellerService.WALLETS.map((w) => [
        { text: resellerService.walletLabel(w), callback_data: `rwl:${w}` },
      ]);

      ctx.reply(lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows },
      });
      return;
    }

    // ─── /reseller wd <nominal> ─────────────────────────────
    if (sub === 'wd') {
      const r = resellerService.getReseller(userId);
      if (!r) {
        ctx.reply(formatError('Kamu belum terdaftar sebagai reseller.'), { parse_mode: 'HTML' });
        return;
      }

      const saved = resellerService.getWallet(userId);
      if (!saved) {
        ctx.reply(
          formatError('Kamu belum mengatur wallet tujuan.\n\nAtur dulu: <code>/reseller setwallet</code>'),
          { parse_mode: 'HTML' }
        );
        return;
      }

      const nominalRaw = parts[1];
      if (!nominalRaw) {
        ctx.reply(
          formatError(
            `Format salah.\n\n<code>/reseller wd &lt;nominal&gt;</code>\n\n` +
              `Contoh: <code>/reseller wd 50000</code>\n\n` +
              `Tujuan: ${resellerService.walletLabel(saved.wallet)} — <code>${saved.account}</code>`
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

      if (nominal < resellerService.MIN_WITHDRAW) {
        ctx.reply(
          formatError(
            `Minimum penarikan <b>${rupiah(resellerService.MIN_WITHDRAW)}</b>.\n\nSaldo kamu: <b>${rupiah(r.balance || 0)}</b>`
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      if ((r.balance || 0) < nominal) {
        ctx.reply(
          formatError(
            `Saldo tidak mencukupi.\n\nSaldo kamu: <b>${rupiah(r.balance || 0)}</b>\nDiminta: <b>${rupiah(nominal)}</b>`
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      pendingWd.set(userId, {
        amount: nominal,
        wallet: saved.wallet,
        account: saved.account,
        at: Date.now(),
      });

      ctx.reply(
        [
          `💸 <b>KONFIRMASI PENARIKAN</b>`,
          `─────────────────────`,
          ``,
          `<b>Nominal:</b> ${rupiah(nominal)}`,
          `<b>Wallet:</b> ${resellerService.walletLabel(saved.wallet)}`,
          `<b>Ke:</b> <code>${saved.account}</code>`,
          ``,
          `Saldo setelah penarikan: <b>${rupiah((r.balance || 0) - nominal)}</b>`,
          ``,
          `─────────────────────`,
          `Benar ingin menarik ke rekening ini?`,
        ].join('\n'),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Ya, Lanjutkan', callback_data: 'rwd:ok' }],
              [{ text: '❌ Batal', callback_data: 'rwd:cancel' }],
            ],
          },
        }
      );
      return;
    }

    // ─── /reseller wdlist (owner) ───────────────────────────
    if (sub === 'wdlist') {
      if (!isMainAdmin(userId)) {
        ctx.reply(formatError('Hanya <b>owner</b>.'), { parse_mode: 'HTML' });
        return;
      }

      const list = Object.values(resellerService.readWithdrawals())
        .filter((w) => w.status === 'menunggu')
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      if (!list.length) {
        ctx.reply(formatSuccess('Tidak ada penarikan reseller yang menunggu.'), { parse_mode: 'HTML' });
        return;
      }

      const lines = [`📋 <b>PENARIKAN RESELLER MENUNGGU</b>`, `─────────────────────`, ``];
      list.forEach((w, i) => {
        lines.push(`<b>${i + 1}. ${w.id}</b>`);
        lines.push(`Reseller: <code>${w.resellerId}</code>`);
        lines.push(`Wallet: ${resellerService.walletLabel(w.wallet)} — <code>${w.account}</code>`);
        lines.push(`Nominal: <b>${rupiah(w.amount)}</b>`);
        lines.push('');
      });
      lines.push(`─────────────────────`, `Total: <b>${list.length}</b> penarikan`);

      ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
      return;
    }

    // ─── /reseller add <ID> (SELLER) ────────────────────────
    if (sub === 'add') {
      if (!sayaSeller) {
        ctx.reply(formatError('Hanya <b>seller</b> yang bisa mendaftarkan reseller.'), { parse_mode: 'HTML' });
        return;
      }

      const targetId = parseInt(parts[1], 10);
      if (!Number.isFinite(targetId)) {
        ctx.reply(formatError('Masukkan ID user.\nContoh: <code>/reseller add 123456789</code>'), {
          parse_mode: 'HTML',
        });
        return;
      }

      // WAJIB: target harus user yang diundang seller ini
      const referrer = sellerService.getReferrer(targetId);
      if (referrer === null || Number(referrer) !== Number(userId)) {
        ctx.reply(
          formatError(
            `User <code>${targetId}</code> bukan user yang kamu undang.\n\n` +
              `<i>Kamu hanya bisa mendaftarkan reseller dari user yang masuk lewat link kamu.</i>\n` +
              `<i>Link kamu: <code>/seller link</code></i>`
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (sellerService.isSeller(targetId)) {
        ctx.reply(formatError('User ini sudah menjadi seller, tidak bisa dijadikan reseller.'), {
          parse_mode: 'HTML',
        });
        return;
      }

      const result = resellerService.addReseller({ userId: targetId, sellerId: userId });
      if (!result.success) {
        ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
        return;
      }

      ctx.reply(
        formatSuccess(
          `Reseller <code>${targetId}</code> ditambahkan.\n\n` +
            `<i>Dia mengatur profitnya sendiri lewat</i> <code>/reseller setprofit</code>`
        ),
        { parse_mode: 'HTML' }
      );

      // Beri tahu reseller baru
      try {
        await ctx.telegram.sendMessage(
          targetId,
          `🎉 <b>Kamu sekarang RESELLER</b>\n\n` +
            `Didaftarkan oleh seller <code>${userId}</code>.\n\n` +
            `Atur profit kamu: <code>/reseller setprofit &lt;nominal&gt;</code>\n` +
            `Ambil link referral: <code>/reseller link</code>`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('[reseller] gagal notif reseller baru:', err.message);
      }
      return;
    }

    // ─── /reseller remove <ID> ──────────────────────────────
    if (sub === 'remove') {
      const targetId = parseInt(parts[1], 10);
      if (!Number.isFinite(targetId)) {
        ctx.reply(formatError('Masukkan ID user.'), { parse_mode: 'HTML' });
        return;
      }

      const target = resellerService.getReseller(targetId);
      if (!target) {
        ctx.reply(formatError(`User <code>${targetId}</code> bukan reseller.`), { parse_mode: 'HTML' });
        return;
      }

      // Seller hanya boleh hapus reseller miliknya sendiri
      if (!isMainAdmin(userId) && Number(target.sellerId) !== Number(userId)) {
        ctx.reply(formatError('Kamu hanya bisa menghapus reseller milikmu sendiri.'), {
          parse_mode: 'HTML',
        });
        return;
      }

      resellerService.removeReseller(targetId);
      ctx.reply(formatSuccess(`Reseller <code>${targetId}</code> dihapus.`), { parse_mode: 'HTML' });
      return;
    }

    // ─── /reseller list ────────────────────────────────────
    if (sub === 'list') {
      let list;
      if (isMainAdmin(userId)) {
        list = resellerService.getAllResellers();
      } else if (sayaSeller) {
        list = resellerService.getResellersOfSeller(userId);
      } else {
        ctx.reply(formatError('Hanya <b>seller</b> atau <b>owner</b>.'), { parse_mode: 'HTML' });
        return;
      }

      if (!list.length) {
        ctx.reply(formatSuccess('Belum ada reseller.'), { parse_mode: 'HTML' });
        return;
      }

      const lines = [`🏬 <b>DAFTAR RESELLER</b>`, `─────────────────────`, ``];
      list.forEach((r, i) => {
        const h = hitungHargaJualReseller(r);
        lines.push(`<b>${i + 1}. <code>${r.userId}</code></b>`);
        lines.push(`   Seller: <code>${r.sellerId}</code>`);
        lines.push(`   Profit: ${rupiah(r.profitPerToken || 0)} / token`);
        lines.push(`   Harga jual: ${rupiah(h.hargaJual)} / token`);
        lines.push(`   Saldo: ${rupiah(r.balance || 0)}`);
        lines.push('');
      });
      lines.push(`─────────────────────`, `Total: <b>${list.length}</b> reseller`);

      ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
      return;
    }

    ctx.reply(formatError('Subcommand tidak dikenal. Ketik <code>/reseller</code> untuk bantuan.'), {
      parse_mode: 'HTML',
    });
  });

  // ─── Tombol pilih wallet ─────────────────────────────────
  bot.action(/^rwl:/, async (ctx) => {
    const userId = ctx.from.id;
    const data = (ctx.callbackQuery && ctx.callbackQuery.data) || '';
    const walletKey = data.slice(4);

    const r = resellerService.getReseller(userId);
    if (!r) {
      await ctx.answerCbQuery('Kamu bukan reseller.', { show_alert: true });
      return;
    }

    const wallet = resellerService.normalizeWallet(walletKey);
    if (!wallet) {
      await ctx.answerCbQuery('Wallet tidak dikenal.', { show_alert: true });
      return;
    }

    pendingWallet.set(userId, { wallet, at: Date.now() });
    await ctx.answerCbQuery('Pilihan tersimpan');

    const label = resellerService.walletLabel(wallet);
    // Bank pakai nomor rekening, e-wallet pakai nomor HP
    const isBank = wallet === 'bank jago' || wallet === 'seabank';
    const contoh = isBank
      ? 'contoh: <code>1234567890</code> (nomor rekening)'
      : 'contoh: <code>08123456789</code>';

    try {
      await ctx.editMessageText(
        [
          `🏦 <b>ATUR WALLET PENARIKAN</b>`,
          `─────────────────────`,
          ``,
          `Wallet dipilih: <b>${label}</b>`,
          ``,
          `Sekarang kirim <b>nomor</b> wallet kamu ke chat ini.`,
          `${contoh}`,
          ``,
          `<i>Ketik /batal untuk membatalkan.</i>`,
        ].join('\n'),
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[reseller] gagal edit setwallet:', err.message);
    }
  });

  // ─── Tombol konfirmasi WD ────────────────────────────────
  bot.action('rwd:ok', async (ctx) => {
    const userId = ctx.from.id;
    const req = pendingWd.get(userId);

    if (!req) {
      await ctx.answerCbQuery('Permintaan tidak berlaku. Ulangi /reseller wd', { show_alert: true });
      return;
    }

    pendingWd.delete(userId);

    // ─── Validasi ulang saldo ke-2: kondisi bisa berubah sejak konfirmasi ───
    const cek = resellerService.getReseller(userId);
    if (!cek) {
      await ctx.answerCbQuery('Bukan reseller.', { show_alert: true });
      return;
    }

    if ((cek.balance || 0) < req.amount) {
      await ctx.answerCbQuery('Saldo tidak mencukupi', { show_alert: true });
      await ctx
        .editMessageText(
          formatError(
            `Saldo kamu berubah dan sekarang tidak mencukupi.\n\n` +
              `Saldo saat ini: <b>${rupiah(cek.balance || 0)}</b>\n` +
              `Diminta: <b>${rupiah(req.amount)}</b>\n\n` +
              `<i>Ajukan ulang dengan</i> <code>/reseller wd &lt;nominal&gt;</code>`
          ),
          { parse_mode: 'HTML' }
        )
        .catch(() => {});
      return;
    }

    if (req.amount < resellerService.MIN_WITHDRAW) {
      await ctx.answerCbQuery('Nominal di bawah minimum', { show_alert: true });
      await ctx
        .editMessageText(
          formatError(`Minimum penarikan <b>${rupiah(resellerService.MIN_WITHDRAW)}</b>.`),
          { parse_mode: 'HTML' }
        )
        .catch(() => {});
      return;
    }

    // Simpan kondisi terbaru untuk ditampilkan
    const wNow = resellerService.getWallet(userId);
    if (wNow) {
      req.wallet = wNow.wallet;
      req.account = wNow.account;
    }

    const result = resellerService.createWithdrawal({
      resellerId: userId,
      wallet: req.wallet,
      account: req.account,
      amount: req.amount,
    });

    if (!result.success) {
      await ctx.answerCbQuery('Gagal', { show_alert: true });
      await ctx.editMessageText(formatError(result.error), { parse_mode: 'HTML' }).catch(() => {});
      return;
    }

    const wd = result.data;
    await ctx.answerCbQuery('Penarikan diajukan');

    try {
      await ctx.editMessageText(
        formatSuccess(
          `<b>Pengajuan penarikan dikirim</b>\n\n` +
            `<b>ID:</b> <code>${wd.id}</code>\n` +
            `<b>Nominal:</b> ${rupiah(wd.amount)}\n` +
            `<b>Wallet:</b> ${resellerService.walletLabel(wd.wallet)}\n` +
            `<b>Ke:</b> <code>${wd.account}</code>\n\n` +
            `Sisa saldo: <b>${rupiah(result.balance)}</b>`
        ),
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[reseller] gagal edit wd:', err.message);
    }

    const notif = [
      `💸 <b>PENGAJUAN PENARIKAN RESELLER</b>`,
      `─────────────────────`,
      ``,
      `<b>ID:</b> <code>${wd.id}</code>`,
      `<b>Reseller:</b> <code>${wd.resellerId}</code>`,
      `<b>Wallet:</b> ${resellerService.walletLabel(wd.wallet)}`,
      `<b>No. Tujuan:</b> <code>${wd.account}</code>`,
      `<b>Nominal:</b> <b>${rupiah(wd.amount)}</b>`,
      ``,
      `Sisa saldo reseller: ${rupiah(result.balance)}`,
      ``,
      `─────────────────────`,
      `Balas (reply) pesan ini dengan <code>/resdone</code> setelah transfer.`,
    ].join('\n');

    for (const adminId of setupAdminIds) {
      try {
        const sent = await bot.telegram.sendMessage(adminId, notif, { parse_mode: 'HTML' });
        if (sent && sent.message_id) {
          resellerService.attachAdminMessage(wd.id, { chatId: adminId, messageId: sent.message_id });
        }
      } catch (err) {
        console.error(`[reseller] gagal notif admin ${adminId}:`, err.message);
      }
    }
  });

  // ─── Tombol batal WD ─────────────────────────────────────
  bot.action('rwd:cancel', async (ctx) => {
    pendingWd.delete(ctx.from.id);
    await ctx.answerCbQuery('Dibatalkan');
    try {
      await ctx.editMessageText('❌ <b>Penarikan dibatalkan.</b>\n\nSaldo kamu tidak berubah.', {
        parse_mode: 'HTML',
      });
    } catch (err) {
      console.error('[reseller] gagal edit batal:', err.message);
    }
  });

  // ─── Tangkap input nomor wallet ──────────────────────────
  bot.on('message', async (ctx, next) => {
    const userId = ctx.from.id;
    const state = pendingWallet.get(userId);
    if (!state) return next();

    const msg = ctx.message;
    if (!msg || !msg.text) return next();
    if (msg.entities && msg.entities.some((e) => e.type === 'bot_command')) return next();

    const account = msg.text.trim();
    if (!account) return next();

    if (!/^[0-9+\-\s]{6,25}$/.test(account)) {
      ctx.reply(
        formatError(
          'Nomor tidak valid.\n\nKirim hanya angka, contoh:\n<code>08123456789</code>\n\n<i>Ketik /batal untuk membatalkan.</i>'
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    pendingWallet.delete(userId);

    const result = resellerService.setWallet(userId, state.wallet, account);
    if (!result.success) {
      ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
      return;
    }

    ctx.reply(
      formatSuccess(
        `<b>Wallet berhasil disimpan</b>\n\n` +
          `<b>Wallet:</b> ${resellerService.walletLabel(state.wallet)}\n` +
          `<b>Nomor:</b> <code>${account}</code>\n\n` +
          `Sekarang kamu bisa menarik saldo dengan:\n` +
          `<code>/reseller wd &lt;nominal&gt;</code>`
      ),
      { parse_mode: 'HTML' }
    );
  });

  // ─── /resdone (owner menandai WD reseller selesai) ───────
  bot.command('resdone', async (ctx) => {
    const userId = ctx.from.id;

    if (!isMainAdmin(userId)) {
      ctx.reply(formatError('Hanya <b>owner</b>.'), { parse_mode: 'HTML' });
      return;
    }

    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) {
      ctx.reply(
        formatError(
          'Gunakan dengan cara <b>reply</b> ke pesan pengajuan penarikan reseller.\n\n' +
            'Ketik <code>/resdone</code> setelah transfer.'
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    const wd = resellerService.findByAdminMessage(ctx.chat.id, replyTo.message_id);
    if (!wd) {
      ctx.reply(formatError('Tidak ada pengajuan reseller yang terhubung dengan pesan ini.'), {
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

    const updated = resellerService.markWithdrawalDone(wd.id, userId);

    ctx.reply(
      formatSuccess(
        `<b>Penarikan reseller selesai</b>\n\n` +
          `<b>ID:</b> <code>${updated.id}</code>\n` +
          `<b>Reseller:</b> <code>${updated.resellerId}</code>\n` +
          `<b>Nominal:</b> ${rupiah(updated.amount)}\n` +
          `<b>Wallet:</b> ${resellerService.walletLabel(updated.wallet)} — <code>${updated.account}</code>`
      ),
      { parse_mode: 'HTML' }
    );

    try {
      await ctx.telegram.sendMessage(
        updated.resellerId,
        `✅ <b>Penarikan selesai</b>\n\n` +
          `<b>Nominal:</b> ${rupiah(updated.amount)}\n` +
          `<b>Wallet:</b> ${resellerService.walletLabel(updated.wallet)}\n` +
          `<b>Ke:</b> <code>${updated.account}</code>\n\n` +
          `<i>Dana sudah ditransfer. Terima kasih!</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error(`[reseller] gagal notif reseller ${updated.resellerId}:`, err.message);
    }
  });
}

module.exports = { register, initSetupAdmins, rewardReseller, isMainAdmin, rupiah, buildRefLink, hitungHargaJualReseller };
