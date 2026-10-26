/**
 * buy.js — Handler pembelian token semi-otomatis via QRIS
 *
 * Alur:
 *   1. User kirim /buy <jumlah>  → bot buat order & kirim gambar QRIS + detail harga
 *   2. User kirim FOTO bukti TF  → bot teruskan ke semua admin + detail order
 *   3. Admin reply FOTO bukti tsb dengan /terima  → token ditambahkan + notif user
 *      Admin reply FOTO bukti tsb dengan /tolak <alasan> → order ditolak + notif user
 *
 * Command khusus main admin:
 *   /setprofit <nominal>  → atur nominal profit per transaksi
 */

const fs = require('fs');
const path = require('path');
const orderService = require('../services/orderService');
const sellerService = require('../services/sellerService');
const resellerService = require('../services/resellerService');
const tokenManager = require('../services/tokenManager');
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
 * Cek apakah user adalah main admin (hanya dari setup.json)
 * @param {number} userId
 * @returns {boolean}
 */
function isMainAdmin(userId) {
  return setupAdminIds.includes(Number(userId));
}


/**
 * Ambil ID main admin pertama (sumber saldo untuk transfer token).
 * /terima hanya bisa dijalankan main admin, jadi daftar ini pasti terisi.
 *
 * @returns {number}
 */
function getMainAdminId() {
  return Number(setupAdminIds[0]);
}

/**
 * Format nominal rupiah
 * @param {number} n
 * @returns {string}
 */
function rupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

/**
 * Format detail order untuk pesan ke admin
 * @param {object} order
 * @returns {string}
 */
function formatOrderDetail(order) {
  const lines = [
    `🧾 <b>Detail Pembelian Token</b>`,
    `─────────────────────`,
    ``,
    `<b>Order ID:</b> <code>${order.id}</code>`,
    `<b>User ID:</b> <code>${order.userId}</code>`,
  ];

  if (order.username) lines.push(`<b>Username:</b> @${order.username}`);
  if (order.fullName) lines.push(`<b>Nama:</b> ${escapeHtml(order.fullName)}`);

  // Info seller (bila user direferensikan seller)
  const sellerRefId = order.sellerId || sellerService.getReferrer(order.userId);
  if (sellerRefId) {
    lines.push(`<b>Seller:</b> <code>${sellerRefId}</code>`);
    if (order.sellerProfitPerToken) {
      lines.push(`<b>Profit seller:</b> ${rupiah(order.sellerProfitPerToken)} / token`);
    }
  }

  // Info reseller (bila user diundang reseller)
  const resellerRefId = order.resellerId || resellerService.getResellerIdForUser(order.userId);
  if (resellerRefId) {
    lines.push(`<b>Reseller:</b> <code>${resellerRefId}</code>`);
    if (order.resellerProfitPerToken) {
      lines.push(`<b>Profit reseller:</b> ${rupiah(order.resellerProfitPerToken)} / token`);
    }
  }

  lines.push(``, `─────────────────────`, ``);
  lines.push(`<b>Jumlah token:</b> ${order.amount}`);
  lines.push(`<b>Harga/token:</b> ${rupiah(order.pricePerToken)}`);
  lines.push(`<b>Subtotal:</b> ${rupiah(order.amount * order.pricePerToken)}`);
  lines.push(`<b>Profit admin:</b> ${rupiah(order.profit)}`);
  lines.push(``, `💰 <b>TOTAL HARUS DIBAYAR: ${rupiah(order.total)}</b>`);
  lines.push(``, `─────────────────────`, ``);
  lines.push(`Balas (reply) <b>foto bukti ini</b> dengan:`);
  lines.push(`<code>/terima</code> — untuk menyetujui`);
  lines.push(`<code>/tolak &lt;alasan&gt;</code> — untuk menolak`);

  return lines.join('\n');
}

/**
 * Escape karakter HTML
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
 * Ambil path absolut gambar QRIS & validasi keberadaannya
 * @returns {string|null}
 */
function resolveQrisPath() {
  const rel = orderService.getQrisPath();
  const candidates = [
    path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel),
    path.join(__dirname, '..', '..', rel),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch (_) {
      /* lanjut */
    }
  }
  return null;
}

