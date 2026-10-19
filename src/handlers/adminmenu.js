/**
 * adminmenu.js — Handler /adminmenu (panduan owner & admin)
 *
 * Menampilkan panduan lengkap command khusus admin/owner bot.
 * Hanya bisa diakses oleh main admin (setup.json) DAN admin (db/admin.json).
 */

const roleManager = require('../services/roleManager');
const orderService = require('../services/orderService');
const priceService = require('../services/priceService');
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
 * Cek apakah user adalah main admin (dari setup.json)
 * @param {number} userId
 * @returns {boolean}
 */
function isMainAdmin(userId) {
  return setupAdminIds.includes(Number(userId));
}

/**
 * Cek apakah user admin (setup.json ATAU db/admin.json)
 * @param {number} userId
 * @returns {boolean}
 */
function isAnyAdmin(userId) {
  return isMainAdmin(userId) || roleManager.isAdmin(userId);
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
 * Bangun pesan panduan admin
 * @returns {string}
 */
function buildGuide() {
  const profit = orderService.getProfit();
  const basePrice = orderService.BASE_PRICE_PER_TOKEN;
  const pricePerToken = orderService.getPricePerToken();
  const example = 5 * pricePerToken;

  const lines = [
    `🛡️ <b>PANDUAN OWNER &amp; ADMIN</b>`,
    ``,
    `Panduan command khusus pengelola bot.`,
    `Panduan ini <b>tidak ditampilkan</b> ke user biasa.`,
    ``,
    `─────────────────────`,
    `<b>👑 TINGKAT AKSES</b>`,
    ``,
    `<b>1. Owner / Main Admin</b>`,
    `Terdaftar di <code>setup.json</code> → field <code>adminIds</code>.`,
    `Akses penuh: semua command di panduan ini.`,
    ``,
    `<b>2. Admin</b>`,
    `Ditambahkan lewat <code>/admin add &lt;ID&gt;</code>.`,
    `Akses terbatas: kelola token user saja.`,
    ``,
    `<b>3. Reseller</b>`,
    `Ditambahkan lewat <code>/reseller add &lt;ID&gt;</code>.`,
    `Hanya bisa transfer token ke user lain via <code>/give</code>.`,
    ``,
    `─────────────────────`,
    `<b>💰 KELOLA TOKEN USER</b>`,
    ``,
    `<code>/token list [halaman]</code>`,
    `Lihat semua saldo token user.`,
    ``,
    `<code>/token &lt;ID&gt; +&lt;jumlah&gt;</code>`,
    `Tambah token user.`,
    `Contoh: <code>/token 123456789 +10</code>`,
    ``,
    `<code>/token &lt;ID&gt; -&lt;jumlah&gt;</code>`,
    `Kurangi token user.`,
    `Contoh: <code>/token 123456789 -5</code>`,
    ``,
    `<i>Admin &amp; owner bisa memakai command ini.</i>`,
    ``,
    `─────────────────────`,
    `<b>🛒 VERIFIKASI PEMBELIAN</b>`,
    ``,
    `<code>/terima</code> — setujui pembelian`,
    `<code>/tolak &lt;alasan&gt;</code> — tolak pembelian`,
    ``,
    `<b>Caranya (wajib REPLY):</b>`,
    `1. User kirim <code>/buy &lt;jumlah&gt;</code>`,
    `2. User kirim foto bukti transfer`,
    `3. Bot meneruskan bukti ke chat kamu`,
    `4. <b>Reply</b> foto bukti itu, lalu ketik commandnya`,
    ``,
    `✅ <code>/terima</code> → token otomatis masuk ke user`,
    `🚫 <code>/tolak salah nominal</code> → token batal, alasan dikirim ke user`,
    ``,
    `<i>Hanya owner yang bisa memverifikasi.</i>`,
    ``,
    `─────────────────────`,
    `<b>⚙️ ATUR PROFIT</b>`,
    ``,
    `<code>/setprofit &lt;nominal&gt;</code>`,
    `Atur profit yang menambah harga tiap token.`,
    ``,
    `Profit <b>menambah harga per token</b>.`,
    ``,
    `<b>Harga dasar:</b> ${rupiah(basePrice)} / token`,
    `<b>Profit sekarang:</b> ${rupiah(profit)} / token`,
    `<b>Harga token jadi:</b> <b>${rupiah(pricePerToken)}</b> / token`,
    ``,
    `Rumus:`,
    `<code>harga token = ${rupiah(basePrice)} + profit</code>`,
    `<code>total = jumlah × harga token</code>`,
    ``,
    `Contoh beli 5 token:`,
    `5 × ${rupiah(pricePerToken)} = <b>${rupiah(example)}</b>`,
    ``,
    `Lihat profit tanpa argumen: <code>/setprofit</code>`,
    `<i>Hanya owner. Profit dikunci saat order dibuat.</i>`,
    ``,
    `─────────────────────`,
    `<b>🏷️ HARGA LAYANAN (TOKEN)</b>`,
    ``,
    ...priceService.getAllPrices().map(
      ({ service, price }) => `<code>/${service} setprice &lt;n&gt;</code> — sekarang <b>${price}</b> token`
    ),
    ``,
    `Set harga per layanan, mis. <code>/ceknama setprice 3</code>`,
    `Lihat harga tanpa argumen: <code>/ceknama setprice</code>`,
    ``,
    `Default: 1 token. Jika saldo user kurang dari harga,`,
    `layanan <b>ditolak</b> (tidak memotong sebagian).`,
    ``,
    `<i>Hanya owner.</i>`,
    ``,
    `─────────────────────`,
    `<b>👥 KELOLA ADMIN</b>`,
    ``,
    `<code>/admin list</code> — lihat daftar admin`,
    `<code>/admin add &lt;ID&gt;</code> — tambah admin`,
    `<code>/admin remove &lt;ID&gt;</code> — hapus admin`,
    ``,
    `Contoh: <code>/admin add 123456789</code>`,
    ``,
    `<i>Hanya owner. Admin tidak bisa menambah admin lain.</i>`,
    ``,
    `─────────────────────`,
    `<b>🏪 KELOLA RESELLER</b>`,
    ``,
    `<code>/reseller list</code> — lihat daftar reseller`,
    `<code>/reseller add &lt;ID&gt;</code> — tambah reseller`,
    `<code>/reseller remove &lt;ID&gt;</code> — hapus reseller`,
    ``,
    `<i>Hanya owner.</i>`,
    ``,
    `<b>Command reseller:</b>`,
    `<code>/give &lt;ID&gt; &lt;jumlah&gt;</code> — transfer token ke user`,
    `Contoh: <code>/give 123456789 10</code>`,
    ``,
    `Reseller memakai saldo token miliknya sendiri.`,
    ``,
    `─────────────────────`,
    `<b>🔍 CEK ID USER</b>`,
    ``,
    `Minta user kirim pesan ke bot, lalu lihat:`,
    `• Forward pesan user ke <code>@userinfobot</code>`,
    `• Atau minta user buka <b>Telegram → Settings → Advanced</b>`,
    ``,
    `ID berupa angka, contoh: <code>123456789</code>`,
    ``,
    `─────────────────────`,
    `<b>📌 CATATAN PENTING</b>`,
    ``,
    `• Order menggantung = user belum kirim bukti`,
    `• User tidak bisa buat order baru sebelum order lama selesai`,
    `• Gagal kirim notifikasi = user mungkin blokir bot`,
    `• Backup folder <code>db/</code> secara berkala`,
    `• <code>setup.json</code> jangan di-commit ke Git`,
    ``,
    `─────────────────────`,
    `🐢 <i>XY Bot — Panel Admin</i>`,
  ];

  return lines.join('\n');
}

/**
 * Register handler /adminmenu
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('adminmenu', (ctx) => {
    const userId = ctx.from.id;

    if (!isAnyAdmin(userId)) {
      ctx.reply(formatError('Panduan ini hanya untuk admin dan owner bot.'), { parse_mode: 'HTML' });
      return;
    }

    ctx.reply(buildGuide(), {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  });
}

module.exports = { register, initSetupAdmins, buildGuide };
