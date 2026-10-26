/**
 * tokenManager.js — Kelola saldo token per user (db/tokens.json)
 */

const fs = require('fs');
const path = require('path');
const jsonStore = require('./jsonStore');

let dbPath = './db';

/**
 * Set path folder database
 * @param {string} basePath - Path ke folder db
 */
function setDbPath(basePath) {
  dbPath = basePath;
}

/**
 * Dapatkan path lengkap tokens.json
 */
function getTokensFilePath() {
  return path.join(dbPath, 'tokens.json');
}

/**
 * Baca seluruh data token
 * @returns {object} Map userId -> jumlah token
 */
function readTokens() {
  const filePath = getTokensFilePath();
  try {
    if (!fs.existsSync(filePath)) {
      jsonStore.tulisJsonSync(filePath, {});
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    // JANGAN menimpa tokens.json saat gagal baca — file ini berisi SALDO
    // seluruh user. Menimpanya berarti semua saldo hilang permanen.
    console.error('[tokenManager] Gagal membaca tokens.json:', err.message);
    console.error('[tokenManager] File TIDAK ditimpa demi keamanan saldo.');
    return {};
  }
}

/**
 * Tulis seluruh data token
 * @param {object} data - Map userId -> jumlah token
 */
function writeTokens(data) {
  try {
    // Tulis atomik: hindari file terpotong bila proses mati di tengah,
    // dan cegah dua penulisan bersamaan saling menimpa.
    jsonStore.tulisJsonSync(getTokensFilePath(), data);
  } catch (err) {
    console.error('[tokenManager] Error menulis tokens.json:', err.message);
  }
}

/**
 * Dapatkan saldo token user
 * @param {number|string} userId - Telegram User ID
 * @returns {number} Jumlah token (0 jika belum terdaftar)
 */
function getTokenBalance(userId) {
  const tokens = readTokens();
  const key = String(userId);
  return tokens[key] || 0;
}

/**
 * Kurangi token user sebesar amount
 * @param {number|string} userId - Telegram User ID
 * @param {number} amount - Jumlah yang dikurangi
 * @returns {boolean} true jika berhasil, false jika saldo tidak cukup
 */
function deductToken(userId, amount) {
  const tokens = readTokens();
  const key = String(userId);
  const current = tokens[key] || 0;

  if (current < amount) return false;

  tokens[key] = Math.max(0, current - amount);
  writeTokens(tokens);
  return true;
}

/**
 * Tambah token user
 * @param {number|string} userId - Telegram User ID
 * @param {number} amount - Jumlah yang ditambahkan
 * @returns {number} Saldo baru
 */
function addToken(userId, amount) {
  const tokens = readTokens();
  const key = String(userId);
  const current = tokens[key] || 0;
  tokens[key] = current + amount;
  writeTokens(tokens);
  return tokens[key];
}

/**
 * Set token user ke nilai tertentu
 * @param {number|string} userId - Telegram User ID
 * @param {number} amount - Nilai baru
 */
function setToken(userId, amount) {
  const tokens = readTokens();
  const key = String(userId);
  tokens[key] = Math.max(0, amount);
  writeTokens(tokens);
}


/**
 * Kurangi saldo token TANPA batas bawah (boleh minus).
 *
 * Dipakai saat admin utama mentransfer token ke pembeli: saldo admin
 * berkurang berapa pun, termasuk sampai minus, agar total supply
 * (user + admin) tetap seimbang.
 *
 * Beda dengan deductToken() yang menolak bila saldo tidak cukup dan
 * memaksa minimal 0.
 *
 * @param {number|string} userId - Telegram User ID
 * @param {number} amount - Jumlah token yang dikurangi (> 0)
 * @returns {number} Saldo baru (bisa negatif)
 */
function deductTokenAllowNegative(userId, amount) {
  const tokens = readTokens();
  const key = String(userId);
  const current = tokens[key] || 0;
  const n = Math.floor(Number(amount)) || 0;

  tokens[key] = current - n;
  writeTokens(tokens);
  return tokens[key];
}

/**
 * Dapatkan semua token user (untuk admin list)
 * @returns {Array<{userId: string, balance: number}>} Array user dengan token
 */
function getAllTokens() {
  const tokens = readTokens();
  return Object.entries(tokens).map(([userId, balance]) => ({
    userId,
    balance,
  }));
}

/**
 * Transfer token dari satu user ke user lain
 * @param {number|string} fromUserId - Pengirim
 * @param {number|string} toUserId - Penerima
 * @param {number} amount - Jumlah token (> 0)
 * @returns {{success: boolean, error?: string, fromBalance?: number, toBalance?: number}}
 */
function transferToken(fromUserId, toUserId, amount) {
  const tokens = readTokens();
  const fromKey = String(fromUserId);
  const toKey = String(toUserId);

  const fromBalance = tokens[fromKey] || 0;

  if (fromBalance < amount) {
    return { success: false, error: 'Saldo token tidak mencukupi.' };
  }

  tokens[fromKey] = fromBalance - amount;
  tokens[toKey] = (tokens[toKey] || 0) + amount;

  writeTokens(tokens);

  return {
    success: true,
    fromBalance: tokens[fromKey],
    toBalance: tokens[toKey],
  };
}

module.exports = {
  setDbPath,
  getTokenBalance,
  deductToken,
  deductTokenAllowNegative,
  addToken,
  setToken,
  readTokens,
  getAllTokens,
  transferToken,
};
