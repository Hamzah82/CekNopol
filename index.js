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

// ─── Pastikan folder db ada ──────────────────────────────────
const dbPath = config.dbPath || './db';
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
  console.log(`📁 Folder database dibuat: ${dbPath}`);
}

// Pastikan file JSON default ada
const dbFiles = ['plat.json', 'tokens.json', 'admins.json', 'nama.json'];
for (const file of dbFiles) {
  const filePath = path.join(dbPath, file);
  if (!fs.existsSync(filePath)) {
    const defaultContent = file === 'admins.json' ? '[]' : '{}';
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
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('\n🛑 Menghentikan bot...');
  bot.stop('SIGTERM');
});
