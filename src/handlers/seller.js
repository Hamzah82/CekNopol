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

/** Permintaan penarikan yang menunggu konfirmasi tombol: userId -> {amount, wallet, account, at} */
const pendingWd = new Map();

/** Wizard setwallet yang menunggu input nomor: userId -> {wallet, at} */
const pendingWallet = new Map();

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

/** Item per halaman daftar undangan seller */
const PER_PAGE_INVITED = 10;

/**
 * Susun daftar user yang diundang seorang seller, dengan paginasi.
 *
 * @param {number} sellerId
 * @param {number} page
 * @returns {{text: string, keyboard: object|null}}
 */
function buildInvitedList(sellerId, page) {
  const resellerService = require('../services/resellerService');

  const diundang = sellerService.getUsersInvitedBy(sellerId);
  const resellers = resellerService.getResellersOfSeller(sellerId);

  if (!diundang.length) {
    return {
      text:
        `👥 <b>USER YANG KAMU UNDANG</b>\n` +
        `─────────────────────\n\n` +
        `<i>Belum ada user yang masuk lewat link kamu.</i>\n\n` +
        `Bagikan link kamu: <code>/seller link</code>`,
      keyboard: null,
    };
  }

  const totalPages = Math.ceil(diundang.length / PER_PAGE_INVITED) || 1;
  let p = Math.floor(Number(page)) || 1;
  if (p > totalPages) p = totalPages;
  if (p < 1) p = 1;

  const start = (p - 1) * PER_PAGE_INVITED;
  const items = diundang.slice(start, start + PER_PAGE_INVITED);

  const L = [`👥 <b>USER YANG KAMU UNDANG</b>`, `─────────────────────`, ``];

  items.forEach((u, i) => {
    const nomor = start + i + 1;
    const jadiReseller = resellers.some((r) => Number(r.userId) === Number(u.userId));
    const tanda = jadiReseller ? ' <i>(reseller)</i>' : '';

    L.push(`<b>${nomor}. <code>${u.userId}</code></b>${tanda}`);
    if (u.firstSeen) {
      L.push(`   📅 ${new Date(u.firstSeen).toLocaleDateString('id-ID')}`);
    }
    L.push('');
  });

  L.push(`─────────────────────`);
  L.push(`📄 Halaman <b>${p}</b> / <b>${totalPages}</b>`);
  L.push(`👥 Total: <b>${diundang.length}</b> user`);
  L.push(`Dijadikan reseller: <b>${resellers.length}</b>`);

  // Tombol navigasi
  const nav = [];
  if (p > 1) nav.push({ text: '◀ Sebelumnya', callback_data: `slpg:${p - 1}` });
  if (p < totalPages) nav.push({ text: 'Berikutnya ▶', callback_data: `slpg:${p + 1}` });

  return {
    text: L.join('\n'),
    keyboard: nav.length ? { inline_keyboard: [nav] } : null,
  };
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
        const saved = sellerService.getWallet(userId);
        const hargaAdmin = orderService.getPricePerToken();
        const hargaSaya = orderService.getPricePerToken(undefined, s.profitPerToken || 0);

        lines.push(`Kamu terdaftar sebagai <b>seller</b>.`, ``);
        lines.push(`<b>💰 Kondisi kamu</b>`);
        lines.push(`Profit: <b>${rupiah(s.profitPerToken || 0)}</b> / token`);
        lines.push(`Harga jual kamu: <b>${rupiah(hargaSaya)}</b> / token`);
        lines.push(`Harga ke reseller: <b>${rupiah(sellerService.getPriceToReseller(userId, hargaSaya))}</b> / token`);
        lines.push(`Saldo: <b>${rupiah(s.balance || 0)}</b>`);
        lines.push(``, `<b>🏦 Wallet penarikan</b>`);
        if (saved) {
          lines.push(`${sellerService.walletLabel(saved.wallet)} — <code>${saved.account}</code>`);
        } else {
          lines.push(`<i>Belum diatur</i> ⚠️`);
        }
        lines.push(``, `<b>📋 Command</b>`);
        lines.push(`<code>/seller link</code> — link referral`);
        lines.push(`<code>/seller saldo</code> — rincian saldo`);
        lines.push(`<code>/seller setprofit &lt;nominal&gt;</code> — profit/token`);
        lines.push(`<code>/seller setprice &lt;nominal&gt;</code> — harga ke reseller`);
        lines.push(`<code>/seller setwallet</code> — atur wallet tujuan`);
        lines.push(`<code>/seller wd &lt;nominal&gt;</code> — cairkan saldo`);
        lines.push(``, `<i>Harga dasar: ${rupiah(hargaAdmin)} / token</i>`);
      } else if (isAdmin) {
        lines.push(`<b>Kelola Seller</b>`, ``);
        lines.push(`<code>/seller add &lt;ID&gt;</code> — daftarkan seller`);
        lines.push(`<code>/seller remove &lt;ID&gt;</code> — hapus seller`);
        lines.push(`<code>/seller list</code> — daftar seller`);
        lines.push(`<code>/seller wdlist</code> — penarikan menunggu`);
        lines.push(``, `<i>Hanya owner.</i>`);
        lines.push(``, `<i>Seller mengatur profit &amp; wallet sendiri lewat</i> <code>/seller</code>`);
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
          `🏷️ Harga jual kamu: <b>${rupiah(hargaSeller)}</b> / token`,
          `🏷️ Harga dasar: ${rupiah(hargaAdmin)} / token`,
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
        `Harga jual kamu: <b>${rupiah(hargaSeller)}</b> / token`,
        `Harga dasar: ${rupiah(hargaAdmin)} / token`,
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
            `Harga jual kamu: <b>${rupiah(hargaSeller)}</b> / token`,
            ``,
            `Harga dasar: ${rupiah(hargaAdmin)} / token`,
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
            `Harga jual kamu: <b>${rupiah(hargaBaru)}</b> / token\n\n` +
            `<i>Berlaku untuk order berikutnya. Profit admin tidak terpengaruh.</i>`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── /seller setprice <nominal> (harga ke reseller) ─────
    if (sub === 'setprice') {
      const s2 = sellerService.getSeller(userId);
      if (!s2) {
        ctx.reply(formatError('Hanya <b>seller</b> yang bisa mengatur harga.'), { parse_mode: 'HTML' });
        return;
      }

      const hargaDasar = orderService.getPricePerToken();
      const profitSeller = Math.max(0, Math.floor(Number(s2.profitPerToken) || 0));
      const hargaUser = orderService.getPricePerToken(undefined, profitSeller);
      const hargaReseller = sellerService.getPriceToReseller(userId, hargaUser);

      const nominalRaw = parts[1];

      if (!nominalRaw) {
        ctx.reply(
          [
            `⚙️ <b>HARGA KE RESELLER</b>`,
            ``,
            `Harga kamu ke reseller: <b>${rupiah(hargaReseller)}</b> / token`,
            ``,
            `Harga dasar (modal + owner): ${rupiah(hargaDasar)}`,
            `Harga kamu ke user biasa: <b>${rupiah(hargaUser)}</b>`,
            ``,
            `<i>Ini harga TOTAL yang dibayar reseller kamu.`,
            `Reseller lalu menambahkan profitnya sendiri di atas harga ini.</i>`,
            ``,
            `Gunakan: <code>/seller setprice &lt;nominal&gt;</code>`,
            `Contoh: <code>/seller setprice 3000</code>`,
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

      const result = sellerService.setPriceToReseller(userId, nominal, hargaDasar);
      if (!result.success) {
        ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
        return;
      }

      ctx.reply(
        formatSuccess(
          `<b>Harga ke reseller diperbarui</b>\n\n` +
            `Harga ke reseller: <b>${rupiah(result.data.priceToReseller)}</b> / token\n` +
            `Harga ke user biasa: ${rupiah(hargaUser)} / token\n\n` +
            `<i>Berlaku untuk order berikutnya.</i>`
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

      // Wajib set wallet dulu
      const saved = sellerService.getWallet(userId);
      if (!saved) {
        ctx.reply(
          formatError(
            'Kamu belum mengatur wallet tujuan penarikan.\n\n' +
              'Atur dulu dengan: <code>/seller setwallet</code>'
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Format baru: /seller wd <nominal>
      const nominalRaw = parts[1];
      if (!nominalRaw) {
        ctx.reply(
          formatError(
            `Format salah.\n\n<code>/seller wd &lt;nominal&gt;</code>\n\n` +
              `Contoh: <code>/seller wd 50000</code>\n\n` +
              `Tujuan: ${sellerService.walletLabel(saved.wallet)} — <code>${saved.account}</code>\n` +
              `<i>Ubah tujuan dengan</i> <code>/seller setwallet</code>`
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

      if (nominal < sellerService.MIN_WITHDRAW) {
        ctx.reply(
          formatError(
            `Minimum penarikan <b>${rupiah(sellerService.MIN_WITHDRAW)}</b>.\n\n` +
              `Saldo kamu: <b>${rupiah(s.balance || 0)}</b>`
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      if ((s.balance || 0) < nominal) {
        ctx.reply(
          formatError(
            `Saldo tidak mencukupi.\n\n` +
              `Saldo kamu: <b>${rupiah(s.balance || 0)}</b>\n` +
              `Diminta: <b>${rupiah(nominal)}</b>`
          ),
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Simpan permintaan sementara, minta konfirmasi lewat tombol
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
          `<b>Wallet:</b> ${sellerService.walletLabel(saved.wallet)}`,
          `<b>Ke:</b> <code>${saved.account}</code>`,
          ``,
          `Saldo setelah penarikan: <b>${rupiah((s.balance || 0) - nominal)}</b>`,
          ``,
          `─────────────────────`,
          `Benar ingin menarik ke rekening ini?`,
        ].join('\n'),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Ya, Lanjutkan', callback_data: 'swd:ok' }],
              [{ text: '❌ Batal', callback_data: 'swd:cancel' }],
            ],
          },
        }
      );
      return;
    }

    // ─── /seller setwallet (wizard) ─────────────────────────
    if (sub === 'setwallet') {
      const s = sellerService.getSeller(userId);
      if (!s) {
        ctx.reply(formatError('Kamu belum terdaftar sebagai seller.'), { parse_mode: 'HTML' });
        return;
      }

      const current = sellerService.getWallet(userId);
      const lines = [`🏦 <b>ATUR WALLET PENARIKAN</b>`, `─────────────────────`, ``];

      if (current) {
        lines.push(
          `Wallet sekarang: <b>${sellerService.walletLabel(current.wallet)}</b>`,
          `Nomor: <code>${current.account}</code>`,
          ``
        );
      }

      lines.push(`Silakan pilih jenis wallet kamu:`);

      // Tombol pilihan wallet
      const rows = sellerService.WALLETS.map((w) => [
        { text: sellerService.walletLabel(w), callback_data: `swl:${w}` },
      ]);

      ctx.reply(lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows },
      });
      return;
    }

    // ─── /seller list: dua fungsi (owner vs seller) ──────────
    if (sub === 'list') {
      if (isMainAdmin(userId)) {
        // Owner: daftar SEMUA seller
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
          lines.push(`   Harga jual: ${rupiah(hargaSeller)} / token`);
          lines.push(`   Saldo: ${rupiah(s.balance || 0)}`);
          lines.push('');
        });

        lines.push(`─────────────────────`);
        lines.push(`Total: <b>${all.length}</b> seller`);
        lines.push(`<i>Harga dasar: ${rupiah(hargaAdmin)} / token</i>`);

        ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
        return;
      }

      // Seller: daftar user yang DIA undang
      const saya = sellerService.getSeller(userId);
      if (!saya) {
        ctx.reply(formatError('Hanya <b>owner</b> atau <b>seller</b>.'), { parse_mode: 'HTML' });
        return;
      }

      const halaman = parseInt(String(parts[1] || '1'), 10) || 1;
      const hasil = buildInvitedList(userId, halaman);

      const opts = { parse_mode: 'HTML' };
      if (hasil.keyboard) opts.reply_markup = hasil.keyboard;

      ctx.reply(hasil.text, opts);
      return;
    }

    // ─── Subcommand owner ───────────────────────────────────
    if (['add', 'remove'].includes(sub)) {
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

    }

    ctx.reply(formatError('Subcommand tidak dikenal. Ketik <code>/seller</code> untuk bantuan.'), {
      parse_mode: 'HTML',
    });
  });

  // ─── Tombol pilih wallet (wizard setwallet) ──────────────
  bot.action(/^swl:/, async (ctx) => {
    const userId = ctx.from.id;
    const data = (ctx.callbackQuery && ctx.callbackQuery.data) || '';
    const walletKey = data.slice(4);

    const seller = sellerService.getSeller(userId);
    if (!seller) {
      await ctx.answerCbQuery('Kamu bukan seller.', { show_alert: true });
      return;
    }

    const wallet = sellerService.normalizeWallet(walletKey);
    if (!wallet) {
      await ctx.answerCbQuery('Wallet tidak dikenal.', { show_alert: true });
      return;
    }

    // Simpan pilihan, tunggu user mengirim nomor
    pendingWallet.set(userId, { wallet, at: Date.now() });

    await ctx.answerCbQuery('Pilihan tersimpan');

    const label = sellerService.walletLabel(wallet);
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
      console.error('[seller] gagal edit pesan setwallet:', err.message);
    }
  });

  // ─── Tombol konfirmasi penarikan ─────────────────────────
  bot.action('swd:ok', async (ctx) => {
    const userId = ctx.from.id;
    const req = pendingWd.get(userId);

    if (!req) {
      await ctx.answerCbQuery('Permintaan sudah tidak berlaku. Ulangi /seller wd', { show_alert: true });
      return;
    }

    pendingWd.delete(userId);

    // ─── Validasi ulang saldo ke-2: kondisi bisa berubah sejak konfirmasi ───
    const cek = sellerService.getSeller(userId);
    if (!cek) {
      await ctx.answerCbQuery('Bukan seller.', { show_alert: true });
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
              `<i>Ajukan ulang dengan</i> <code>/seller wd &lt;nominal&gt;</code>`
          ),
          { parse_mode: 'HTML' }
        )
        .catch(() => {});
      return;
    }

    if (req.amount < sellerService.MIN_WITHDRAW) {
      await ctx.answerCbQuery('Nominal di bawah minimum', { show_alert: true });
      await ctx
        .editMessageText(
          formatError(`Minimum penarikan <b>${rupiah(sellerService.MIN_WITHDRAW)}</b>.`),
          { parse_mode: 'HTML' }
        )
        .catch(() => {});
      return;
    }

    // Simpan kondisi terbaru untuk ditampilkan
    req.wallet = sellerService.getWallet(userId)?.wallet || req.wallet;
    req.account = sellerService.getWallet(userId)?.account || req.account;

    const result = sellerService.createWithdrawal({
      sellerId: userId,
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
            `<b>Wallet:</b> ${sellerService.walletLabel(wd.wallet)}\n` +
            `<b>Ke:</b> <code>${wd.account}</code>\n\n` +
            `Sisa saldo: <b>${rupiah(result.balance)}</b>\n\n` +
            `<i>Owner akan memproses penarikanmu.</i>`
        ),
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[seller] gagal edit konfirmasi wd:', err.message);
    }

    // Notifikasi ke owner
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
  });

  // ─── Tombol batal penarikan ──────────────────────────────
  bot.action('swd:cancel', async (ctx) => {
    const userId = ctx.from.id;
    pendingWd.delete(userId);

    await ctx.answerCbQuery('Dibatalkan');
    try {
      await ctx.editMessageText('❌ <b>Penarikan dibatalkan.</b>\n\nSaldo kamu tidak berubah.', {
        parse_mode: 'HTML',
      });
    } catch (err) {
      console.error('[seller] gagal edit batal wd:', err.message);
    }
  });

  // ─── /batal (batalkan wizard setwallet) ──────────────────
  bot.command('batal', async (ctx) => {
    const userId = ctx.from.id;
    if (pendingWallet.delete(userId)) {
      ctx.reply('❌ Pengaturan wallet dibatalkan.', { parse_mode: 'HTML' });
    }
  });

  // ─── Tangkap input nomor wallet ──────────────────────────
  // Didaftarkan SETELAH handler lain; hanya aktif bila user
  // sedang dalam wizard setwallet.
  bot.on('message', async (ctx, next) => {
    const userId = ctx.from.id;
    const state = pendingWallet.get(userId);
    if (!state) return next();

    const msg = ctx.message;
    if (!msg || !msg.text) return next();
    if (msg.entities && msg.entities.some((e) => e.type === 'bot_command')) return next();

    const account = msg.text.trim();
    if (!account) return next();

    // Validasi ringan: hanya angka, spasi, tanda hubung, plus
    if (!/^[0-9+\-\s]{6,25}$/.test(account)) {
      ctx.reply(
        formatError(
          'Nomor tidak valid.\n\nKirim hanya angka, contoh:\n' +
            '<code>08123456789</code>\n\n' +
            '<i>Ketik /batal untuk membatalkan.</i>'
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    pendingWallet.delete(userId);

    const result = sellerService.setWallet(userId, state.wallet, account);
    if (!result.success) {
      ctx.reply(formatError(result.error), { parse_mode: 'HTML' });
      return;
    }

    ctx.reply(
      formatSuccess(
        `<b>Wallet berhasil disimpan</b>\n\n` +
          `<b>Wallet:</b> ${sellerService.walletLabel(state.wallet)}\n` +
          `<b>Nomor:</b> <code>${account}</code>\n\n` +
          `Sekarang kamu bisa menarik saldo dengan:\n` +
          `<code>/seller wd &lt;nominal&gt;</code>`
      ),
      { parse_mode: 'HTML' }
    );
  });

  // ─── Navigasi halaman daftar undangan seller ────────────
  bot.action(/^slpg:/, async (ctx) => {
    const userId = ctx.from.id;

    if (!sellerService.isSeller(userId)) {
      await ctx.answerCbQuery('Khusus seller.', { show_alert: true });
      return;
    }

    const data = (ctx.callbackQuery && ctx.callbackQuery.data) || '';
    const halaman = parseInt(data.split(':')[1], 10) || 1;

    const hasil = buildInvitedList(userId, halaman);

    const opts = { parse_mode: 'HTML' };
    if (hasil.keyboard) opts.reply_markup = hasil.keyboard;

    try {
      await ctx.editMessageText(hasil.text, opts);
    } catch (err) {
      if (!/message is not modified/i.test(err.message || '')) {
        console.error('[seller] gagal edit daftar undangan:', err.message);
      }
    }

    await ctx.answerCbQuery().catch(() => {});
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
