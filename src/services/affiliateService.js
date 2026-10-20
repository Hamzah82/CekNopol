/**
 * affiliateService.js — Kelola affiliator, referral, saldo & penarikan
 *
 * File database:
 *   db/affiliators.json → { [userId]: Affiliator }
 *   db/referrals.json   → { [userId]: { affiliatorId, at } }
 *   db/withdrawals.json → { [wdId]: Withdrawal }
 *
 * Struktur Affiliator:
 * {
 *   userId: number,
 *   username: string,
 *   fullName: string,
 *   profitPerToken: number,   // rupiah per token, tidak boleh > profit admin
 *   balance: number,          // saldo rupiah yang bisa ditarik
 *   totalEarned: number,      // akumulasi pendapatan
 *   addedAt: string,
 *   addedBy: number,
 * }
 *
 * Struktur Withdrawal:
 * {
 *   id: string,
 *   affiliatorId: number,
 *   wallet: string,     // ShopeePay | GOPAY | Bank Jago
 *   account: string,    // nomor HP / nomor rekening
 *   amount: number,
 *   status: 'menunggu' | 'selesai',
 *   createdAt: string,
 *   doneAt: string|null,
 *   doneBy: number|null,
 * }
 */

const fs = require('fs');
const path = require('path');

/** Wallet yang didukung */
const WALLETS = ['shopeepay', 'gopay', 'bank jago'];

/** Label tampilan wallet */
const WALLET_LABELS = {
  shopeepay: 'ShopeePay',
  gopay: 'GOPAY',
  'bank jago': 'Bank Jago',
};

/** Minimum penarikan (rupiah) */
const MIN_WITHDRAW = 10000;

let dbPath = './db';

/**
 * Set path folder database
 * @param {string} basePath
 */
function setDbPath(basePath) {
  dbPath = basePath;
}

// ─── Helper file ─────────────────────────────────────────────

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
    console.error(`[affiliateService] Error membaca ${filename}:`, err.message);
    return fallback;
  }
}

