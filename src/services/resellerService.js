/**
 * resellerService.js — Sistem RESELLER (lapis kedua di bawah seller)
 *
 * Struktur: Owner -> Seller -> Reseller -> User
 *
 * Aturan:
 *   - Seller hanya boleh mendaftarkan reseller dari user yang DIUNDANGNYA
 *   - Reseller mengambil profit dari penjualan ke user-nya sendiri
 *   - Harga jual reseller = harga seller ke reseller + profit reseller
 *   - Profit owner & seller TIDAK berkurang
 *
 * File database:
 *   db/resellers.json → { [userId]: Reseller }
 *   db/resellerrefs.json → { [userId]: { resellerId, at } }
 *   db/resellerwds.json → { [wdId]: Withdrawal }
 */

const fs = require('fs');
const path = require('path');

const WALLETS = ['shopeepay', 'gopay', 'bank jago'];
const WALLET_LABELS = {
  shopeepay: 'ShopeePay',
  gopay: 'GOPAY',
  'bank jago': 'Bank Jago',
};
const MIN_WITHDRAW = 10000;

let dbPath = './db';

function setDbPath(basePath) {
  dbPath = basePath;
}

function readJson(filename, fallback = {}) {
  try {
    const filePath = path.join(dbPath, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf-8');
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : fallback;
  } catch (err) {
    console.error(`[resellerService] Error membaca ${filename}:`, err.message);
    return fallback;
  }
}

function writeJson(filename, data) {
  try {
    fs.writeFileSync(path.join(dbPath, filename), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[resellerService] Error menulis ${filename}:`, err.message);
  }
}

// ─── Wallet ──────────────────────────────────────────────────

function normalizeWallet(input) {
  if (!input) return null;
  const key = String(input).toLowerCase().trim().replace(/\s+/g, ' ');
  if (WALLETS.includes(key)) return key;
  const noSpace = key.replace(/\s/g, '');
  return WALLETS.find((w) => w.replace(/\s/g, '') === noSpace) || null;
}

function walletLabel(wallet) {
  return WALLET_LABELS[String(wallet).toLowerCase()] || wallet;
}

// ─── Reseller ────────────────────────────────────────────────

function getReseller(userId) {
  return readJson('resellers.json', {})[String(userId)] || null;
}

function isReseller(userId) {
  return Boolean(getReseller(userId));
}

function getAllResellers() {
  return Object.values(readJson('resellers.json', {}));
}

/**
 * Daftarkan reseller.
 * @param {object} params
 * @param {number} params.userId - calon reseller
 * @param {number} params.sellerId - seller yang mendaftarkan
 * @returns {{success: boolean, error?: string, data?: object}}
 */
function addReseller({ userId, sellerId }) {
  const id = Number(userId);
  const sid = Number(sellerId);

  if (!Number.isFinite(id)) return { success: false, error: 'ID tidak valid.' };

  const all = readJson('resellers.json', {});
  if (all[String(id)]) {
    return { success: false, error: `User <code>${id}</code> sudah menjadi reseller.` };
  }

  all[String(id)] = {
    userId: id,
    sellerId: sid,
    profitPerToken: 0,
    balance: 0,
    totalEarned: 0,
    wallet: null,
    account: null,
    addedAt: new Date().toISOString(),
    addedBy: sid,
  };

  writeJson('resellers.json', all);
  return { success: true, data: all[String(id)] };
}

function removeReseller(userId) {
  const all = readJson('resellers.json', {});
  const key = String(userId);
  if (!all[key]) return false;
  delete all[key];
  writeJson('resellers.json', all);
  return true;
}

/**
 * Set profit per token reseller (bebas, minimum 0)
 */
function setProfitPerToken(userId, nominal) {
  const all = readJson('resellers.json', {});
  const key = String(userId);
  const r = all[key];
  if (!r) return { success: false, error: `User <code>${key}</code> bukan reseller.` };

  const n = Math.floor(Number(nominal));
  if (!Number.isFinite(n) || n < 0) {
    return { success: false, error: 'Nominal harus berupa angka ≥ 0.' };
  }

  r.profitPerToken = n;
  all[key] = r;
  writeJson('resellers.json', all);
  return { success: true, data: r };
}

function addBalance(userId, amount) {
  const all = readJson('resellers.json', {});
  const key = String(userId);
  const r = all[key];
  if (!r) return null;

  const n = Math.floor(Number(amount)) || 0;
  r.balance = (r.balance || 0) + n;
  r.totalEarned = (r.totalEarned || 0) + n;
  all[key] = r;
  writeJson('resellers.json', all);
  return r.balance;
}

function deductBalance(userId, amount) {
  const all = readJson('resellers.json', {});
  const key = String(userId);
  const r = all[key];
  if (!r) return { success: false, error: 'Bukan reseller.' };

  const n = Math.floor(Number(amount)) || 0;
  if (n <= 0) return { success: false, error: 'Nominal tidak valid.' };
  if ((r.balance || 0) < n) return { success: false, error: 'Saldo tidak mencukupi.' };

  r.balance -= n;
  all[key] = r;
  writeJson('resellers.json', all);
  return { success: true, balance: r.balance };
}

// ─── Wallet ──────────────────────────────────────────────────

function setWallet(userId, wallet, account) {
  const all = readJson('resellers.json', {});
  const key = String(userId);
  const r = all[key];
  if (!r) return { success: false, error: 'Bukan reseller.' };

  const w = normalizeWallet(wallet);
  if (!w) return { success: false, error: 'Jenis wallet tidak dikenal.' };

  const acc = String(account || '').trim();
  if (!acc) return { success: false, error: 'Nomor wallet tidak boleh kosong.' };

  r.wallet = w;
  r.account = acc;
  all[key] = r;
  writeJson('resellers.json', all);
  return { success: true, data: r };
}

function getWallet(userId) {
  const r = getReseller(userId);
  if (!r || !r.wallet || !r.account) return null;
  return { wallet: r.wallet, account: r.account };
}

// ─── Referral ────────────────────────────────────────────────

/**
 * Simpan referral user ke reseller (satu user satu reseller, permanen)
 */
function setReferral(userId, resellerId) {
  const all = readJson('resellerrefs.json', {});
  const key = String(userId);
  if (all[key]) return false;

  all[key] = { resellerId: Number(resellerId), at: new Date().toISOString() };
  writeJson('resellerrefs.json', all);
  return true;
}

function getReferrer(userId) {
  const all = readJson('resellerrefs.json', {});
  const rec = all[String(userId)];
  return rec ? Number(rec.resellerId) : null;
}

function hasReferral(userId) {
  return Boolean(readJson('resellerrefs.json', {})[String(userId)]);
}

/**
 * ID reseller untuk user tertentu (null bila tidak ada)
 */
function getResellerIdForUser(userId) {
  const rid = getReferrer(userId);
  if (!rid) return null;
  return getReseller(rid) ? rid : null;
}

/**
 * Profit reseller untuk user tertentu
 */
function getProfitForUser(userId) {
  const rid = getResellerIdForUser(userId);
  if (!rid) return 0;
  const r = getReseller(rid);
  return Math.max(0, Math.floor(Number(r.profitPerToken) || 0));
}

/**
 * Daftar reseller milik seorang seller
 */
function getResellersOfSeller(sellerId) {
  return getAllResellers().filter((r) => Number(r.sellerId) === Number(sellerId));
}

// ─── Withdrawal ──────────────────────────────────────────────

function readWithdrawals() {
  return readJson('resellerwds.json', {});
}

function createWithdrawal({ resellerId, wallet, account, amount }) {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n < MIN_WITHDRAW) {
    return {
      success: false,
      error: `Minimum penarikan <b>Rp${MIN_WITHDRAW.toLocaleString('id-ID')}</b>.`,
    };
  }

  const r = getReseller(resellerId);
  if (!r) return { success: false, error: 'Bukan reseller.' };
  if ((r.balance || 0) < n) return { success: false, error: 'Saldo tidak mencukupi.' };

  const deducted = deductBalance(resellerId, n);
  if (!deducted.success) return { success: false, error: deducted.error };

  const list = readWithdrawals();
  const id = `RWD-${Date.now()}`;

  list[id] = {
    id,
    resellerId: Number(resellerId),
    wallet,
    account: String(account),
    amount: n,
    status: 'menunggu',
    createdAt: new Date().toISOString(),
    doneAt: null,
    doneBy: null,
  };

  writeJson('resellerwds.json', list);
  return { success: true, data: list[id], balance: deducted.balance };
}

function findByAdminMessage(chatId, messageId) {
  return (
    Object.values(readWithdrawals()).find(
      (w) =>
        w.adminChatId !== undefined &&
        Number(w.adminChatId) === Number(chatId) &&
        Number(w.adminMessageId) === Number(messageId)
    ) || null
  );
}

function markWithdrawalDone(wdId, doneBy) {
  const list = readWithdrawals();
  const wd = list[wdId];
  if (!wd) return null;

  wd.status = 'selesai';
  wd.doneAt = new Date().toISOString();
  wd.doneBy = Number(doneBy) || null;

  list[wdId] = wd;
  writeJson('resellerwds.json', list);
  return wd;
}

function attachAdminMessage(wdId, msg) {
  const list = readWithdrawals();
  const wd = list[wdId];
  if (!wd) return;

  wd.adminChatId = Number(msg.chatId);
  wd.adminMessageId = Number(msg.messageId);

  list[wdId] = wd;
  writeJson('resellerwds.json', list);
}

module.exports = {
  WALLETS,
  WALLET_LABELS,
  MIN_WITHDRAW,
  setDbPath,
  normalizeWallet,
  walletLabel,
  getReseller,
  isReseller,
  getAllResellers,
  addReseller,
  removeReseller,
  setProfitPerToken,
  addBalance,
  deductBalance,
  setWallet,
  getWallet,
  setReferral,
  getReferrer,
  hasReferral,
  getResellerIdForUser,
  getProfitForUser,
  getResellersOfSeller,
  createWithdrawal,
  findByAdminMessage,
  markWithdrawalDone,
  attachAdminMessage,
  readWithdrawals,
};
