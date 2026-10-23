/**
 * start.js — Handler /start & /menu (menu bertingkat dengan tombol inline)
 *
 * Struktur:
 *   /start  → menu utama ringkas + tombol (Command, Harga, Cara Beli, Format)
 *   Tombol  → edit pesan yang sama menampilkan detail bagian terkait
 *   ◀ Kembali → kembali ke menu utama
 */

const roleManager = require('../services/roleManager');
const priceService = require('../services/priceService');
const tokenManager = require('../services/tokenManager');
const orderService = require('../services/orderService');
const sellerService = require('../services/sellerService');
const userService = require('../services/userService');
const channelGuard = require('../services/channelGuard');

/** Prefix callback agar tidak bentrok dengan handler lain */
const CB = 'menu:';

/** Label layanan untuk tampilan */


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
 * Format angka rupiah
 * @param {number} n
 * @returns {string}
 */
function rupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

/**
 * Bangun pesan menu utama
 * @param {number} userId
 * @returns {string}
 */
function buildMainMenu(userId) {
  const balance = tokenManager.getTokenBalance(userId);

  const lines = [
    `🚗 <b>XY BOT</b>`,
    ``,
    `Bot cek data kendaraan, kependudukan, &amp; nomor HP.`,
    ``,
    `💰 Saldo kamu: <b>${balance}</b> token`,
    ``,
    `Pilih menu di bawah ini 👇`,
  ];

  if (isAnyAdmin(userId)) {
    lines.push(``, `🛡️ Kamu terdaftar sebagai <b>admin</b> — ketik /adminmenu`);
  }

  return lines.join('\n');
}

/**
 * Bangun daftar command
 * @returns {string}
 */
function buildCommands() {
  return [
    `📋 <b>DAFTAR COMMAND</b>`,
    ``,
    `<b>🔍 Layanan Pencarian</b>`,
    `/ceknopol &lt;plat&gt; — data kendaraan`,
    `/ceknama &lt;nama&gt; — data kependudukan`,
    `/nik2kk &lt;nik&gt; — NIK ke KK`,
    `/ceknomor &lt;nomor&gt; — pemilik nomor HP`,
    `/cekKK &lt;noKK&gt; — data seluruh anggota keluarga`,
    ``,
    `<b>💰 Token</b>`,
    `/token — cek sisa token kamu`,
    `/buy &lt;jumlah&gt; — beli token via QRIS`,
  ].join('\n');
}

/**
 * Bangun pricelist dinamis.
 *
 * Harga token HARUS memperhitungkan profit seller bila user diundang
 * seller, agar sama dengan nominal yang ditagih saat /buy.
 *
 * @param {number} [userId] - untuk menentukan profit seller
 * @returns {string}
 */
function buildPricelist(userId) {
  const prices = priceService.getAllPrices();

  const lines = [
    `💰 <b>DAFTAR HARGA</b>`,
    ``,
  ];

  for (const item of prices) {
    const { command, price } = item;
    const label = item.label || item.service;
    lines.push(`/<b>${command}</b> — ${price} token  <i>(${label})</i>`);
  }

  // Profit seller hanya berlaku bagi user yang diundang seller
  const sellerProfit = userId ? sellerService.getProfitForUser(userId) : 0;
  const hargaToken = orderService.getPricePerToken(undefined, sellerProfit);

  lines.push(``);
  lines.push(`💵 <b>1 token = ${rupiah(hargaToken)}</b>`);
  lines.push(`<i>Saldo kurang dari harga layanan = ditolak.</i>`);

  return lines.join('\n');
}

/**
 * Bangun panduan cara beli token
 * @returns {string}
 */
