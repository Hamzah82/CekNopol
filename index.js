/**
 * index.js — Entry point XY Bot
 * 
 * Bot Telegram untuk cek data kendaraan berdasarkan plat nomor.
 * Menggunakan sistem token dan cache lokal.
 * 
 * Cara menjalankan: node index.js
 */

const fs = require('fs');
const path = require('path');
const { createBot } = require('./src/bot');

// ─── Load Konfigurasi ────────────────────────────────────────
const SETUP_FILE = path.join(__dirname, 'setup.json');

if (!fs.existsSync(SETUP_FILE)) {
  console.error('❌ File setup.json tidak ditemukan!');
  console.error('');
  console.error('Buat file setup.json di root project dengan format:');
  console.error(JSON.stringify({
    botToken: 'TOKEN_DARI_BOTFATHER',
    apiUrl: 'https://api-url-anda.com',
    apiKey: 'API_KEY_ANDA',
    adminIds: [123456789],
    botUsername: 'XY Bot',
    dbPath: './db',
  }, null, 2));
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(SETUP_FILE, 'utf-8'));
} catch (err) {
  console.error('❌ Gagal membaca setup.json:', err.message);
  console.error('Pastikan format JSON valid.');
  process.exit(1);
}

// ─── Validasi konfigurasi wajib ──────────────────────────────
const masalah = [];
const peringatan = [];

if (!config.botToken || typeof config.botToken !== 'string') {
  masalah.push('botToken kosong atau bukan teks');
}

if (!config.apiUrl || typeof config.apiUrl !== 'string') {
  masalah.push('apiUrl kosong (API layanan tidak bisa dihubungi)');
}

if (!config.apiKey || typeof config.apiKey !== 'string') {
  masalah.push('apiKey kosong (permintaan ke API akan ditolak)');
}

// adminIds: harus ada minimal satu
if (!Array.isArray(config.adminIds) || config.adminIds.length === 0) {
  masalah.push(
    'adminIds kosong — tidak ada yang bisa menjalankan /terima, /setprofit, /adminmenu'
  );
} else {
  const tidakValid = config.adminIds.filter((id) => !Number.isFinite(Number(id)));
  if (tidakValid.length) {
    masalah.push(`adminIds berisi nilai bukan angka: ${tidakValid.join(', ')}`);
  }
}

// botUsername: dipakai untuk link referral seller/reseller
if (!config.botUsername || typeof config.botUsername !== 'string') {
  peringatan.push(
    'botUsername kosong — link referral (/seller link, /reseller link) tidak bisa dibuat'
  );
} else if (config.botUsername.startsWith('@')) {
  peringatan.push(
    `botUsername sebaiknya TANPA tanda @ (sekarang: "${config.botUsername}")`
  );
}

if (masalah.length) {
  console.error('');
  console.error('❌ KONFIGURASI setup.json BERMASALAH:');
  masalah.forEach((m, i) => console.error(`   ${i + 1}. ${m}`));
  console.error('');
  console.error('Perbaiki setup.json lalu jalankan ulang bot.');
  process.exit(1);
}

if (peringatan.length) {
  console.warn('');
  console.warn('⚠️  PERINGATAN KONFIGURASI:');
  peringatan.forEach((m, i) => console.warn(`   ${i + 1}. ${m}`));
  console.warn('');
}

// ─── Pastikan folder db ada ──────────────────────────────────
const dbPath = config.dbPath || './db';
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
  console.log(`📁 Folder database dibuat: ${dbPath}`);
}

// Pastikan file JSON default ada
const dbFiles = ['plat.json', 'tokens.json', 'admins.json', 'nama.json', 'admin.json', 'reseller.json', 'orders.json', 'settings.json', 'prices.json', 'loggroup.json', 'stats.json', 'kk.json', 'users.json', 'sellers.json', 'sellerrefs.json', 'sellerwds.json', 'resellers.json', 'resellerrefs.json', 'resellerwds.json', 'services.json'];
for (const file of dbFiles) {
  const filePath = path.join(dbPath, file);
  if (!fs.existsSync(filePath)) {
    let defaultContent;
    if (file === 'admins.json' || file === 'admin.json' || file === 'reseller.json') {
      defaultContent = '[]';
    } else if (file === 'settings.json') {
      defaultContent = JSON.stringify({ profit: 0, qrisPath: 'assets/qris.jpg' }, null, 2);
    } else if (file === 'services.json') {
      defaultContent = JSON.stringify(
        { ceknopol: true, ceknama: true, nik2kk: true, ceknomor: true, cekkk: true },
        null,
        2
      );
    } else if (file === 'stats.json') {
      defaultContent = JSON.stringify(
        { days: {}, services: {}, lastTokensRemaining: null, lastTokensAt: null, lastTokensService: null },
        null,
        2
      );
    } else if (file === 'loggroup.json') {
      defaultContent = JSON.stringify({ chatId: null, title: '', setBy: null, setAt: null }, null, 2);
    } else if (file === 'prices.json') {
      defaultContent = JSON.stringify(
        { ceknopol: 1, ceknama: 1, nik2kk: 1, ceknomor: 1 },
        null,
        2
      );
    } else {
      defaultContent = '{}';
    }
    fs.writeFileSync(filePath, defaultContent, 'utf-8');
    console.log(`📄 File database dibuat: ${filePath}`);
  }
}

// ─── Buat & Jalankan Bot ─────────────────────────────────────
console.log('🐢 XY Bot sedang dimulai...');
console.log(`   API URL: ${config.apiUrl}`);
console.log(`   Admin IDs: ${(config.adminIds || []).join(', ')}`);
console.log(`   DB Path: ${dbPath}`);
console.log('');

const bot = createBot(config);

bot.launch()
  .then(() => {
    console.log('✅ Bot berhasil dijalankan! (polling mode)');
    console.log('   Tekan Ctrl+C untuk menghentikan.');
  })
  .catch((err) => {
    console.error('❌ Gagal menjalankan bot:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('\n🛑 Menghentikan bot...');
  require('./src/services/expireService').hentikanPembersih();
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('\n🛑 Menghentikan bot...');
  require('./src/services/expireService').hentikanPembersih();
  bot.stop('SIGTERM');
});
