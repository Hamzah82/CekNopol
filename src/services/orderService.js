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
 *   sellerId: number|null,         // seller yang mereferensikan user
 *   sellerReward: number,          // total bagian seller (rupiah)
 *   sellerProfitPerToken: number,  // profit seller per token
 * }
 */

const fs = require('fs');
const path = require('path');
const jsonStore = require('./jsonStore');

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
 * @returns {{profit: number, qrisPath: string, afk: boolean, afkReason: string}}
 */
function readSettings() {
  const def = { profit: 0, qrisPath: DEFAULT_QRIS_PATH, afk: false, afkReason: '' };
  try {
    const filePath = getSettingsFile();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(def, null, 2), 'utf-8');
      return def;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return {
      profit: Number.isFinite(Number(data.profit)) ? Number(data.profit) : 0,
      qrisPath: typeof data.qrisPath === 'string' && data.qrisPath ? data.qrisPath : DEFAULT_QRIS_PATH,
      afk: Boolean(data.afk),
      afkReason: typeof data.afkReason === 'string' ? data.afkReason : '',
    };
  } catch (err) {
    console.error('[orderService] Error membaca settings.json:', err.message);
    return def;
  }
}

/**
 * Tulis settings.json
 * @param {object} settings
 */
function writeSettings(settings) {
  try {
    jsonStore.tulisJsonSync(getSettingsFile(), settings);
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
 * Aktifkan / matikan status AFK admin.
 *
 * @param {boolean} aktif
 * @param {string} [alasan]
 * @returns {{afk: boolean, afkReason: string}}
 */
function setAfk(aktif, alasan) {
  const settings = readSettings();
  settings.afk = Boolean(aktif);
  settings.afkReason = aktif ? String(alasan || '').trim() : '';
  writeSettings(settings);
  return { afk: settings.afk, afkReason: settings.afkReason };
}

/**
 * Status AFK admin saat ini.
 * @returns {{afk: boolean, afkReason: string}}
 */
function getAfk() {
  const s = readSettings();
  return { afk: s.afk, afkReason: s.afkReason };
}

/**
 * Ambil path gambar QRIS statis
 * @returns {string}
 */
function getQrisPath() {
  return readSettings().qrisPath;
}

/**
 * Hitung harga per token (dasar + profit admin + profit seller)
 *
 * @param {number} [profit] - Profit admin (default: dari settings)
 * @param {number} [sellerProfit] - Profit seller (default 0)
 * @returns {number} Harga per token, mis. 2000 + 500 + 500 = 3000
 */
function getPricePerToken(profit, sellerProfit, resellerProfit) {
  const prof = profit === undefined ? getProfit() : Math.max(0, Math.floor(Number(profit) || 0));
  const sp = Math.max(0, Math.floor(Number(sellerProfit) || 0));
  const rp = Math.max(0, Math.floor(Number(resellerProfit) || 0));
  return BASE_PRICE_PER_TOKEN + prof + sp + rp;
}

/**
 * Hitung total harga pembelian
 *
 * harga per token = modal + profit admin + profit seller
 * total = jumlah token x harga per token
 *
 * Contoh: modal 2000, profit admin 500, profit seller 500
 *         -> harga/token 3000
 *         -> beli 5 token = 15000
 *
 * @param {number} amount - Jumlah token
 * @param {number} [profit] - Profit admin (default: dari settings)
 * @param {number} [sellerProfit] - Profit seller (default 0)
 * @returns {{pricePerToken: number, profit: number, sellerProfit: number, total: number}}
 */
function calculatePrice(amount, profit, sellerProfit, resellerProfit) {
  const prof = profit === undefined ? getProfit() : Math.max(0, Math.floor(Number(profit) || 0));
  const sp = Math.max(0, Math.floor(Number(sellerProfit) || 0));
  const rp = Math.max(0, Math.floor(Number(resellerProfit) || 0));
  const pricePerToken = BASE_PRICE_PER_TOKEN + prof + sp + rp;
  const total = amount * pricePerToken;
  return { pricePerToken, profit: prof, sellerProfit: sp, resellerProfit: rp, total };
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
    // Tulis atomik agar orders.json tidak korup bila proses mati
    // di tengah penulisan atau ada dua penulisan bersamaan.
    jsonStore.tulisJsonSync(getOrdersFile(), data);
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
 * @param {number} [params.sellerProfit] - Profit seller untuk user ini (default 0)
 * @param {number|null} [params.sellerId] - ID seller yang mereferensikan user
 * @returns {object} Order yang dibuat
 */
function createOrder({ userId, username, fullName, amount, sellerProfit, sellerId, resellerProfit, resellerId }) {
  const orders = readOrders();
  const now = new Date().toISOString();
  const price = calculatePrice(amount, undefined, sellerProfit, resellerProfit);

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
    // ─── Seller (pengganti affiliator) ───
    sellerId: sellerId ? Number(sellerId) : null,
    sellerProfitPerToken: price.sellerProfit,
    sellerReward: 0,
    // ─── Reseller (lapis kedua) ───
    resellerId: resellerId ? Number(resellerId) : null,
    resellerProfitPerToken: price.resellerProfit,
    resellerReward: 0,
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
 * Omzet     = total yang dibayar user
 * Profit    = profit KOTOR (belum dipotong komisi affiliator)
 * AffReward = total komisi yang dibayarkan ke affiliator
 * NetProfit = profit kotor - komisi affiliator (milik admin utama)
 * Modal     = omzet - profit (biaya dasar token)
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
    profit: 0,          // profit admin (bagian admin saja)
    sellerReward: 0,    // total bagian yang menjadi hak seller
    resellerReward: 0,  // total bagian yang menjadi hak reseller
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
    acc.sellerReward += Number(o.sellerReward) || 0;
    acc.resellerReward += Number(o.resellerReward) || 0;
    acc.tokens += Number(o.amount) || 0;
  }

  // Profit admin TIDAK dipotong seller — seller punya bagiannya sendiri.
  // Catatan: tidak ada "profit bersih" terpisah karena tidak ada potongan.
  acc.modal = acc.omzet - acc.profit - acc.sellerReward - acc.resellerReward;
  return acc;
}


/**
 * Hapus SEMUA order berstatus 'ditolak' dari database.
 *
 * @returns {{deleted: number, ids: string[], totalNominal: number}}
 */
function clearRejectedOrders() {
  const orders = readOrders();
  const ids = [];
  let totalNominal = 0;

  for (const [id, o] of Object.entries(orders)) {
    if (o && o.status === 'ditolak') {
      ids.push(id);
      totalNominal += Number(o.total) || 0;
      delete orders[id];
    }
  }

  if (ids.length > 0) writeOrders(orders);

  return { deleted: ids.length, ids, totalNominal };
}

/**
 * Hitung jumlah order ditolak (tanpa menghapus)
 * @returns {{count: number, totalNominal: number}}
 */
function countRejectedOrders() {
  const orders = Object.values(readOrders());
  let count = 0;
  let totalNominal = 0;

  for (const o of orders) {
    if (o && o.status === 'ditolak') {
      count += 1;
      totalNominal += Number(o.total) || 0;
    }
  }

  return { count, totalNominal };
}


/**
 * Catat bagian seller pada order.
 * Dipanggil saat /terima agar laporan laba bisa dihitung ulang nanti.
 *
 * @param {string} orderId
 * @param {object} params
 * @param {number} params.sellerId
 * @param {number} params.reward - total bagian seller (rupiah)
 * @param {number} params.profitPerToken - profit seller per token
 * @returns {object|null}
 */
function setSellerReward(orderId, { sellerId, reward, profitPerToken }) {
  const orders = readOrders();
  const order = orders[orderId];
  if (!order) return null;

  order.sellerId = Number(sellerId) || null;
  order.sellerReward = Math.max(0, Math.floor(Number(reward) || 0));
  order.sellerProfitPerToken = Math.max(0, Math.floor(Number(profitPerToken) || 0));

  orders[orderId] = order;
  writeOrders(orders);
  return order;
}

/**
 * Catat bagian reseller pada order.
 *
 * @param {string} orderId
 * @param {object} params
 * @param {number} params.resellerId
 * @param {number} params.reward
 * @param {number} params.profitPerToken
 * @returns {object|null}
 */
function setResellerReward(orderId, { resellerId, reward, profitPerToken }) {
  const orders = readOrders();
  const order = orders[orderId];
  if (!order) return null;

  order.resellerId = Number(resellerId) || null;
  order.resellerReward = Math.max(0, Math.floor(Number(reward) || 0));
  order.resellerProfitPerToken = Math.max(0, Math.floor(Number(profitPerToken) || 0));

  orders[orderId] = order;
  writeOrders(orders);
  return order;
}


/** Pemetaan filter daftar order -> status yang termasuk */
const ORDER_FILTERS = {
  all: null, // semua status
  pending: ['menunggu_bukti', 'menunggu_verifikasi'],
  diterima: ['diterima'],
  ditolak: ['ditolak'],
  kedaluwarsa: ['kedaluwarsa'],
};

/**
 * Ambil daftar order sesuai filter, terbaru lebih dulu.
 *
 * @param {string} filter - 'all' | 'pending' | 'diterima' | 'ditolak'
 * @returns {Array<object>}
 */
function getOrdersByFilter(filter) {
  const key = String(filter || 'all').toLowerCase();
  const statuses = ORDER_FILTERS[key];

  const all = Object.values(readOrders());

  const hasil = statuses ? all.filter((o) => statuses.includes(o.status)) : all;

  // Urutkan dari yang paling baru dibuat
  return hasil.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Hitung ringkasan nominal dari daftar order.
 *
 * @param {Array<object>} orders
 * @returns {{count: number, tokens: number, total: number}}
 */
function summarizeOrders(orders) {
  return {
    count: orders.length,
    tokens: orders.reduce((a, o) => a + (Number(o.amount) || 0), 0),
    total: orders.reduce((a, o) => a + (Number(o.total) || 0), 0),
  };
}


/** Batas waktu order menggantung sebelum kedaluwarsa (jam) */
const ORDER_EXPIRE_HOURS = 24;

/**
 * Ambil order yang sudah kedaluwarsa.
 *
 * Order dianggap kedaluwarsa bila masih berstatus menunggu
 * (menunggu_bukti / menunggu_verifikasi) dan umurnya melewati batas.
 *
 * @param {number} [jam] - batas umur (default ORDER_EXPIRE_HOURS)
 * @returns {Array<object>}
 */
function getExpiredOrders(jam) {
  const batas = (Number(jam) || ORDER_EXPIRE_HOURS) * 60 * 60 * 1000;
  const sekarang = Date.now();

  return Object.values(readOrders()).filter((o) => {
    if (!o || (o.status !== 'menunggu_bukti' && o.status !== 'menunggu_verifikasi')) {
      return false;
    }
    const dibuat = new Date(o.createdAt).getTime();
    if (!Number.isFinite(dibuat)) return false;
    return sekarang - dibuat >= batas;
  });
}

/**
 * Tandai order kedaluwarsa sebagai 'kedaluwarsa'.
 *
 * Dipisah dari getExpiredOrders() agar pemanggil bisa mengirim
 * notifikasi ke user lebih dulu, baru memanggil ini.
 *
 * @param {string[]} orderIds
 * @returns {number} jumlah order yang ditandai
 */
function markExpired(orderIds) {
  const orders = readOrders();
  let n = 0;

  for (const id of orderIds) {
    const o = orders[id];
    if (!o) continue;
    if (o.status !== 'menunggu_bukti' && o.status !== 'menunggu_verifikasi') continue;

    o.status = 'kedaluwarsa';
    o.reason = 'Melewati batas waktu pembayaran';
    o.updatedAt = new Date().toISOString();
    orders[id] = o;
    n++;
  }

  if (n > 0) writeOrders(orders);
  return n;
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
  setAfk,
  getAfk,
  getRevenue,
  setSellerReward,
  setResellerReward,
  clearRejectedOrders,
  countRejectedOrders,
  ORDER_EXPIRE_HOURS,
  getExpiredOrders,
  markExpired,
  ORDER_FILTERS,
  getOrdersByFilter,
  summarizeOrders,
};
