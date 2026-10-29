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
const resellerService = require('../services/resellerService');
const userService = require('../services/userService');
const channelGuard = require('../services/channelGuard');
const serviceToggle = require('../services/serviceToggle');

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
  const L = [`📋 <b>DAFTAR COMMAND</b>`, ``];

  // ─── Layanan Pencarian ───
  const layanan = [];

  if (serviceToggle.isEnabled('ceknopol')) {
    layanan.push(
      `<b>/ceknopol</b> &lt;plat&gt;`,
      `Cek data kendaraan dari plat nomor — merk, tipe, tahun, warna,`,
      `isi silinder, bahan bakar, hingga nama dan alamat pemilik.`,
      `Termasuk <b>nomor rangka</b>, <b>nomor mesin</b>, dan nomor BPKB.`,
      `<i>Contoh: /ceknopol B1234XYZ</i>`,
      ``
    );
  }

  if (serviceToggle.isEnabled('ceknama')) {
    layanan.push(
      `<b>/ceknama</b> &lt;nama&gt;`,
      `Cari data kependudukan berdasarkan nama orang.`,
      `⚠️ Masukkan nama <b>LENGKAP</b> sesuai KTP / KK agar data ditemukan.`,
      `<i>Contoh: /ceknama BUDI SANTOSO</i>`,
      ``
    );
  }

  if (serviceToggle.isEnabled('nik2kk')) {
    layanan.push(
      `<b>/nik2kk</b> &lt;NIK&gt;`,
      `Lacak nomor Kartu Keluarga dari NIK 16 digit.`,
      `<i>Contoh: /nik2kk 1277031234560006</i>`,
      ``
    );
  }

  if (serviceToggle.isEnabled('ceknomor')) {
    layanan.push(
      `<b>/ceknomor</b> &lt;nomor&gt;`,
      `Lihat nama yang tersimpan untuk sebuah nomor HP, termasuk`,
      `tanda spam atau mencurigakan.`,
      `<i>Contoh: /ceknomor 08123456789</i>`,
      `<i>Sumber: GetContact (bukan data resmi pemerintahan)</i>`,
      ``
    );
  }

  if (serviceToggle.isEnabled('cekkk')) {
    layanan.push(
      `<b>/cekKK</b> &lt;no. KK&gt;`,
      `Tampilkan seluruh anggota satu Kartu Keluarga.`,
      `<i>Contoh: /cekKK 1277031234560003</i>`,
      ``
    );
  }

  if (layanan.length) {
    L.push(`<b>🔍 LAYANAN PENCARIAN</b>`, ``, ...layanan);
  }

  // ─── Token ───
  L.push(
    `<b>💰 TOKEN</b>`,
    ``,
    `<b>/token</b>`,
    `Lihat sisa token kamu.`,
    ``,
    `<b>/buy</b> &lt;jumlah&gt;`,
    `Beli token lewat QRIS. Bot mengirim gambar QRIS beserta`,
    `total yang harus dibayar, lalu kamu kirim foto bukti transfer.`,
    `<i>Contoh: /buy 5</i>`,
    ``,
    `─────────────────────`,
    `<b>💡 CATATAN</b>`,
    ``
  );

  // Catatan khusus pengecekan hanya relevan bila ada layanan aktif
  if (layanan.length) {
    L.push(
      `• Setiap pengecekan memotong token sesuai harga layanan`,
      `• Token <b>tidak</b> terpotong jika data tidak ditemukan`,
      `• Ada jeda 10 detik antar pengecekan untuk mencegah spam`,
      `• Lihat biaya tiap layanan di tombol <b>💰 Harga</b>`
    );
  } else {
    L.push(`• Layanan pencarian sedang tidak tersedia.`);
  }

  L.push(`• Butuh top-up? Kirim <code>/buy &lt;jumlah&gt;</code>`);

  return L.join('\n');
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
  // Hanya tampilkan layanan yang AKTIF
  const prices = priceService.getAllPrices().filter((item) => serviceToggle.isEnabled(item.service));

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
    `<b>Nama</b> — harus LENGKAP sesuai KTP / KK`,
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
 * Escape karakter HTML agar aman ditampilkan di Telegram.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str === undefined || str === null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Kirim notifikasi ke seller/reseller bahwa ada user baru bergabung
 * lewat link referral mereka.
 *
 * Tidak melempar error bila gagal (mis. user memblokir bot).
 *
 * @param {object} telegram - ctx.telegram
 * @param {number} penerimaId - seller / reseller yang mengundang
 * @param {object} data
 * @param {string} data.peran - 'Seller' atau 'Reseller'
 * @param {string} data.namaUser
 * @param {string} data.usernameUser
 * @param {number} data.userId
 */
