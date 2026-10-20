/**
 * orderService.js — Kelola pengaturan harga & order pembelian token
 *
 * File database:
 *   db/settings.json  → { profit: number, qrisPath: string }
 *   db/orders.json    → { [orderId]: Order }
 *
 * Struktur Order:
 * {
 *   id: string,            // ID order unik, mis. "ORD-1729000000000"
 *   userId: number,        // Telegram user ID pembeli
 *   username: string,      // @username (boleh kosong)
 *   fullName: string,      // nama tampilan
 *   amount: number,        // jumlah token yang dibeli
 *   pricePerToken: number, // harga per token saat order dibuat (2000 + profit)
 *   profit: number,        // profit admin saat order dibuat (menambah harga per token)
 *   total: number,         // amount * pricePerToken
 *   status: 'menunggu_bukti' | 'menunggu_verifikasi' | 'diterima' | 'ditolak',
 *   createdAt: string,     // ISO date
 *   updatedAt: string,     // ISO date
 *   proofFileId: string|null, // file_id foto bukti TF di Telegram
 *   adminChatId: number|null, // chat_id admin penerima bukti
 *   adminMessageId: number|null, // message_id pesan bukti di chat admin
 *   reason: string|null,   // alasan penolakan
 * }
 */

const fs = require('fs');
const path = require('path');

/** Harga dasar per token (sebelum ditambah profit admin) */
const BASE_PRICE_PER_TOKEN = 2000;

/** Alias lama — harga dasar per token */
const PRICE_PER_TOKEN = BASE_PRICE_PER_TOKEN;

/** Path gambar QRIS statis (relatif terhadap root project) */
const DEFAULT_QRIS_PATH = 'assets/qris.jpg';

let dbPath = './db';

/**
 * Set path folder database
 * @param {string} basePath - Path ke folder db
 */
function setDbPath(basePath) {
  dbPath = basePath;
}

function getSettingsFile() {
  return path.join(dbPath, 'settings.json');
}

function getOrdersFile() {
  return path.join(dbPath, 'orders.json');
}

/**
 * Baca settings.json
 * @returns {{profit: number, qrisPath: string}}
 */