function buildHowToBuy() {
  return [
    `🛒 <b>CARA BELI TOKEN</b>`,
    ``,
    `<b>1.</b> Kirim <code>/buy &lt;jumlah&gt;</code>`,
    `<b>2.</b> Bot kirim QRIS + total bayar`,
    `<b>3.</b> Scan &amp; bayar sesuai nominal`,
    `<b>4.</b> Kirim <b>foto bukti transfer</b>`,
    `<b>5.</b> Tunggu admin verifikasi`,
    `<b>6.</b> Token masuk otomatis`,
    ``,
    `<b>⚠️ Penting</b>`,
    `• Kirim <b>foto</b> saja — pesan lain membatalkan order`,
    `• Selesaikan 1 order sebelum buat order baru`,
    `• Ditolak? Alasan akan dikirim ke kamu`,
  ].join('\n');
}

/**
 * Bangun panduan format input
 * @returns {string}
 */
function buildFormat() {
  return [
    `📝 <b>FORMAT INPUT</b>`,
    ``,
    `<b>Plat nomor</b>`,
    `<code>/ceknopol B1234XYZ</code>`,
    `<code>/ceknopol AB123CD</code>`,
    ``,
    `<b>Nama</b>`,
    `<code>/ceknama BUDI SANTOSO</code>`,
    ``,
    `<b>NIK</b> (16 digit)`,
    `<code>/nik2kk 1277031234560006</code>`,
    ``,
    `<b>Nomor HP</b>`,
    `<code>/ceknomor 08123456789</code>`,
    `<code>/ceknomor +628123456789</code>`,
    ``,
    `<b>No. KK</b> (16 digit)`,
    `<code>/cekKK 1277031234560003</code>`,
  ].join('\n');
}

/**
 * Ambil teks bagian sesuai kunci menu
 * @param {string} key
 * @param {number} userId
 * @returns {string}
 */
function buildSection(key, userId) {
  switch (key) {
    case 'cmd':
      return buildCommands();
    case 'harga':
      return buildPricelist(userId);
    case 'beli':
      return buildHowToBuy();
    case 'format':
      return buildFormat();
    case 'main':
    default:
      return buildMainMenu(userId);
  }
}

/**
 * Susun keyboard inline untuk sebuah bagian
 * @param {string} key - Bagian aktif
 * @param {number} userId
 * @returns {object} Inline keyboard markup
 */
function buildKeyboard(key, userId) {
  if (key === 'main') {
    const rows = [
      [
        { text: '📋 Command', callback_data: CB + 'cmd' },
        { text: '💰 Harga', callback_data: CB + 'harga' },
      ],
      [
        { text: '🛒 Cara Beli', callback_data: CB + 'beli' },
        { text: '📝 Format', callback_data: CB + 'format' },
      ],
    ];

    if (isAnyAdmin(userId)) {
      rows.push([{ text: '🛡️ Panel Admin', callback_data: CB + 'admin' }]);
    }

    return { inline_keyboard: rows };
  }

  if (key === 'admin') {
    return {
      inline_keyboard: [[{ text: '◀ Kembali', callback_data: CB + 'main' }]],
    };
  }

  return {
    inline_keyboard: [[{ text: '◀ Kembali', callback_data: CB + 'main' }]],
  };
}

/**
 * Bangun pesan untuk panel admin (shortcut /adminmenu)
 * @returns {string}
 */
function buildAdminShortcut() {
  return [
    `🛡️ <b>PANEL ADMIN</b>`,
    ``,
    `Ketik <code>/adminmenu</code> untuk panduan lengkap:`,
    ``,
    `• Kelola token user`,
    `• Verifikasi pembelian (/terima, /tolak)`,
    `• Atur profit (/setprofit)`,
    `• Atur harga layanan (setprice)`,
    `• Kelola admin &amp; reseller`,
  ].join('\n');
}