function notifUndangan(telegram, penerimaId, { peran, namaUser, usernameUser, userId }) {
  const teks = [
    `🎉 <b>USER BARU BERGABUNG</b>`,
    `─────────────────────`,
    ``,
    `Ada user baru masuk lewat link referral kamu.`,
    ``,
    `<b>Nama:</b> ${escapeHtml(namaUser)}`,
    `<b>Username:</b> ${usernameUser}`,
    `<b>ID:</b> <code>${userId}</code>`,
    ``,
    `─────────────────────`,
    `User ini sekarang terhubung permanen ke kamu.`,
    `Setiap pembelian token-nya akan memberi kamu bagian profit.`,
    ``,
    `<i>Lihat daftar: ${peran === 'Reseller' ? '/reseller link' : '/seller link'}</i>`,
  ].join('\n');

  return kirimDenganRetry(telegram, penerimaId, teks, 'notif undangan');
}

/**
 * Kirim pesan dengan 1x percobaan ulang bila gagal.
 *
 * Kegagalan sementara (mis. gangguan jaringan) sering berhasil pada
 * percobaan kedua. Kegagalan permanen (user memblokir bot) akan tetap
 * gagal dan hanya dicatat di log.
 *
 * @param {object} telegram - ctx.telegram
 * @param {number} chatId
 * @param {string} teks
 * @param {string} label - untuk keperluan log
 * @returns {Promise<boolean>} true bila terkirim
 */
async function kirimDenganRetry(telegram, chatId, teks, label) {
  const opsi = { parse_mode: 'HTML' };

  for (let percobaan = 1; percobaan <= 2; percobaan++) {
    try {
      await telegram.sendMessage(chatId, teks, opsi);
      return true;
    } catch (err) {
      const terakhir = percobaan === 2;
      console.error(
        `[start] gagal ${label} ke ${chatId} (percobaan ${percobaan})${terakhir ? '' : ', mencoba lagi'}:`,
        err.message
      );
      if (terakhir) return false;

      // jeda singkat sebelum mencoba lagi
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  return false;
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
      // Dukung format: seller_<ID>, rsl_<ID>, dan aff_<ID> (link lama)
      const m = payload.match(/^(seller|aff|rsl)_(\d+)$/i);

      // Cek dulu status SEBELUM dicatat
      const isFirstTime = !userService.isKnown(userId);

      // Baru catat setelah diketahui statusnya
      userService.markSeen(userId);

      // Referral hanya berlaku untuk user yang benar-benar baru
      if (m && isFirstTime) {
        const jenis = String(m[1]).toLowerCase();
        const pengundangId = parseInt(m[2], 10);

        // Nama tampilan user baru (untuk notifikasi)
        const namaUser = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || '-';
        const usernameUser = ctx.from.username ? `@${ctx.from.username}` : '<i>tanpa username</i>';

        // Link reseller -> user terhubung ke reseller
        if (jenis === 'rsl') {
          if (resellerService.isReseller(pengundangId) && !resellerService.hasReferral(userId)) {
            resellerService.setReferral(userId, pengundangId);

            // User ini juga tetap terhubung ke SELLER dari reseller tsb,
            // supaya rantai profit owner -> seller -> reseller utuh.
            const r = resellerService.getReseller(pengundangId);
            if (r && r.sellerId && !sellerService.hasReferral(userId)) {
              sellerService.setReferral(userId, r.sellerId);
            }

            // Notifikasi ke RESELLER
            await notifUndangan(ctx.telegram, pengundangId, {
              peran: 'Reseller',
              namaUser,
              usernameUser,
              userId,
            });
          }
        } else {
          // Link seller (seller_ / aff_ lama)
          if (sellerService.isSeller(pengundangId) && !sellerService.hasReferral(userId)) {
            sellerService.setReferral(userId, pengundangId);

            // Notifikasi ke SELLER
            await notifUndangan(ctx.telegram, pengundangId, {
              peran: 'Seller',
              namaUser,
              usernameUser,
              userId,
            });
          }
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