function readSettings() {
  try {
    const filePath = getSettingsFile();
    if (!fs.existsSync(filePath)) {
      const def = { profit: 0, qrisPath: DEFAULT_QRIS_PATH };
      fs.writeFileSync(filePath, JSON.stringify(def, null, 2), 'utf-8');
      return def;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return {
      profit: Number.isFinite(Number(data.profit)) ? Number(data.profit) : 0,
      qrisPath: typeof data.qrisPath === 'string' && data.qrisPath ? data.qrisPath : DEFAULT_QRIS_PATH,
    };
  } catch (err) {
    console.error('[orderService] Error membaca settings.json:', err.message);
    return { profit: 0, qrisPath: DEFAULT_QRIS_PATH };
  }
}

/**
 * Tulis settings.json
 * @param {object} settings
 */
function writeSettings(settings) {
  try {
    fs.writeFileSync(getSettingsFile(), JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[orderService] Error menulis settings.json:', err.message);
  }
}

/**
 * Ambil nominal profit admin saat ini
 * @returns {number}
 */
function getProfit() {
  return readSettings().profit;
}

/**
 * Set nominal profit admin
 * @param {number} amount - Nominal profit (>= 0)
 * @returns {number} Nominal profit baru
 */
function setProfit(amount) {
  const settings = readSettings();
  settings.profit = Math.max(0, Math.floor(Number(amount) || 0));
  writeSettings(settings);
  return settings.profit;
}

/**
 * Ambil path gambar QRIS statis
 * @returns {string}
 */
function getQrisPath() {
  return readSettings().qrisPath;
}

/**
 * Hitung harga per token (dasar + profit admin)
 * @param {number} [profit] - Profit (default: ambil dari settings)
 * @returns {number} Harga per token, mis. 2000 + 100 = 2100
 */
function getPricePerToken(profit) {
  const prof = profit === undefined ? getProfit() : Math.max(0, Math.floor(Number(profit) || 0));
  return BASE_PRICE_PER_TOKEN + prof;
}

/**
 * Hitung total harga pembelian
 * harga per token = harga dasar + profit
 * total = jumlah token x harga per token
 *
 * Contoh: /setprofit 100 → harga/token 2100
 *         beli 5 token → 5 x 2100 = 10500
 *
 * @param {number} amount - Jumlah token
 * @param {number} [profit] - Profit (default: ambil dari settings)
 * @returns {{pricePerToken: number, profit: number, total: number}}
 */
function calculatePrice(amount, profit) {
  const prof = profit === undefined ? getProfit() : Math.max(0, Math.floor(Number(profit) || 0));
  const pricePerToken = BASE_PRICE_PER_TOKEN + prof;
  const total = amount * pricePerToken;
  return { pricePerToken, profit: prof, total };
}

/**
 * Baca semua order
 * @returns {object}
 */
function readOrders() {
  try {
    const filePath = getOrdersFile();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '{}', 'utf-8');
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    console.error('[orderService] Error membaca orders.json:', err.message);
    return {};
  }
}

/**
 * Tulis semua order
 * @param {object} data
 */
function writeOrders(data) {
  try {
    fs.writeFileSync(getOrdersFile(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[orderService] Error menulis orders.json:', err.message);
  }
}

/**
 * Buat order baru (status: menunggu_bukti)
 * @param {object} params
 * @param {number} params.userId
 * @param {string} [params.username]
 * @param {string} [params.fullName]
 * @param {number} params.amount - Jumlah token
 * @returns {object} Order yang dibuat
 */
function createOrder({ userId, username, fullName, amount }) {
  const orders = readOrders();
  const now = new Date().toISOString();
  const price = calculatePrice(amount);

  const id = `ORD-${Date.now()}`;
  const order = {
    id,
    userId: Number(userId),
    username: username || '',
    fullName: fullName || '',
    amount: Number(amount),
    pricePerToken: price.pricePerToken,
    profit: price.profit,
    total: price.total,
    status: 'menunggu_bukti',
    createdAt: now,
    updatedAt: now,
    proofFileId: null,
    adminChatId: null,
    adminMessageId: null,
    reason: null,
  };

  orders[id] = order;
  writeOrders(orders);
  return order;
}

/**
 * Ambil order berdasarkan ID
 * @param {string} orderId
 * @returns {object|null}
 */
function getOrder(orderId) {
  const orders = readOrders();
  return orders[orderId] || null;
}

/**
 * Ambil order aktif (menunggu bukti) milik user
 * @param {number} userId
 * @returns {object|null}
 */
function getPendingProofOrder(userId) {
  const orders = readOrders();
  const uid = Number(userId);
  const list = Object.values(orders)
    .filter((o) => o.userId === uid && o.status === 'menunggu_bukti')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list[0] || null;
}

/**
 * Ambil order berdasarkan message_id pesan bukti di chat admin
 * (mendukung banyak admin: cek seluruh daftar adminMessages)
 * @param {number} adminChatId
 * @param {number} adminMessageId
 * @returns {object|null}
 */
function findByAdminMessage(adminChatId, adminMessageId) {
  const orders = readOrders();
  const chatId = Number(adminChatId);
  const messageId = Number(adminMessageId);

  const list = Object.values(orders).filter((o) => {
    if (Array.isArray(o.adminMessages) && o.adminMessages.length > 0) {
      return o.adminMessages.some(
        (m) => Number(m.chatId) === chatId && Number(m.messageId) === messageId
      );
    }
    return Number(o.adminChatId) === chatId && Number(o.adminMessageId) === messageId;
  });

  return list[0] || null;
}

/**
 * Tandai bukti transfer sudah dikirim (status: menunggu_verifikasi)
 * @param {string} orderId
 * @param {object} params
 * @param {string} params.proofFileId
 * @param {Array<{chatId: number, messageId: number}>} params.adminMessages
 * @returns {object|null} Order yang diupdate
 */
function attachProof(orderId, { proofFileId, adminMessages }) {
  const orders = readOrders();
  const order = orders[orderId];
  if (!order) return null;

  const messages = Array.isArray(adminMessages) ? adminMessages : [];
  const first = messages[0] || {};

  order.proofFileId = proofFileId || null;
  order.adminChatId = first.chatId !== undefined ? Number(first.chatId) : null;
  order.adminMessageId = first.messageId !== undefined ? Number(first.messageId) : null;
  order.adminMessages = messages.map((m) => ({
    chatId: Number(m.chatId),
    messageId: Number(m.messageId),
  }));
  order.status = 'menunggu_verifikasi';
  order.updatedAt = new Date().toISOString();

  orders[orderId] = order;
  writeOrders(orders);
  return order;
}

/**
 * Update status order
 * @param {string} orderId
 * @param {'diterima'|'ditolak'} status
 * @param {string|null} [reason]
 * @returns {object|null} Order yang diupdate
 */
function setStatus(orderId, status, reason = null) {
  const orders = readOrders();
  const order = orders[orderId];
  if (!order) return null;

  order.status = status;
  order.reason = reason || null;
  order.updatedAt = new Date().toISOString();

  orders[orderId] = order;
  writeOrders(orders);
  return order;
}

/**
 * Batalkan order (mis. user membatalkan proses)
 * @param {string} orderId
 * @returns {boolean}
 */
function cancelOrder(orderId) {
  const orders = readOrders();
  if (!orders[orderId]) return false;
  delete orders[orderId];
  writeOrders(orders);
  return true;
}


/**
 * Rekap pendapatan dari order yang berstatus DITERIMA.
 *
 * Omzet   = total yang dibayar user
 * Profit  = profit admin (sudah termasuk dalam omzet)
 * Modal   = omzet - profit (harga dasar token)
 *
 * @param {object} [opts]
 * @param {Date} [opts.since] - Hanya order dibuat >= tanggal ini
 * @returns {object} Rekap pendapatan
 */
function getRevenue({ since } = {}) {
  const orders = Object.values(readOrders());
  const sinceTs = since ? new Date(since).getTime() : null;

  const acc = {
    omzet: 0,
    profit: 0,
    modal: 0,
    tokens: 0,
    diterima: 0,
    ditolak: 0,
    pending: 0,
  };

  for (const o of orders) {
    const created = new Date(o.createdAt).getTime();

    // Hitung status untuk SEMUA order (termasuk di luar rentang bila tanpa since)
    const statusCounted = !sinceTs || created >= sinceTs;
    if (statusCounted) {
      if (o.status === 'diterima') acc.diterima += 1;
      else if (o.status === 'ditolak') acc.ditolak += 1;
      else acc.pending += 1;
    }

    if (o.status !== 'diterima') continue;
    if (sinceTs && created < sinceTs) continue;

    acc.omzet += Number(o.total) || 0;
    acc.profit += Number(o.profit) * (Number(o.amount) || 0);
    acc.tokens += Number(o.amount) || 0;
  }

  acc.modal = acc.omzet - acc.profit;
  return acc;
}

module.exports = {
  BASE_PRICE_PER_TOKEN,
  PRICE_PER_TOKEN,
  getPricePerToken,
  setDbPath,
  getProfit,
  setProfit,
  getQrisPath,
  calculatePrice,
  createOrder,
  getOrder,
  getPendingProofOrder,
  findByAdminMessage,
  attachProof,
  setStatus,
  cancelOrder,
  readSettings,
  getRevenue,
};
