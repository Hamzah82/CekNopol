/**
 * bot.js — Inisialisasi & setup bot Telegraf
 */

const { Telegraf } = require('telegraf');
const startHandler = require('./handlers/start');
const tokenHandler = require('./handlers/token');
const cekHandler = require('./handlers/cek');
const ceknamaHandler = require('./handlers/ceknama');
const adminHandler = require('./handlers/admin');
const resellerHandler = require('./handlers/reseller');
const nik2kkHandler = require('./handlers/nik2kk');
const ceknomorHandler = require('./handlers/ceknomor');
const buyHandler = require('./handlers/buy');
const adminmenuHandler = require('./handlers/adminmenu');
const setlogHandler = require('./handlers/setlog');
const statsHandler = require('./handlers/stats');
const cleardepoHandler = require('./handlers/cleardepo');
const cekkkHandler = require('./handlers/cekkk');
const affHandler = require('./handlers/aff');
const backupHandler = require('./handlers/backup');
const apiService = require('./services/api');
const cacheService = require('./services/cache');
const tokenService = require('./services/tokenManager');
const roleManager = require('./services/roleManager');
const refundService = require('./services/refundService');
const orderService = require('./services/orderService');
const priceService = require('./services/priceService');
const logService = require('./services/logService');
const statsService = require('./services/statsService');
const affiliateService = require('./services/affiliateService');
const userService = require('./services/userService');

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
  roleManager.setDbPath(dbPath);
  orderService.setDbPath(dbPath);
  priceService.setDbPath(dbPath);
  logService.setDbPath(dbPath);
  statsService.setDbPath(dbPath);
  affiliateService.setDbPath(dbPath);
  userService.setDbPath(dbPath);

  // Inisialisasi API service
  if (!config.apiUrl || !config.apiKey) {
    console.warn('[bot] Peringatan: apiUrl atau apiKey tidak diset di setup.json');
  }
  apiService.initApi(config.apiUrl, config.apiKey);

  // Inisialisasi admin IDs untuk handler token
  tokenHandler.initAdmins(config.adminIds || []);
  adminHandler.initSetupAdmins(config.adminIds || []);
  resellerHandler.initSetupAdmins(config.adminIds || []);
  refundService.initSetupAdmins(config.adminIds || []);
  buyHandler.initSetupAdmins(config.adminIds || []);
  adminmenuHandler.initSetupAdmins(config.adminIds || []);
  startHandler.initSetupAdmins(config.adminIds || []);
  cekHandler.initSetupAdmins(config.adminIds || []);
  ceknamaHandler.initSetupAdmins(config.adminIds || []);
  nik2kkHandler.initSetupAdmins(config.adminIds || []);
  ceknomorHandler.initSetupAdmins(config.adminIds || []);
  setlogHandler.initSetupAdmins(config.adminIds || []);
  statsHandler.initSetupAdmins(config.adminIds || []);
  cleardepoHandler.initSetupAdmins(config.adminIds || []);
  cekkkHandler.initSetupAdmins(config.adminIds || []);
  affHandler.initSetupAdmins(config.adminIds || [], config.botUsername || '');
  backupHandler.initSetupAdmins(config.adminIds || [], dbPath);

  // Register semua handlers
  startHandler.register(bot);
  tokenHandler.register(bot);
  cekHandler.register(bot);
  ceknamaHandler.register(bot);
  adminHandler.register(bot);
  resellerHandler.register(bot);
  resellerHandler.registerGive(bot);
  nik2kkHandler.register(bot);
  ceknomorHandler.register(bot);
  buyHandler.register(bot);
  adminmenuHandler.register(bot);
  setlogHandler.register(bot);
  statsHandler.register(bot);
  cleardepoHandler.register(bot);
  cekkkHandler.register(bot);
  affHandler.register(bot);
  backupHandler.register(bot);

  // Error handling global
  bot.catch((err, ctx) => {
    console.error(`[bot] Error untuk update ${ctx.updateType}:`, err);
    ctx.reply('⚠️ Terjadi kesalahan internal. Coba lagi nanti.').catch(() => {});
  });

  return bot;
}

module.exports = { createBot };
