/**
 * start.js — Handler /start & /menu
 */

const WELCOME_MESSAGE = `
🚗 <b>Selamat datang di CekNopolBot!</b>

Bot ini membantu kamu mengecek data kendaraan bermotor berdasarkan plat nomor.

<b>📋 Daftar Command:</b>
/start atau /menu — Tampilkan pesan ini
/token — Lihat sisa token kamu
/cek &lt;plat&gt; — Cek data kendaraan

<b>📝 Format Plat Nomor:</b>
• B1234XYZ
• D 1234 ABC
• AB123CD

<b>💡 Catatan:</b>
• Setiap pengecekan membutuhkan 1 token
• Data yang pernah dicek disimpan di cache (tetap kena 1 token)
• Hubungi admin untuk mendapatkan/menambah token

Ketik /menu kapan saja untuk melihat panduan ini lagi.
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
