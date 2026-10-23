/**
 * sellerService.js — Sistem SELLER (pengganti affiliator)
 *
 * Model bisnis:
 *   harga jual ke user = modal (2000) + profit admin + profit seller
 *
 *   - profit admin diatur owner lewat /setprofit  (milik admin, TIDAK berkurang)
 *   - profit seller diatur seller lewat /seller setprofit (milik seller)
 *   - seller menaikkan harga di atas harga admin; TIDAK memakan profit admin
 *
 * Contoh: modal 2000, profit admin 500, profit seller 500
 *         -> user undangan seller membayar 3000
 *         -> 500 untuk admin, 500 untuk seller
 *
 * File database:
 *   db/sellers.json     → { [userId]: Seller }
 *   db/sellerrefs.json  → { [userId]: { sellerId, at } }
 *   db/sellerwds.json   → { [wdId]: Withdrawal }
 */

const fs = require('fs');
const path = require('path');

/** Wallet yang didukung untuk penarikan */
const WALLETS = ['shopeepay', 'gopay', 'bank jago', 'seabank'];

/** Label tampilan wallet */
const WALLET_LABELS = {
  shopeepay: 'ShopeePay',
  gopay: 'GOPAY',
  'bank jago': 'Bank Jago',
  seabank: 'SeaBank',
};

/** Minimum penarikan (rupiah) */
const MIN_WITHDRAW = 10000;

let dbPath = './db';

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
    console.error(`[sellerService] Error membaca ${filename}:`, err.message);
    return fallback;
  }
}

