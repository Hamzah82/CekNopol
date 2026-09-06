/**
 * tokenManager.js — Kelola saldo token per user (db/tokens.json)
 */

const fs = require('fs');
const path = require('path');

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
  try {
    const filePath = getTokensFilePath();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '{}', 'utf-8');
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[tokenManager] Error membaca tokens.json:', err.message);
    fs.writeFileSync(getTokensFilePath(), '{}', 'utf-8');
    return {};
  }
}

/**
 * Tulis seluruh data token
 * @param {object} data - Map userId -> jumlah token
 */
function writeTokens(data) {
  try {
    fs.writeFileSync(getTokensFilePath(), JSON.stringify(data, null, 2), 'utf-8');
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

module.exports = { setDbPath, getTokenBalance, deductToken, addToken, setToken, readTokens, getAllTokens };
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