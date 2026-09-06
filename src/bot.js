/**
 * bot.js — Inisialisasi & setup bot Telegraf
 */

const { Telegraf } = require('telegraf');
const startHandler = require('./handlers/start');
const tokenHandler = require('./handlers/token');
const cekHandler = require('./handlers/cek');
const ceknamaHandler = require('./handlers/ceknama');
const apiService = require('./services/api');
const cacheService = require('./services/cache');
const tokenService = require('./services/tokenManager');

/**
 * Buat dan konfigurasi instance bot
 * @param {object} config - Konfigurasi dari setup.json
 * @returns {Telegraf} Instance bot yang sudah dikonfigurasi
 */
function createBot(config) {
  // Validasi botToken
  if (!config.botToken) {
    throw new Error('botToken tidak ditemukan di setup.json');
  }

  // Inisialisasi Telegraf
  const bot = new Telegraf(config.botToken);

  // Set path database untuk services
  const dbPath = config.dbPath || './db';
  cacheService.setDbPath(dbPath);
  tokenService.setDbPath(dbPath);

  // Inisialisasi API service
  if (!config.apiUrl || !config.apiKey) {
    console.warn('[bot] Peringatan: apiUrl atau apiKey tidak diset di setup.json');
  }
  apiService.initApi(config.apiUrl, config.apiKey);

  // Inisialisasi admin IDs untuk handler token
  tokenHandler.initAdmins(config.adminIds || []);

  // Register semua handlers
  startHandler.register(bot);
  tokenHandler.register(bot);
  cekHandler.register(bot);
  ceknamaHandler.register(bot);

  // Error handling global
  bot.catch((err, ctx) => {
    console.error(`[bot] Error untuk update ${ctx.updateType}:`, err);
    ctx.reply('⚠️ Terjadi kesalahan internal. Coba lagi nanti.').catch(() => {});
  });

  return bot;
}

module.exports = { createBot };
