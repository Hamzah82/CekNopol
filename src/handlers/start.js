/**
 * start.js — Handler /start & /menu
 */

const WELCOME_MESSAGE = `
🚗 <b>CEK NOPOL BOT</b>

Bot cek data kendaraan &amp; data kependudukan berbasis Telegram.

─────────────────────

<b>📋 DAFTAR COMMAND</b>

🔹 /start — Tampilkan menu utama
🔹 /menu — Sama seperti /start
🔹 /token — Lihat sisa token kamu
🔹 /ceknopol &lt;plat&gt; — Cek data kendaraan
🔹 /ceknama &lt;nama&gt; — Cek data kependudukan

─────────────────────

<b>📝 FORMAT INPUT</b>

<b>Plat Nomor:</b>
• B1234XYZ
• D 1234 ABC
• AB123CD

<b>Nama:</b>
• /ceknama JANICE
• /ceknama BUDI SANTOSO

─────────────────────

<b>🛡️ ADMIN COMMAND</b>

🔸 /token &lt;ID&gt; +&lt;n&gt; — Tambah token
🔸 /token &lt;ID&gt; -&lt;n&gt; — Kurangi token
🔸 /token list — Lihat semua token user
🔸 /token list &lt;hal&gt; — Halaman tertentu

─────────────────────

<b>💡 CATATAN</b>

• 1x cek = 1 token (dari cache juga)
• Data cache: plat.json &amp; nama.json
• Token tidak terpotong jika data tidak ditemukan
• Hubungi admin untuk top-up token

─────────────────────
🐢 <i>CekNopolBot v1.0</i>
`.trim();

/**
 * Register handler /start dan /menu
 * @param {import('telegraf').Telegraf} bot - Instance Telegraf
 */
function register(bot) {
  bot.command(['start', 'menu'], (ctx) => {
    ctx.reply(WELCOME_MESSAGE, { parse_mode: 'HTML' });
  });
}

module.exports = { register };