function writeJson(filename, data) {
  try {
    fs.writeFileSync(path.join(dbPath, filename), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[sellerService] Error menulis ${filename}:`, err.message);
  }
}

// ─── Wallet ──────────────────────────────────────────────────

function normalizeWallet(input) {
  if (!input) return null;
  const key = String(input).toLowerCase().trim().replace(/\s+/g, ' ');
  if (WALLETS.includes(key)) return key;
  const noSpace = key.replace(/\s/g, '');
  const found = WALLETS.find((w) => w.replace(/\s/g, '') === noSpace);
  return found || null;
}

function walletLabel(wallet) {
  return WALLET_LABELS[String(wallet).toLowerCase()] || wallet;
}

// ─── Seller ──────────────────────────────────────────────────

/**
 * Ambil data seller
 * @param {number|string} userId
 * @returns {object|null}
 */
function getSeller(userId) {
  const all = readJson('sellers.json', {});
  return all[String(userId)] || null;
}

/**
 * Cek apakah user seller
 */
function isSeller(userId) {
  return Boolean(getSeller(userId));
}

/**
 * Daftar semua seller
 * @returns {Array<object>}
 */
function getAllSellers() {
  return Object.values(readJson('sellers.json', {}));
}

/**
 * Tambah seller baru
 */
function addSeller({ userId, addedBy }) {
  const id = Number(userId);
  if (!Number.isFinite(id)) return { success: false, error: 'ID tidak valid.' };

  const all = readJson('sellers.json', {});
  if (all[String(id)]) {
    return { success: false, error: `User <code>${id}</code> sudah menjadi seller.` };
  }

  all[String(id)] = {
    userId: id,
    profitPerToken: 0,      // profit seller dari penjualan ke USER langsung
    priceToReseller: 0,     // harga TOTAL yang seller tetapkan ke reseller-nya
    balance: 0,
    totalEarned: 0,
    // Wallet tersimpan agar tidak perlu diisi ulang saat penarikan
    wallet: null,
    account: null,
    addedAt: new Date().toISOString(),
    addedBy: Number(addedBy) || null,
  };

  writeJson('sellers.json', all);
  return { success: true, data: all[String(id)] };
}

/**
 * Hapus seller
 */
function removeSeller(userId) {
  const all = readJson('sellers.json', {});
  const key = String(userId);
  if (!all[key]) return false;
  delete all[key];
  writeJson('sellers.json', all);
  return true;
}

/**
 * Set profit per token untuk seller.
 * Tanpa batas atas, minimum 0 (tidak boleh minus).
 *
 * @param {number|string} userId
 * @param {number} nominal
 * @returns {{success: boolean, error?: string, data?: object}}
 */
function setProfitPerToken(userId, nominal) {
  const all = readJson('sellers.json', {});
  const key = String(userId);
  const seller = all[key];

  if (!seller) return { success: false, error: `User <code>${key}</code> bukan seller.` };

  const n = Math.floor(Number(nominal));
  if (!Number.isFinite(n) || n < 0) {
    return { success: false, error: 'Nominal harus berupa angka ≥ 0.' };
  }

  seller.profitPerToken = n;
  all[key] = seller;
  writeJson('sellers.json', all);
  return { success: true, data: seller };
}

/**
 * Tambah saldo seller (rupiah)
 * @returns {number|null} saldo baru
 */
function addBalance(userId, amount) {
  const all = readJson('sellers.json', {});
  const key = String(userId);
  const seller = all[key];
  if (!seller) return null;

  const n = Math.floor(Number(amount)) || 0;
  seller.balance = (seller.balance || 0) + n;
  seller.totalEarned = (seller.totalEarned || 0) + n;
  all[key] = seller;
  writeJson('sellers.json', all);
  return seller.balance;
}

/**
 * Kurangi saldo seller
 */
function deductBalance(userId, amount) {
  const all = readJson('sellers.json', {});
  const key = String(userId);
  const seller = all[key];
  if (!seller) return { success: false, error: 'Bukan seller.' };

  const n = Math.floor(Number(amount)) || 0;
  if (n <= 0) return { success: false, error: 'Nominal tidak valid.' };
  if ((seller.balance || 0) < n) return { success: false, error: 'Saldo tidak mencukupi.' };

  seller.balance -= n;
  all[key] = seller;
  writeJson('sellers.json', all);
  return { success: true, balance: seller.balance };
}

// ─── Referral ────────────────────────────────────────────────

/**
 * Simpan referral user ke seller.
 * Satu user hanya satu seller, permanen.
 *
 * @returns {boolean} true bila tersimpan
 */
function setReferral(userId, sellerId) {
  const all = readJson('sellerrefs.json', {});
  const key = String(userId);
  if (all[key]) return false;

  all[key] = { sellerId: Number(sellerId), at: new Date().toISOString() };
  writeJson('sellerrefs.json', all);
  return true;
}

/**
 * Ambil seller yang mereferensikan user
 * @returns {number|null}
 */
function getReferrer(userId) {
  const all = readJson('sellerrefs.json', {});
  const rec = all[String(userId)];
  return rec ? Number(rec.sellerId) : null;
}

/**
 * Apakah user sudah punya seller
 */
function hasReferral(userId) {
  return Boolean(readJson('sellerrefs.json', {})[String(userId)]);
}

/**
 * Profit seller untuk user tertentu (0 bila tidak ada seller).
 * Dipakai untuk menghitung harga & komisi.
 *
 * @param {number|string} userId
 * @returns {number}
 */
function getProfitForUser(userId) {
  const sellerId = getReferrer(userId);
  if (!sellerId) return 0;
  const seller = getSeller(sellerId);
  if (!seller) return 0;
  return Math.max(0, Math.floor(Number(seller.profitPerToken) || 0));
}

// ─── Withdrawal ──────────────────────────────────────────────

function readWithdrawals() {
  return readJson('sellerwds.json', {});
}

/**
 * Buat pengajuan penarikan
 */
function createWithdrawal({ sellerId, wallet, account, amount }) {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n < MIN_WITHDRAW) {
    return {
      success: false,
      error: `Minimum penarikan <b>Rp${MIN_WITHDRAW.toLocaleString('id-ID')}</b>.`,
    };
  }

  const seller = getSeller(sellerId);
  if (!seller) return { success: false, error: 'Bukan seller.' };
  if ((seller.balance || 0) < n) return { success: false, error: 'Saldo tidak mencukupi.' };

  const deducted = deductBalance(sellerId, n);
  if (!deducted.success) return { success: false, error: deducted.error };

  const list = readWithdrawals();
  const id = `SWD-${Date.now()}`;

  list[id] = {
    id,
    sellerId: Number(sellerId),
    wallet,
    account: String(account),
    amount: n,
    status: 'menunggu',
    createdAt: new Date().toISOString(),
    doneAt: null,
    doneBy: null,
  };

  writeJson('sellerwds.json', list);
  return { success: true, data: list[id], balance: deducted.balance };
}

function getWithdrawal(wdId) {
  return readWithdrawals()[wdId] || null;
}

/**
 * Cari penarikan dari pesan notifikasi di chat admin
 */
function findByAdminMessage(chatId, messageId) {
  const list = Object.values(readWithdrawals());
  return (
    list.find(
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
  writeJson('sellerwds.json', list);
  return wd;
}

function attachAdminMessage(wdId, msg) {
  const list = readWithdrawals();
  const wd = list[wdId];
  if (!wd) return;

  wd.adminChatId = Number(msg.chatId);
  wd.adminMessageId = Number(msg.messageId);

  list[wdId] = wd;
  writeJson('sellerwds.json', list);
}


/**
 * Simpan wallet seller (agar tidak perlu diisi ulang saat penarikan)
 *
 * @param {number|string} userId
 * @param {string} wallet - nama wallet baku
 * @param {string} account - nomor HP / nomor rekening
 * @returns {{success: boolean, error?: string, data?: object}}
 */
function setWallet(userId, wallet, account) {
  const all = readJson('sellers.json', {});
  const key = String(userId);
  const seller = all[key];

  if (!seller) return { success: false, error: 'Bukan seller.' };

  const w = normalizeWallet(wallet);
  if (!w) return { success: false, error: 'Jenis wallet tidak dikenal.' };

  const acc = String(account || '').trim();
  if (!acc) return { success: false, error: 'Nomor wallet tidak boleh kosong.' };

  seller.wallet = w;
  seller.account = acc;
  all[key] = seller;
  writeJson('sellers.json', all);

  return { success: true, data: seller };
}

/**
 * Ambil wallet seller
 * @param {number|string} userId
 * @returns {{wallet: string, account: string}|null}
 */
function getWallet(userId) {
  const seller = getSeller(userId);
  if (!seller || !seller.wallet || !seller.account) return null;
  return { wallet: seller.wallet, account: seller.account };
}


/**
 * Set harga TOTAL yang seller tetapkan ke reseller-nya.
 * Tidak boleh di bawah harga dasar dari owner.
 *
 * @param {number|string} userId
 * @param {number} nominal - harga total per token untuk reseller
 * @param {number} minPrice - harga dasar (modal + profit owner)
 * @returns {{success: boolean, error?: string, data?: object}}
 */
function setPriceToReseller(userId, nominal, minPrice) {
  const all = readJson('sellers.json', {});
  const key = String(userId);
  const seller = all[key];

  if (!seller) return { success: false, error: `User <code>${key}</code> bukan seller.` };

  const n = Math.floor(Number(nominal));
  if (!Number.isFinite(n) || n < 0) {
    return { success: false, error: 'Nominal harus berupa angka ≥ 0.' };
  }

  const min = Math.max(0, Math.floor(Number(minPrice) || 0));
  if (n < min) {
    return {
      success: false,
      error: `Harga tidak boleh di bawah harga dasar (<b>Rp${min.toLocaleString('id-ID')}</b>).`,
    };
  }

  seller.priceToReseller = n;
  all[key] = seller;
  writeJson('sellers.json', all);
  return { success: true, data: seller };
}

/**
 * Ambil harga seller ke reseller.
 * Bila belum diset (0), pakai harga jual ke user biasa sebagai default.
 *
 * @param {number|string} userId
 * @param {number} hargaUserBiasa - harga jual seller ke user langsung
 * @returns {number}
 */
function getPriceToReseller(userId, hargaUserBiasa) {
  const seller = getSeller(userId);
  if (!seller) return Math.max(0, Math.floor(Number(hargaUserBiasa) || 0));

  const p = Math.floor(Number(seller.priceToReseller) || 0);
  if (p > 0) return p;

  // Default: sama dengan harga jual ke user biasa
  return Math.max(0, Math.floor(Number(hargaUserBiasa) || 0));
}


/**
 * Hitung bagian seller untuk seorang USER, sesuai konteksnya.
 *
 * PENTING: harga jual seller ke user langsung BERBEDA dengan harga
 * jual seller ke reseller. Maka bagian seller juga berbeda:
 *
 *   - User diundang seller langsung:
 *       bagian = profitPerToken (profit seller di atas harga dasar)
 *
 *   - User diundang reseller:
 *       bagian = hargaKeReseller - hargaDasarOwner
 *       (selisih antara harga yang seller tetapkan ke reseller
 *        dengan harga dasar dari owner)
 *
 * @param {number|string} userId - pembeli
 * @param {number} hargaDasarOwner - modal + profit owner
 * @param {number} [hargaUserSeller] - harga jual seller ke user langsung
 * @returns {number} bagian seller per token
 */
function getSellerShareForUser(userId, hargaDasarOwner, hargaUserSeller) {
  const sellerId = getReferrer(userId);
  if (!sellerId) return 0;

  const seller = getSeller(sellerId);
  if (!seller) return 0;

  const dasar = Math.max(0, Math.floor(Number(hargaDasarOwner) || 0));

  // Apakah user ini diundang lewat reseller?
  // Ditandai oleh pemanggil lewat hargaUserSeller yang diberikan.
  if (hargaUserSeller === undefined) {
    // Konteks: user langsung dari seller
    return Math.max(0, Math.floor(Number(seller.profitPerToken) || 0));
  }

  // Konteks: user dari reseller -> pakai selisih harga ke reseller
  const hargaKeReseller = getPriceToReseller(sellerId, hargaUserSeller);
  return Math.max(0, hargaKeReseller - dasar);
}

module.exports = {
  WALLETS,
  WALLET_LABELS,
  MIN_WITHDRAW,
  setDbPath,
  normalizeWallet,
  walletLabel,
  // Seller
  getSeller,
  isSeller,
  getAllSellers,
  addSeller,
  removeSeller,
  setProfitPerToken,
  setPriceToReseller,
  getPriceToReseller,
  setWallet,
  getWallet,
  addBalance,
  deductBalance,
  // Referral
  setReferral,
  getReferrer,
  hasReferral,
  getProfitForUser,
  getSellerShareForUser,
  // Withdrawal
  createWithdrawal,
  getWithdrawal,
  findByAdminMessage,
  markWithdrawalDone,
  attachAdminMessage,
  readWithdrawals,
};
