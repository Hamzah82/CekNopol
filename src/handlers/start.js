/**
 * start.js — Handler /start & /menu
 */

const roleManager = require('../services/roleManager');

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

const WELCOME_MESSAGE = `
🚗 <b>XY BOT</b>

Bot cek data kendaraan, kependudukan, &amp; nomor HP berbasis Telegram.

─────────────────────

<b>📋 DAFTAR COMMAND</b>

🔹 /start — Tampilkan menu utama
🔹 /menu — Sama seperti /start
🔹 /token — Lihat sisa token kamu
🔹 /buy &lt;jumlah&gt; — Beli token via QRIS
🔹 /ceknopol &lt;plat&gt; — Cek data kendaraan
🔹 /ceknama &lt;nama&gt; — Cek data kependudukan
🔹 /nik2kk &lt;nik&gt; — Cari data NIK ke KK
🔹 /ceknomor &lt;nomor&gt; — Cek data pemilik nomor HP

─────────────────────

<b>📝 FORMAT INPUT</b>

<b>Plat Nomor:</b>
• /ceknopol B1234XYZ
• /ceknopol D1234ABC
• /ceknopol AB123CD

<b>Nama:</b>
• /ceknama JANICE
• /ceknama BUDI SANTOSO

<b>NIK:</b>
• /nik2kk 127703XXXXXXX006

<b>Nomor HP:</b>
• /ceknomor 0812XXXXXXX89
• /ceknomor +62812XXXXXXX89

─────────────────────

<b>🛒 CARA BELI TOKEN</b>

<b>1.</b> Kirim <code>/buy &lt;jumlah&gt;</code>
    Contoh: <code>/buy 5</code>
<b>2.</b> Bot mengirim <b>QRIS</b> + total harga
<b>3.</b> Scan QRIS &amp; bayar sesuai nominal
<b>4.</b> Kirim <b>foto bukti transfer</b> ke chat ini
<b>5.</b> Tunggu admin memverifikasi
<b>6.</b> Token otomatis masuk setelah disetujui ✅

<b>💵 Harga:</b>
• <b>Rp2.000</b> / token
• Ditambah biaya admin per transaksi

<b>Contoh:</b> beli 5 token
    (5 × Rp2.000) + biaya admin
    = nominal yang harus dibayar

<b>⚠️ Catatan:</b>
• Selesaikan 1 order sebelum membuat order baru
• Belum bayar &amp; kirim bukti? Order tidak diproses
• Order ditolak → alasan akan dikirim ke kamu

─────────────────────

<b>💡 CATATAN</b>

• 1x cek = 1 token (dari cache juga)
• Token tidak terpotong jika data tidak ditemukan
• Butuh token? Gunakan <code>/buy &lt;jumlah&gt;</code>

─────────────────────
🐢 <i>XY Bot v1.0</i>
`.trim();

/**
 * Register handler /start dan /menu
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command(['start', 'menu'], (ctx) => {
    const userId = ctx.from.id;
    let message = WELCOME_MESSAGE;

    // Sisipkan pintasan panel admin khusus untuk admin/owner
    if (isAnyAdmin(userId)) {
      message +=
        '\n\n─────────────────────\n' +
        '<b>🛡️ AKSES ADMIN</b>\n\n' +
        'Kamu terdaftar sebagai admin.\n' +
        'Gunakan <code>/adminmenu</code> untuk membuka panduan lengkap pengelolaan bot.';
    }

    ctx.reply(message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  });
}

module.exports = { register, initSetupAdmins };