/**
 * Register handler /start, /menu, dan callback tombol
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  const sendMainMenu = (ctx) => {
    const userId = ctx.from.id;
    return ctx.reply(buildMainMenu(userId), {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: buildKeyboard('main', userId),
    });
  };

  bot.command(['start', 'menu'], async (ctx) => {
    const userId = ctx.from.id;

    // ─── Deteksi user baru & referral ──────────────────────
    //
    // Status "user baru" ditentukan dari db/users.json (pernah-terlihat),
    // BUKAN dari saldo token. Saldo 0 tidak bisa dijadikan patokan karena
    // user lama yang tokennya habis juga bersaldo 0.
    try {
      const payload = ctx.message.text.replace(/^\/start(@\w+)?\s*/i, '').trim();
      // Dukung dua format: seller_<ID> (baru) dan aff_<ID> (link lama)
      const m = payload.match(/^(?:seller|aff)_(\d+)$/i);

      // Cek dulu status SEBELUM dicatat
      const isFirstTime = !userService.isKnown(userId);

      // Baru catat setelah diketahui statusnya
      userService.markSeen(userId);

      // Referral hanya berlaku untuk user yang benar-benar baru
      if (m && isFirstTime) {
        const affiliatorId = parseInt(m[1], 10);

        if (sellerService.isSeller(affiliatorId) && !sellerService.hasReferral(userId)) {
          sellerService.setReferral(userId, affiliatorId);
        }
      }
    } catch (err) {
      console.error('[start] gagal memproses referral:', err.message);
    }

    // ─── Wajib gabung channel informasi ────────────────────
    //
    // Pengecekan dilakukan SETELAH pencatatan user & referral, sehingga
    // user tetap tercatat dan sistem affiliator tetap berjalan meski
    // user belum bergabung.
    //
    // Bila pengecekan gagal (bot bukan admin channel / error), user
    // diizinkan lewat (fail-open) agar tidak terkunci dari bot.
    try {
      const membership = await channelGuard.checkMembership(ctx.telegram, userId);

      if (membership.ok && !membership.joined) {
        await channelGuard.promptJoin(ctx);
        return;
      }
    } catch (err) {
      console.error('[start] gagal cek channel:', err.message);
    }

    return sendMainMenu(ctx);
  });

  // ─── Tombol "Sudah Gabung, Cek Ulang" ────────────────────
  bot.action('chk:recheck', async (ctx) => {
    const userId = ctx.from.id;

    try {
      const membership = await channelGuard.checkMembership(ctx.telegram, userId);

      if (membership.ok && !membership.joined) {
        await ctx.answerCbQuery('Kamu belum bergabung ke channel.', { show_alert: true });
        return;
      }

      await ctx.answerCbQuery('Berhasil! Selamat datang 🐢');

      // Hapus pesan ajakan, lalu tampilkan menu
      await ctx.deleteMessage().catch(() => {});
      await sendMainMenu(ctx);
    } catch (err) {
      console.error('[start] gagal recheck channel:', err.message);
      await ctx.answerCbQuery('Gagal mengecek. Coba lagi nanti.', { show_alert: true });
    }
  });

  // ─── Callback tombol menu ────────────────────────────────
  bot.action(/^menu:/, async (ctx) => {
    const userId = ctx.from.id;
    const data = (ctx.callbackQuery && ctx.callbackQuery.data) || '';
    const key = data.slice(CB.length) || 'main';

    // Bagian khusus admin
    if (key === 'admin' && !isAnyAdmin(userId)) {
      await ctx.answerCbQuery('Menu ini khusus admin.', { show_alert: true });
      return;
    }

    let text;
    if (key === 'admin') {
      text = buildAdminShortcut();
    } else {
      text = buildSection(key, userId);
    }

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: buildKeyboard(key, userId),
      });
    } catch (err) {
      // Pesan tidak berubah (mis. klik tombol yang sama) → abaikan
      if (!/message is not modified/i.test(err.message || '')) {
        console.error('[start] gagal edit menu:', err.message);
      }
    }

    await ctx.answerCbQuery().catch(() => {});
  });
}

module.exports = { register, initSetupAdmins };
