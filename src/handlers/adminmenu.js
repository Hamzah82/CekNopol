/**
 * adminmenu.js — Handler /adminmenu (panduan owner & admin)
 *
 * Menampilkan panduan lengkap command khusus admin/owner bot.
 * Hanya bisa diakses oleh main admin (setup.json) DAN admin (db/admin.json).
 */

const roleManager = require('../services/roleManager');
const orderService = require('../services/orderService');
const priceService = require('../services/priceService');
const logService = require('../services/logService');
const affiliateService = require('../services/affiliateService');
const userService = require('../services/userService');
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
      ({ command, label, price }) =>
        `<code>/${command} setprice &lt;n&gt;</code> — ${label}: <b>${price}</b> token`
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
    `<b>📊 STATISTIK</b>`,
    ``,
    `<code>/stats</code> — ringkasan penggunaan bot`,
    ``,
    `Berisi: pencarian hari ini / 7 hari / 30 hari / total,`,
    `token user terpakai, cache hit, layanan terpopuler,`,
    `user teraktif, dan sisa token provider.`,
    ``,
    `<i>Hanya owner.</i>`,
    ``,
    `─────────────────────`,
    `<b>👥 DAFTAR USER</b>`,
    ``,
    `<code>/users</code> — daftar user (10 per halaman)`,
    `<code>/users &lt;halaman&gt;</code> — pindah halaman`,
    `<code>/users &lt;ID&gt;</code> — cari user / affiliator pengundang`,
    ``,
    `Menampilkan: ID user, affiliator yang mengundang, tanggal bergabung.`,
    `Total user tercatat: <b>${userService.countUsers()}</b>`,
    ``,
    `<i>Semua admin bisa memakai.</i>`,
    ``,
    `─────────────────────`,
    `<b>💾 BACKUP DATABASE</b>`,
    ``,
    `<code>/backup</code> — kirim folder DB sebagai file .zip`,
    ``,
    `• Nama file: <code>db-backup-YYYY-MM-DD_HHMM.zip</code>`,
    `• <b>Hanya bisa di chat pribadi</b> (data sensitif)`,
    `• File temporer dihapus otomatis setelah dikirim`,
    ``,
    `<i>Semua admin bisa memakai.</i>`,
    ``,
    `─────────────────────`,
    `<b>📢 BROADCAST</b>`,
    ``,
    `<code>/broadcast</code> — sebar pesan ke semua user`,
    ``,
    `<b>Caranya (wajib REPLY):</b>`,
    `1. Kirim pesan ke bot (teks / foto / video / dokumen)`,
    `2. Reply pesan itu, ketik <code>/broadcast</code>`,
    ``,
    `Penerima diambil dari <b>user yang pernah /start</b>,`,
    `bukan dari data token — user yang belum pernah beli tetap dapat.`,
    `Admin pengirim tidak dikirimi.`,
    ``,
    `<i>Semua admin bisa memakai.</i>`,
    ``,
    `─────────────────────`,
    `<b>🧹 BERSIHKAN DEPOSIT</b>`,
    ``,
    `<code>/cleardepo</code> — hapus semua order berstatus <b>ditolak</b>`,
    ``,
    `Order diterima & menunggu tidak disentuh.`,
    ``,
    `<i>Hanya owner.</i>`,
    ``,
    `─────────────────────`,
    `<b>📋 LOG PENCARIAN</b>`,
    ``,
    `Tambahkan bot ke grup, lalu jalankan di grup itu:`,
    `<code>/setlog</code> — jadikan grup ini tempat log`,
    `<code>/unsetlog</code> — matikan log`,
    ``,
    `Status: ${
      logService.getLogChatId()
        ? `<b>AKTIF</b> → <code>${logService.getConfig().title || logService.getLogChatId()}</code>`
        : '<b>BELUM DISET</b>'
    }`,
    ``,
    `Log berisi: username, ID user, layanan, query, biaya token.`,
    `<b>Tidak</b> menampilkan hasil pencarian.`,
    ``,
    `Hanya 1 grup aktif. Hanya owner.`,
    ``,
    `─────────────────────`,
    `<b>🤝 AFFILIATOR</b>`,
    ``,
    `<b>Kelola (owner):</b>`,
    `<code>/aff add &lt;ID&gt;</code>`,
    `<code>/aff remove &lt;ID&gt;</code>`,
    `<code>/aff list</code>`,
    `<code>/aff setprofit &lt;ID&gt; &lt;nominal&gt;</code>`,
    `<code>/aff wdlist</code>`,
    ``,
    `<b>Command affiliator:</b>`,
    `<code>/aff link</code> — link referral`,
    `<code>/aff saldo</code> — saldo & pendapatan`,
    `<code>/aff wd &lt;wallet&gt; &lt;nominal&gt; &lt;no&gt;</code> — cairkan`,
    ``,
    `Affiliator terdaftar: <b>${affiliateService.getAllAffiliators().length}</b>`,
    ``,
    `Profit affiliator <b>per token</b>, tidak boleh melebihi profit admin.`,
    `Turun otomatis bila profit admin diturunkan.`,
    ``,
    `Pembagian saat <code>/terima</code>:`,
    `komisi = min(profit affiliator, profit admin) × jumlah token`,
    `Sisanya milik admin (lihat <code>/stats</code>).`,
    ``,
    `Minimum penarikan: <b>${rupiah(affiliateService.MIN_WITHDRAW)}</b>`,
    `Wallet: ${affiliateService.WALLETS.map((w) => affiliateService.walletLabel(w)).join(', ')}`,
    ``,
    `<b>Penarikan:</b> notifikasi masuk ke owner → reply <code>/done</code>.`,
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
    `• Backup rutin: <code>/backup</code> (kirim zip ke chat pribadi)`,
    `• <code>setup.json</code> jangan di-commit ke Git`,
    ``,
    `─────────────────────`,
    `🐢 <i>XY Bot — Panel Admin</i>`,
  ];

  return lines.join('\n');
}


/**
 * Pecah pesan panjang agar tidak melebihi batas Telegram (4096 karakter).
 * Memecah di batas baris supaya tag HTML tidak terbelah.
 *
 * @param {string} text
 * @param {number} [limit]
 * @returns {string[]}
 */
function splitMessage(text, limit = 3800) {
  if (text.length <= limit) return [text];

  const lines = text.split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if ((current + '\n' + line).length > limit) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);

  return chunks.length ? chunks : [text];
}

/**
 * Register handler /adminmenu
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command('adminmenu', async (ctx) => {
    const userId = ctx.from.id;

    if (!isAnyAdmin(userId)) {
      ctx.reply(formatError('Panduan ini hanya untuk admin dan owner bot.'), { parse_mode: 'HTML' });
      return;
    }

    const guide = buildGuide();
    const chunks = splitMessage(guide);

    for (let i = 0; i < chunks.length; i++) {
      let text = chunks[i];
      if (chunks.length > 1) {
        text += `\n\n<i>(bagian ${i + 1}/${chunks.length})</i>`;
      }
      await ctx.reply(text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    }
  });
}

module.exports = { register, initSetupAdmins, buildGuide, splitMessage };
