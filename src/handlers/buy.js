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

/**
 * Register handler pembelian token
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  // ─── /buy <jumlah> ───────────────────────────────────────
  bot.command('buy', async (ctx) => {
    const userId = ctx.from.id;
    const raw = ctx.message.text.replace(/^\/buy(@\w+)?\s*/, '').trim();
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

    const order = orderService.createOrder({
      userId,
      username: ctx.from.username || '',
      fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      amount,
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
        `<i>Berlaku untuk order berikutnya. Order yang sudah dibuat tetap pakai harga lama.</i>`,
      { parse_mode: 'HTML' }
    );
  });

  // ─── /terima (reply foto bukti) ──────────────────────────
  bot.command('terima', (ctx) => {
    handleVerification(ctx, 'diterima');
  });

  // ─── /tolak <alasan> (reply foto bukti) ──────────────────
  bot.command('tolak', (ctx) => {
    handleVerification(ctx, 'ditolak');
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
    // Tambahkan token ke user
    const newBalance = tokenManager.addToken(target.userId, target.amount);
    orderService.setStatus(target.id, 'diterima');

    ctx.reply(
      `✅ <b>Order diterima</b>\n\n` +
        `<b>Order ID:</b> <code>${target.id}</code>\n` +
        `<b>User:</b> <code>${target.userId}</code>\n` +
        `<b>Token ditambahkan:</b> ${target.amount}\n` +
        `<b>Total dibayar:</b> ${rupiah(target.total)}\n` +
        `<b>Saldo user sekarang:</b> ${newBalance} token`,
      { parse_mode: 'HTML' }
    );

    // Notifikasi ke user
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
      console.error(`[buy] Gagal notifikasi user ${target.userId}:`, err.message);
      ctx.reply(`⚠️ Token sudah ditambahkan, tapi gagal mengirim notifikasi ke user (mungkin bot diblokir).`);
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