/**
 * Kirim pesan ke semua admin (main admin dari setup.json)
 * @param {import('telegraf').Telegraf} bot
 * @param {object} payload - Opsi sendPhoto/sendMessage
 * @param {string} [photoFileId]
 * @returns {Promise<Array<{chatId: number, messageId: number}>>}
 */
async function sendToAdmins(bot, caption, photoFileId) {
  const sent = [];
  for (const adminId of setupAdminIds) {
    try {
      const res = photoFileId
        ? await bot.telegram.sendPhoto(adminId, photoFileId, {
            caption,
            parse_mode: 'HTML',
          })
        : await bot.telegram.sendMessage(adminId, caption, { parse_mode: 'HTML' });
      if (res && res.message_id) {
        sent.push({ chatId: adminId, messageId: res.message_id });
      }
    } catch (err) {
      console.error(`[buy] Gagal kirim ke admin ${adminId}:`, err.message);
    }
  }
  return sent;
}

/** Item per halaman pada daftar order */
const PER_PAGE_ORDERS = 10;

/** Label filter */
const LABEL_FILTER = {
  all: 'SEMUA ORDER',
  pending: 'ORDER PENDING',
  diterima: 'ORDER DITERIMA',
  ditolak: 'ORDER DITOLAK',
  kedaluwarsa: 'ORDER KEDALUWARSA',
};

/** Label status per order */
const LABEL_STATUS = {
  menunggu_bukti: '⏳ menunggu bukti',
  menunggu_verifikasi: '🔍 menunggu verifikasi',
  diterima: '✅ diterima',
  ditolak: '❌ ditolak',
  kedaluwarsa: '⏰ kedaluwarsa',
};

/**
 * Susun teks daftar order.
 *
 * @param {string} filter
 * @param {number} page
 * @returns {{text: string, keyboard: object|null}}
 */
function buildOrderList(filter, page) {
  const semua = orderService.getOrdersByFilter(filter);
  const ringkas = orderService.summarizeOrders(semua);

  if (!semua.length) {
    return {
      text: `📋 <b>${LABEL_FILTER[filter]}</b>\n\n<i>Tidak ada order.</i>`,
      keyboard: null,
    };
  }

  const totalPages = Math.ceil(semua.length / PER_PAGE_ORDERS) || 1;
  let p = Math.floor(Number(page)) || 1;
  if (p > totalPages) p = totalPages;
  if (p < 1) p = 1;

  const start = (p - 1) * PER_PAGE_ORDERS;
  const items = semua.slice(start, start + PER_PAGE_ORDERS);

  const L = [`📋 <b>${LABEL_FILTER[filter]}</b>`, `─────────────────────`, ``];

  items.forEach((o, i) => {
    const nomor = start + i + 1;
    const status = LABEL_STATUS[o.status] || o.status;

    L.push(`<b>${nomor}. <code>${o.id}</code></b> — ${status}`);
    L.push(`   User: <code>${o.userId}</code>${o.username ? ` (@${o.username})` : ''}`);
    L.push(`   ${o.amount} token | ${rupiah(o.total)}`);

    const info = [];
    if (o.sellerId) info.push(`Seller: <code>${o.sellerId}</code>`);
    if (o.resellerId) info.push(`Reseller: <code>${o.resellerId}</code>`);
    if (info.length) L.push(`   ${info.join(' | ')}`);

    if (o.status === 'ditolak' && o.reason) {
      L.push(`   <i>Alasan: ${escapeHtml(o.reason)}</i>`);
    }

    L.push('');
  });

  L.push(`─────────────────────`);
  L.push(`📄 Halaman <b>${p}</b> / <b>${totalPages}</b>`);
  L.push(`📦 Total ${ringkas.count} order | ${ringkas.tokens} token | ${rupiah(ringkas.total)}`);

  const rows = [];
  const nav = [];
  if (p > 1) nav.push({ text: '◀ Sebelumnya', callback_data: `ord:${filter}:${p - 1}` });
  if (p < totalPages) nav.push({ text: 'Berikutnya ▶', callback_data: `ord:${filter}:${p + 1}` });
  if (nav.length) rows.push(nav);

  return {
    text: L.join('\n'),
    keyboard: rows.length ? { inline_keyboard: rows } : null,
  };
}

/**
 * Kirim daftar order ke chat.
 *
 * @param {object} ctx
 * @param {string} filter
 * @param {number} page
 */