function writeJson(filename, data) {
  try {
    fs.writeFileSync(path.join(dbPath, filename), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[affiliateService] Error menulis ${filename}:`, err.message);
  }
}

// ─── Wallet ──────────────────────────────────────────────────

/**
 * Normalisasi nama wallet ke bentuk baku
 * @param {string} input
 * @returns {string|null} Nama baku atau null bila tidak didukung
 */
function normalizeWallet(input) {
  if (!input) return null;
  const key = String(input).toLowerCase().trim().replace(/\s+/g, ' ');
  if (WALLETS.includes(key)) return key;
  // toleransi tanpa spasi: "bankjago"
  const noSpace = key.replace(/\s/g, '');
  const found = WALLETS.find((w) => w.replace(/\s/g, '') === noSpace);
  return found || null;
}

/**
 * Label tampilan wallet
 * @param {string} wallet
 * @returns {string}
 */
function walletLabel(wallet) {
  return WALLET_LABELS[String(wallet).toLowerCase()] || wallet;
}

// ─── Affiliator ──────────────────────────────────────────────

/**
 * Baca semua affiliator
 * @returns {object}
 */
function readAffiliators() {
  return readJson('affiliators.json', {});
}

/**
 * Tulis semua affiliator
 * @param {object} data
 */
function writeAffiliators(data) {
  writeJson('affiliators.json', data);
}

/**
 * Ambil data affiliator
 * @param {number|string} userId
 * @returns {object|null}
 */
function getAffiliator(userId) {
  const all = readAffiliators();
  return all[String(userId)] || null;
}

/**
 * Cek apakah user affiliator
 * @param {number|string} userId
 * @returns {boolean}
 */
function isAffiliator(userId) {
  return Boolean(getAffiliator(userId));
}

/**
 * Daftar semua affilator
 * @returns {Array<object>}
 */
function getAllAffiliators() {
  return Object.values(readAffiliators());
}

/**
 * Tambah affiliator baru
 * @param {object} params
 * @returns {{success: boolean, error?: string, data?: object}}
 */
function addAffiliator({ userId, username, fullName, addedBy }) {
  const id = Number(userId);
  if (!Number.isFinite(id)) {
    return { success: false, error: 'ID tidak valid.' };
  }

  const all = readAffiliators();
  if (all[String(id)]) {
    return { success: false, error: `User <code>${id}</code> sudah menjadi affiliator.` };
  }

  const data = {
    userId: id,
    username: username || '',
    fullName: fullName || '',
    profitPerToken: 0,
    balance: 0,
    totalEarned: 0,
    addedAt: new Date().toISOString(),
    addedBy: Number(addedBy) || null,
  };

  all[String(id)] = data;
  writeAffiliators(all);
  return { success: true, data };
}

/**
 * Hapus affiliator
 * @param {number|string} userId
 * @returns {boolean}
 */
function removeAffiliator(userId) {
  const all = readAffiliators();
  const key = String(userId);
  if (!all[key]) return false;
  delete all[key];
  writeAffiliators(all);
  return true;
}

/**
 * Set profit per token untuk affiliator.
 * Nilai tidak boleh melebihi profit admin saat ini.
 *
 * @param {number|string} userId
 * @param {number} nominal
 * @param {number} maxProfit - profit admin saat ini (batas atas)
 * @returns {{success: boolean, error?: string, data?: object}}
 */
function setProfitPerToken(userId, nominal, maxProfit) {
  const all = readAffiliators();
  const key = String(userId);
  const aff = all[key];

  if (!aff) return { success: false, error: `User <code>${key}</code> bukan affiliator.` };

  const n = Math.floor(Number(nominal));
  if (!Number.isFinite(n) || n < 0) {
    return { success: false, error: 'Nominal harus berupa angka ≥ 0.' };
  }

  const max = Math.max(0, Math.floor(Number(maxProfit) || 0));
  if (n > max) {
    return {
      success: false,
      error: `Nominal tidak boleh melebihi profit admin (<b>Rp${max.toLocaleString('id-ID')}</b> per token).`,
    };
  }

  aff.profitPerToken = n;
  all[key] = aff;
  writeAffiliators(all);
  return { success: true, data: aff };
}

/**
 * Turunkan profit affiliator otomatis bila melebihi profit admin baru.
 * Dipanggil setiap kali profit admin diubah.
 *
 * @param {number} maxProfit
 * @returns {Array<{userId: number, from: number, to: number}>} daftar yang disesuaikan
 */
function clampToAdminProfit(maxProfit) {
  const max = Math.max(0, Math.floor(Number(maxProfit) || 0));
  const all = readAffiliators();
  const changed = [];

  for (const [key, aff] of Object.entries(all)) {
    if ((aff.profitPerToken || 0) > max) {
      changed.push({ userId: Number(key), from: aff.profitPerToken, to: max });
      aff.profitPerToken = max;
      all[key] = aff;
    }
  }

  if (changed.length) writeAffiliators(all);
  return changed;
}

/**
 * Tambah saldo affiliator (rupiah)
 * @param {number|string} userId
 * @param {number} amount
 * @returns {number|null} saldo baru, atau null bila bukan affiliator
 */
function addBalance(userId, amount) {
  const all = readAffiliators();
  const key = String(userId);
  const aff = all[key];
  if (!aff) return null;

  const n = Math.floor(Number(amount)) || 0;
  aff.balance = (aff.balance || 0) + n;
  aff.totalEarned = (aff.totalEarned || 0) + n;
  all[key] = aff;
  writeAffiliators(all);
  return aff.balance;
}

/**
 * Kurangi saldo affiliator (untuk penarikan)
 * @param {number|string} userId
 * @param {number} amount
 * @returns {{success: boolean, error?: string, balance?: number}}
 */
function deductBalance(userId, amount) {
  const all = readAffiliators();
  const key = String(userId);
  const aff = all[key];
  if (!aff) return { success: false, error: 'Bukan affiliator.' };

  const n = Math.floor(Number(amount)) || 0;
  if (n <= 0) return { success: false, error: 'Nominal tidak valid.' };
  if ((aff.balance || 0) < n) {
    return { success: false, error: 'Saldo tidak mencukupi.' };
  }

  aff.balance -= n;
  all[key] = aff;
  writeAffiliators(all);
  return { success: true, balance: aff.balance };
}

// ─── Referral ────────────────────────────────────────────────

/**
 * Baca semua referral
 * @returns {object}
 */
function readReferrals() {
  return readJson('referrals.json', {});
}

/**
 * Simpan referral user ke affiliator
 * @param {number|string} userId - user yang direferensikan
 * @param {number|string} affiliatorId
 * @returns {boolean} true bila tersimpan, false bila sudah pernah tercatat
 */
function setReferral(userId, affiliatorId) {
  const all = readReferrals();
  const key = String(userId);
  if (all[key]) return false; // satu user hanya satu affiliator, permanen

  all[key] = {
    affiliatorId: Number(affiliatorId),
    at: new Date().toISOString(),
  };
  writeJson('referrals.json', all);
  return true;
}

/**
 * Ambil affiliator yang mereferensikan user
 * @param {number|string} userId
 * @returns {number|null}
 */
function getReferrer(userId) {
  const all = readReferrals();
  const rec = all[String(userId)];
  return rec ? Number(rec.affiliatorId) : null;
}

/**
 * Apakah user sudah punya referral tercatat
 * @param {number|string} userId
 * @returns {boolean}
 */
function hasReferral(userId) {
  return Boolean(readReferrals()[String(userId)]);
}

// ─── Withdrawal ──────────────────────────────────────────────

/**
 * Baca semua penarikan
 * @returns {object}
 */
function readWithdrawals() {
  return readJson('withdrawals.json', {});
}

/**
 * Buat pengajuan penarikan
 * @param {object} params
 * @returns {{success: boolean, error?: string, data?: object}}
 */
function createWithdrawal({ affiliatorId, wallet, account, amount }) {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n < MIN_WITHDRAW) {
    return {
      success: false,
      error: `Minimum penarikan <b>Rp${MIN_WITHDRAW.toLocaleString('id-ID')}</b>.`,
    };
  }

  const aff = getAffiliator(affiliatorId);
  if (!aff) return { success: false, error: 'Bukan affiliator.' };

  if ((aff.balance || 0) < n) {
    return { success: false, error: 'Saldo tidak mencukupi.' };
  }

  const deducted = deductBalance(affiliatorId, n);
  if (!deducted.success) return { success: false, error: deducted.error };

  const list = readWithdrawals();
  const id = `WD-${Date.now()}`;

  const wd = {
    id,
    affiliatorId: Number(affiliatorId),
    wallet,
    account: String(account),
    amount: n,
    status: 'menunggu',
    createdAt: new Date().toISOString(),
    doneAt: null,
    doneBy: null,
  };

  list[id] = wd;
  writeJson('withdrawals.json', list);

  return { success: true, data: wd, balance: deducted.balance };
}

/**
 * Ambil penarikan berdasarkan ID
 * @param {string} wdId
 * @returns {object|null}
 */
function getWithdrawal(wdId) {
  return readWithdrawals()[wdId] || null;
}

/**
 * Cari penarikan dari message_id notifikasi di chat admin
 * @param {number} chatId
 * @param {number} messageId
 * @returns {object|null}
 */
function findByAdminMessage(chatId, messageId) {
  const list = Object.values(readWithdrawals());
  const found = list.find(
    (w) => w.adminChatId !== undefined && Number(w.adminChatId) === Number(chatId) && Number(w.adminMessageId) === Number(messageId)
  );
  return found || null;
}

/**
 * Tandai penarikan selesai
 * @param {string} wdId
 * @param {number} doneBy
 * @returns {object|null}
 */
function markWithdrawalDone(wdId, doneBy) {
  const list = readWithdrawals();
  const wd = list[wdId];
  if (!wd) return null;

  wd.status = 'selesai';
  wd.doneAt = new Date().toISOString();
  wd.doneBy = Number(doneBy) || null;

  list[wdId] = wd;
  writeJson('withdrawals.json', list);
  return wd;
}

/**
 * Simpan info pesan notifikasi admin pada penarikan
 * @param {string} wdId
 * @param {{chatId: number, messageId: number}} msg
 */
function attachAdminMessage(wdId, msg) {
  const list = readWithdrawals();
  const wd = list[wdId];
  if (!wd) return;

  wd.adminChatId = Number(msg.chatId);
  wd.adminMessageId = Number(msg.messageId);

  list[wdId] = wd;
  writeJson('withdrawals.json', list);
}

module.exports = {
  WALLETS,
  WALLET_LABELS,
  MIN_WITHDRAW,
  setDbPath,
  normalizeWallet,
  walletLabel,
  // Affiliator
  getAffiliator,
  isAffiliator,
  getAllAffiliators,
  addAffiliator,
  removeAffiliator,
  setProfitPerToken,
  clampToAdminProfit,
  addBalance,
  deductBalance,
  // Referral
  setReferral,
  getReferrer,
  hasReferral,
  // Withdrawal
  createWithdrawal,
  getWithdrawal,
  findByAdminMessage,
  markWithdrawalDone,
  attachAdminMessage,
  readWithdrawals,
};