async function kirimDaftarOrder(ctx, filter, page) {
  const { text, keyboard } = buildOrderList(filter, page);

  const opts = { parse_mode: 'HTML', disable_web_page_preview: true };
  if (keyboard) opts.reply_markup = keyboard;

  await ctx.reply(text, opts);
}

/**
 * Register handler pembelian token
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  // ─── /buy <jumlah> ───────────────────────────────────────
  bot.command('buy', async (ctx) => {
    const userId = ctx.from.id;
    const raw = ctx.message.text.replace(/^\/buy(@\w+)?\s*/, '').trim();

    // ─── Daftar order (main admin): /buy <filter> [halaman] ───
    const kataPertama = (raw.split(/\s+/)[0] || '').toLowerCase();
    if (['all', 'pending', 'diterima', 'ditolak', 'kedaluwarsa'].includes(kataPertama)) {
      if (!isMainAdmin(userId)) {
        // Bukan owner -> diam, tanpa jejak
        return;
      }

      const halaman = parseInt(String(raw.split(/\s+/)[1] || '1'), 10) || 1;
      await kirimDaftarOrder(ctx, kataPertama, halaman);
      return;
    }

    const amount = parseInt(raw, 10);

    if (!raw || isNaN(amount) || amount <= 0) {
      ctx.reply(
        formatError('Format salah.\n\nGunakan: <code>/buy &lt;jumlah&gt;</code>\nContoh: <code>/buy 5</code>'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (amount > 1000) {
      ctx.reply(formatError('Jumlah token terlalu besar. Maksimal <b>1000</b> token per pembelian.'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // Cegah order ganda yang masih menunggu bukti
    const existing = orderService.getPendingProofOrder(userId);
    if (existing) {
      ctx.reply(
        `⏳ Kamu masih punya order yang <b>menunggu bukti transfer</b>.\n\n` +
          `<b>Order ID:</b> <code>${existing.id}</code>\n` +
          `<b>Jumlah:</b> ${existing.amount} token\n` +
          `<b>Total:</b> ${rupiah(existing.total)}\n\n` +
          `Silakan kirim <b>foto bukti transfer</b> untuk order ini, atau tunggu hingga selesai.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── Hitung bagian seller & reseller sesuai konteks ───
    //
    // Harga jual seller ke USER LANGSUNG berbeda dengan ke RESELLER,
    // jadi bagian seller juga harus dibedakan:
    //   - user langsung  -> profit seller di atas harga dasar
    //   - user via reseller -> selisih harga ke reseller dgn harga dasar
    const sellerId = sellerService.getReferrer(userId);
    const resellerId = resellerService.getResellerIdForUser(userId);

    const hargaDasarOwner = orderService.getPricePerToken();

    let sellerProfit = 0;
    if (sellerId) {
      if (resellerId) {
        // User diundang reseller -> pakai selisih harga ke reseller
        const seller = sellerService.getSeller(sellerId);
        const profitUserLangsung = seller
          ? Math.max(0, Math.floor(Number(seller.profitPerToken) || 0))
          : 0;
        const hargaUserSeller = orderService.getPricePerToken(undefined, profitUserLangsung);

        sellerProfit = sellerService.getSellerShareForUser(userId, hargaDasarOwner, hargaUserSeller);
      } else {
        // User langsung dari seller
        sellerProfit = sellerService.getProfitForUser(userId);
      }
    }

    const resellerProfit = resellerId ? resellerService.getProfitForUser(userId) : 0;

    const order = orderService.createOrder({
      userId,
      username: ctx.from.username || '',
      fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      amount,
      sellerProfit,
      sellerId,
      resellerProfit,
      resellerId,
    });

    const caption =
      `🛒 <b>Pembelian Token</b>\n` +
      `─────────────────────\n\n` +
      `<b>Order ID:</b> <code>${order.id}</code>\n` +
      `<b>Jumlah token:</b> ${order.amount}\n\n` +
      `💰 <b>TOTAL BAYAR: ${rupiah(order.total)}</b>\n\n` +
      `─────────────────────\n` +
      `📸 <b>Silakan scan QRIS di atas</b>, lalu kirim <b>foto bukti transfer</b> ke chat ini.\n\n` +
      `<i>Order akan diverifikasi admin setelah bukti dikirim.</i>`;

    const qrisPath = resolveQrisPath();
    if (qrisPath) {
      try {
        await ctx.replyWithPhoto({ source: qrisPath }, { caption, parse_mode: 'HTML' });
        return;
      } catch (err) {
        console.error('[buy] Gagal kirim foto QRIS:', err.message);
      }
    }

    // Fallback: QRIS tidak tersedia
    ctx.reply(
      caption +
        `\n\n⚠️ <i>Gambar QRIS belum tersedia di server. Hubungi admin untuk detail pembayaran.</i>`,
      { parse_mode: 'HTML' }
    );
  });

  // ─── Navigasi halaman daftar order ──────────────────────
  bot.action(/^ord:/, async (ctx) => {
    const userId = ctx.from.id;

    if (!isMainAdmin(userId)) {
      await ctx.answerCbQuery('Khusus admin.', { show_alert: true });
      return;
    }

    const data = (ctx.callbackQuery && ctx.callbackQuery.data) || '';
    const bagian = data.split(':'); // ord:<filter>:<halaman>
    const filter = bagian[1] || 'all';
    const halaman = parseInt(bagian[2], 10) || 1;

    const { text, keyboard } = buildOrderList(filter, halaman);

    const opts = { parse_mode: 'HTML', disable_web_page_preview: true };
    if (keyboard) opts.reply_markup = keyboard;

    try {
      await ctx.editMessageText(text, opts);
    } catch (err) {
      // Halaman sama / pesan tidak berubah -> abaikan
      if (!/message is not modified/i.test(err.message || '')) {
        console.error('[buy] gagal edit daftar order:', err.message);
      }
    }

    await ctx.answerCbQuery().catch(() => {});
  });

  // ─── Foto bukti transfer dari user ───────────────────────
  bot.on('photo', async (ctx, next) => {
    const userId = ctx.from.id;
    const order = orderService.getPendingProofOrder(userId);

    // Bukan user yang sedang menunggu bukti → teruskan ke handler lain
    if (!order) return next();

    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;

    const caption = formatOrderDetail(order);

    const sentList = await sendToAdmins(bot, caption, fileId);

    if (sentList.length === 0) {
      ctx.reply(
        formatError('Bukti transfer gagal diteruskan ke admin. Silakan hubungi admin langsung atau coba lagi nanti.'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Simpan mapping SEMUA pesan bukti di chat admin
    orderService.attachProof(order.id, {
      proofFileId: fileId,
      adminMessages: sentList,
    });

    ctx.reply(
      `📨 <b>Bukti transfer diterima!</b>\n\n` +
        `<b>Order ID:</b> <code>${order.id}</code>\n` +
        `<b>Jumlah:</b> ${order.amount} token\n` +
        `<b>Total:</b> ${rupiah(order.total)}\n\n` +
        `Bukti kamu sudah diteruskan ke admin. Mohon tunggu proses verifikasi.\n` +
        `<i>Token akan otomatis ditambahkan setelah admin menyetujui.</i>`,
      { parse_mode: 'HTML' }
    );

    // ─── Bubble AFK (dikirim terpisah, jeda 2 detik) ───
    // Dikirim sebagai pesan baru, bukan digabung, supaya user sempat
    // membaca konfirmasi bukti lebih dulu.
    try {
      const st = orderService.getAfk();
      if (st.afk) {
        await new Promise((r) => setTimeout(r, 2000));

        await ctx.reply(
          `🌙 <b>Admin sedang AFK</b>\n\n` +
            `<b>Alasan:</b> ${escapeHtml(st.afkReason || 'tidak disebutkan')}\n\n` +
            `Pembelian kamu <b>tetap aman dan sudah tercatat</b>. Hanya saja ` +
            `verifikasinya mungkin agak lebih lama dari biasanya.\n\n` +
            `Tidak perlu mengirim ulang bukti transfer ya. Begitu admin kembali, ` +
            `pesananmu langsung diproses dan token otomatis masuk.\n\n` +
            `<i>Terima kasih sudah bersabar 🙏</i>`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (err) {
      console.error('[buy] gagal kirim pesan AFK:', err.message);
    }
  });

  // ─── Pesan selain foto → batalkan order ──────────────────
  // Jika user sedang menunggu bukti transfer lalu mengirim pesan
  // selain foto (teks, sticker, dokumen, voice, video, dll),
  // order otomatis dibatalkan dan user harus /buy lagi.
  bot.on('message', async (ctx, next) => {
    const msg = ctx.message;
    if (!msg || !ctx.from) return next();

    // Command tetap diproses handler masing-masing
    if (Array.isArray(msg.entities) && msg.entities.some((e) => e.type === 'bot_command')) return next();

    // Foto ditangani handler photo di atas
    if (msg.photo) return next();

    // Tidak ada order menggantung -> teruskan ke handler lain
    const order = orderService.getPendingProofOrder(ctx.from.id);
    if (!order) return next();

    // Batalkan order
    orderService.cancelOrder(order.id);

    ctx.reply(
      `❌ <b>Pembelian dibatalkan</b>\n\n` +
        `<b>Order ID:</b> <code>${order.id}</code>\n` +
        `<b>Jumlah:</b> ${order.amount} token\n` +
        `<b>Total:</b> ${rupiah(order.total)}\n\n` +
        `Kamu mengirim pesan selain <b>foto bukti transfer</b>, sehingga order otomatis dibatalkan.\n\n` +
        `Silakan buat order baru dengan <code>/buy &lt;jumlah&gt;</code>, lalu kirim <b>foto</b> bukti transfer.`,
      { parse_mode: 'HTML' }
    );
  });

  // ─── /afk on <alasan> | /afk off (main admin) ───────────
  bot.command('afk', (ctx) => {
    const userId = ctx.from.id;

    if (!isMainAdmin(userId)) {
      return; // bukan owner -> diam total
    }

    const raw = ctx.message.text.replace(/^\/afk(@\w+)?\s*/i, '').trim();
    const parts = raw ? raw.split(/\s+/) : [];
    const aksi = (parts[0] || '').toLowerCase();

    // /afk (tanpa argumen) -> lihat status
    if (!aksi) {
      const st = orderService.getAfk();
      ctx.reply(
        st.afk
          ? `🌙 <b>Status: AFK</b>\n\n<b>Alasan:</b> ${escapeHtml(st.afkReason || '-')}\n\n` +
              `<i>Matikan dengan</i> <code>/afk off</code>`
          : `☀️ <b>Status: AKTIF</b>\n\n` +
              `<i>Aktifkan dengan</i> <code>/afk on &lt;alasan&gt;</code>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (aksi === 'off') {
      const hasil = orderService.setAfk(false);

      ctx.reply(
        `☀️ <b>Status AFK dimatikan</b>\n\n` +
          `<i>Pembeli tidak akan menerima pesan AFK lagi.</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (aksi === 'on') {
      const alasan = parts.slice(1).join(' ').trim();

      if (!alasan) {
        ctx.reply(
          formatError('Masukkan alasan AFK.\n\nContoh: <code>/afk on sedang istirahat</code>'),
          { parse_mode: 'HTML' }
        );
        return;
      }

      const hasil = orderService.setAfk(true, alasan);

      ctx.reply(
        `🌙 <b>Status AFK diaktifkan</b>\n\n` +
          `<b>Alasan:</b> ${escapeHtml(hasil.afkReason)}\n\n` +
          `<i>Pembeli yang mengirim bukti transfer akan menerima pemberitahuan ini.</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    ctx.reply(
      formatError(
        'Format salah.\n\n' +
          '<code>/afk on &lt;alasan&gt;</code> — aktifkan\n' +
          '<code>/afk off</code> — matikan\n' +
          '<code>/afk</code> — lihat status'
      ),
      { parse_mode: 'HTML' }
    );
  });

  // ─── /setprofit <nominal> ────────────────────────────────
  bot.command('setprofit', (ctx) => {
    const userId = ctx.from.id;
    if (!isMainAdmin(userId)) {
      ctx.reply(formatError('Hanya <b>main admin</b> yang bisa mengatur profit.'), { parse_mode: 'HTML' });
      return;
    }

    const raw = ctx.message.text.replace(/^\/setprofit(@\w+)?\s*/, '').trim();
    if (!raw) {
      const current = orderService.getProfit();
      const hargaSekarang = orderService.getPricePerToken();
      ctx.reply(
        `⚙️ <b>Pengaturan Profit</b>\n\n` +
          `Profit saat ini: <b>${rupiah(current)}</b>\n` +
          `Harga token sekarang: <b>${rupiah(hargaSekarang)}</b> / token\n\n` +
          `<i>Harga token = ${rupiah(orderService.BASE_PRICE_PER_TOKEN)} + profit.</i>\n\n` +
          `Gunakan: <code>/setprofit &lt;nominal&gt;</code>\n` +
          `Contoh: <code>/setprofit 100</code> → harga token jadi ${rupiah(
            orderService.BASE_PRICE_PER_TOKEN + 100
          )}`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Dukung format "2000", "2.000", "Rp2000"
    const cleaned = raw.replace(/[^0-9]/g, '');
    const nominal = parseInt(cleaned, 10);

    if (isNaN(nominal) || nominal < 0) {
      ctx.reply(formatError('Nominal profit harus berupa angka ≥ 0.\nContoh: <code>/setprofit 100</code>'), {
        parse_mode: 'HTML',
      });
      return;
    }

    const newProfit = orderService.setProfit(nominal);
    const hargaBaru = orderService.getPricePerToken();

    ctx.reply(
      `✅ <b>Profit berhasil diatur</b>\n\n` +
        `Profit: <b>${rupiah(newProfit)}</b> / token\n` +
        `Harga token: ${rupiah(orderService.BASE_PRICE_PER_TOKEN)} + ${rupiah(newProfit)} = <b>${rupiah(
          hargaBaru
        )}</b> / token\n\n` +
        `<i>Contoh: beli 5 token → 5 × ${rupiah(hargaBaru)} = ${rupiah(5 * hargaBaru)}</i>\n\n` +
        `<i>Berlaku untuk order berikutnya. Order yang sudah dibuat tetap pakai harga lama.</i>\n\n` +
        `<i>Profit seller TIDAK terpengaruh — seller menambahkan profitnya sendiri di atas harga ini.</i>`,
      { parse_mode: 'HTML' }
    );
  });

  // ─── /terima (reply foto bukti) ──────────────────────────
  bot.command('terima', async (ctx) => {
    try {
      await handleVerification(ctx, 'diterima');
    } catch (err) {
      console.error('[buy] error saat /terima:', err.message);
      try {
        await ctx.reply('⚠️ Terjadi kesalahan saat memproses. Cek log server.');
      } catch (_) {
        /* abaikan: gagal kirim pemberitahuan bukan masalah kritis */
      }
    }
  });

  // ─── /tolak <alasan> (reply foto bukti) ──────────────────
  bot.command('tolak', async (ctx) => {
    try {
      await handleVerification(ctx, 'ditolak');
    } catch (err) {
      console.error('[buy] error saat /tolak:', err.message);
      try {
        await ctx.reply('⚠️ Terjadi kesalahan saat memproses. Cek log server.');
      } catch (_) {
        /* abaikan: gagal kirim pemberitahuan bukan masalah kritis */
      }
    }
  });
}

/**
 * Proses verifikasi order oleh main admin (reply ke pesan bukti)
 * @param {import('telegraf').Context} ctx
 * @param {'diterima'|'ditolak'} action
 */
async function handleVerification(ctx, action) {
  const userId = ctx.from.id;

  if (!isMainAdmin(userId)) {
    ctx.reply(formatError('Hanya <b>main admin</b> yang bisa memverifikasi pembelian.'), { parse_mode: 'HTML' });
    return;
  }

  // Harus berupa reply ke pesan (foto bukti)
  const replyTo = ctx.message.reply_to_message;
  if (!replyTo) {
    ctx.reply(
      formatError(
        `Gunakan dengan cara <b>reply</b> ke foto bukti transfer.\n\n` +
          `Caranya: tekan lama foto bukti → Reply → ketik <code>/${action === 'diterima' ? 'terima' : 'tolak <alasan>'}</code>`
      ),
      { parse_mode: 'HTML' }
    );
    return;
  }

  const target = orderService.findByAdminMessage(ctx.chat.id, replyTo.message_id);
  if (!target) {
    ctx.reply(
      formatError('Tidak ada order yang terhubung dengan foto bukti ini.\nPastikan kamu me-reply foto bukti transfer yang dikirim bot.'),
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (target.status !== 'menunggu_verifikasi') {
    ctx.reply(
      formatError(`Order <code>${target.id}</code> sudah diproses sebelumnya (status: <b>${target.status}</b>).`),
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (action === 'diterima') {
    // Token ditransfer dari saldo MAIN ADMIN ke pembeli (supply seimbang).
    // Saldo admin boleh minus agar transfer tetap bisa terjadi.
    const adminId = getMainAdminId();

    const adminBalanceBefore = tokenManager.getTokenBalance(adminId);
    const adminBalanceAfter = tokenManager.deductTokenAllowNegative(adminId, target.amount);
    const newBalance = tokenManager.addToken(target.userId, target.amount);
    orderService.setStatus(target.id, 'diterima');

    // ─── Bagikan bagian seller (jika user diundang seller) ───
    let sellerReward = null;
    try {
      sellerReward = require('./seller').rewardSeller({
        userId: target.userId,
        amount: target.amount,
        sellerProfitPerToken: target.sellerProfitPerToken,
        sellerId: target.sellerId,
      });
      if (sellerReward && sellerReward.sellerId && sellerReward.earned > 0) {
        orderService.setSellerReward(target.id, {
          sellerId: sellerReward.sellerId,
          reward: sellerReward.earned,
          profitPerToken: sellerReward.profitPerToken,
        });
      }
    } catch (err) {
      console.error('[buy] gagal hitung reward seller:', err.message);
    }

    // ─── Bagikan bagian reseller (jika user diundang reseller) ───
    let resellerReward = null;
    try {
      resellerReward = require('./reseller').rewardReseller({
        userId: target.userId,
        amount: target.amount,
        resellerProfitPerToken: target.resellerProfitPerToken,
        resellerId: target.resellerId,
      });
      if (resellerReward && resellerReward.resellerId && resellerReward.earned > 0) {
        orderService.setResellerReward(target.id, {
          resellerId: resellerReward.resellerId,
          reward: resellerReward.earned,
          profitPerToken: resellerReward.profitPerToken,
        });
      }
    } catch (err) {
      console.error('[buy] gagal hitung reward reseller:', err.message);
    }

    ctx.reply(
      `✅ <b>Order diterima</b>\n\n` +
        `<b>Order ID:</b> <code>${target.id}</code>\n` +
        `<b>User:</b> <code>${target.userId}</code>\n` +
        `<b>Token ditransfer:</b> ${target.amount}\n` +
        `<b>Total dibayar:</b> ${rupiah(target.total)}\n` +
        `<b>Saldo user sekarang:</b> ${newBalance} token\n\n` +
        (sellerReward && sellerReward.sellerId
          ? `\n🏪 <b>Seller:</b> <code>${sellerReward.sellerId}</code> — ${rupiah(sellerReward.earned)}\n`
          : '') +
        (resellerReward && resellerReward.resellerId
          ? `🏬 <b>Reseller:</b> <code>${resellerReward.resellerId}</code> — ${rupiah(resellerReward.earned)}\n`
          : '') +
        (sellerReward && sellerReward.hilang
          ? `\n⚠️ <i>Seller <code>${sellerReward.sellerId}</code> sudah tidak terdaftar — ` +
            `bagian ${rupiah(sellerReward.earned)} TIDAK masuk ke siapa pun.</i>\n`
          : '') +
        (resellerReward && resellerReward.hilang
          ? `\n⚠️ <i>Reseller <code>${resellerReward.resellerId}</code> sudah tidak terdaftar — ` +
            `bagian ${rupiah(resellerReward.earned)} TIDAK masuk ke siapa pun.</i>\n`
          : '') +
        `─────────────────────\n` +
        `<b>Saldo kamu (admin):</b> ${adminBalanceBefore} → <b>${adminBalanceAfter}</b> token` +
        (adminBalanceAfter < 0 ? `\n⚠️ <i>Saldo admin minus — suplai token tetap seimbang.</i>` : ''),
      { parse_mode: 'HTML' }
    );

    // ─── Notifikasi ke pembeli, seller, & reseller ──────────
    //
    // Masing-masing dijalankan dalam try/catch SENDIRI agar kegagalan
    // satu pihak tidak menggagalkan notifikasi pihak lain.
    // Sebelumnya semuanya berada dalam satu try, sehingga bila notifikasi
    // ke pembeli gagal (mis. diblokir), notifikasi seller & reseller
    // ikut tidak terkirim.

    // 1) Pembeli
    try {
      await ctx.telegram.sendMessage(
        target.userId,
        `🎉 <b>Pembelian token disetujui!</b>\n\n` +
          `<b>Order ID:</b> <code>${target.id}</code>\n` +
          `<b>Token ditambahkan:</b> ${target.amount}\n` +
          `<b>Total dibayar:</b> ${rupiah(target.total)}\n\n` +
          `💰 <b>Saldo token kamu sekarang: ${newBalance}</b>\n\n` +
          `Terima kasih sudah berbelanja! 🐢`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error(`[buy] gagal notifikasi pembeli ${target.userId}:`, err.message);

      // ctx.reply() tidak selalu mengembalikan Promise, jadi jangan
      // dirantai .catch(). Bungkus dengan try agar aman.
      try {
        await ctx.reply(
          `⚠️ Token sudah ditambahkan, tapi notifikasi ke pembeli gagal terkirim ` +
            `(mungkin dia memblokir bot).`
        );
      } catch (e) {
        console.error('[buy] gagal kirim pemberitahuan ke admin:', e.message);
      }
    }

    // 2) Seller
    if (sellerReward && sellerReward.sellerId && !sellerReward.hilang) {
      try {
        const sellerData = sellerService.getSeller(sellerReward.sellerId);
        const saldoSeller = (sellerData && sellerData.balance) || 0;

        await ctx.telegram.sendMessage(
          sellerReward.sellerId,
          `🏪 <b>Penjualan Token</b>\n\n` +
            `<b>Order ID:</b> <code>${target.id}</code>\n` +
            `<b>Token terjual:</b> ${target.amount}\n` +
            `<b>Bagian kamu:</b> <b>${rupiah(sellerReward.earned)}</b>\n` +
            `<b>Saldo sekarang:</b> ${rupiah(saldoSeller)}\n` +
            (sellerReward.earned > 0
              ? ''
              : `\n⚠️ <i>Profit kamu masih Rp0. Atur lewat</i> <code>/seller setprofit</code>\n`) +
            `\n<i>Cek saldo: <code>/seller saldo</code></i>`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error(`[buy] gagal notifikasi seller ${sellerReward.sellerId}:`, err.message);
      }
    }

    // 3) Reseller
    if (resellerReward && resellerReward.resellerId && !resellerReward.hilang) {
      try {
        const rData = resellerService.getReseller(resellerReward.resellerId);
        const saldoReseller = (rData && rData.balance) || 0;

        await ctx.telegram.sendMessage(
          resellerReward.resellerId,
          `🏬 <b>Penjualan Token</b>\n\n` +
            `<b>Order ID:</b> <code>${target.id}</code>\n` +
            `<b>Token terjual:</b> ${target.amount}\n` +
            `<b>Bagian kamu:</b> <b>${rupiah(resellerReward.earned)}</b>\n` +
            `<b>Saldo sekarang:</b> ${rupiah(saldoReseller)}\n` +
            (resellerReward.earned > 0
              ? ''
              : `\n⚠️ <i>Profit kamu masih Rp0. Atur lewat</i> <code>/reseller setprofit</code>\n`) +
            `\n<i>Cek saldo: <code>/reseller saldo</code></i>`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error(`[buy] gagal notifikasi reseller ${resellerReward.resellerId}:`, err.message);
      }
    }

    return;
  }

  // ─── Ditolak ─────────────────────────────────────────────
  const rawReason = ctx.message.text.replace(/^\/tolak(@\w+)?\s*/, '').trim();
  const reason = rawReason || 'Tidak disebutkan';

  orderService.setStatus(target.id, 'ditolak', reason);

  ctx.reply(
    `🚫 <b>Order ditolak</b>\n\n` +
      `<b>Order ID:</b> <code>${target.id}</code>\n` +
      `<b>User:</b> <code>${target.userId}</code>\n` +
      `<b>Jumlah:</b> ${target.amount} token\n` +
      `<b>Alasan:</b> ${escapeHtml(reason)}`,
    { parse_mode: 'HTML' }
  );

  try {
    await ctx.telegram.sendMessage(
      target.userId,
      `🚫 <b>Pembelian token ditolak</b>\n\n` +
        `<b>Order ID:</b> <code>${target.id}</code>\n` +
        `<b>Jumlah:</b> ${target.amount} token\n` +
        `<b>Alasan:</b> ${escapeHtml(reason)}\n\n` +
        `Silakan hubungi admin jika kamu merasa ini keliru, lalu buat order baru dengan <code>/buy &lt;jumlah&gt;</code>.`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error(`[buy] Gagal notifikasi user ${target.userId}:`, err.message);
  }
}

module.exports = { register, initSetupAdmins };
