/**
 * cache.js — Baca/tulis cache data kendaraan (db/plat.json)
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
 * Dapatkan path lengkap plat.json
 */
function getPlatFilePath() {
  return path.join(dbPath, 'plat.json');
}

/**
 * Baca seluruh cache plat
 * @returns {object} Data cache
 */
function readCache() {
  try {
    const filePath = getPlatFilePath();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '{}', 'utf-8');
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[cache] Error membaca plat.json:', err.message);
    // Inisialisasi ulang jika corrupt
    fs.writeFileSync(getPlatFilePath(), '{}', 'utf-8');
    return {};
  }
}

/**
 * Tulis seluruh cache plat
 * @param {object} data - Data cache lengkap
 */
function writeCache(data) {
  try {
    fs.writeFileSync(getPlatFilePath(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[cache] Error menulis plat.json:', err.message);
  }
}

/**
 * Cek apakah plat ada di cache
 * @param {string} platNormalized - Plat yang sudah dinormalisasi
 * @returns {object|null} Data kendaraan atau null
 */
function getCachedPlat(platNormalized) {
  const cache = readCache();
  return cache[platNormalized] || null;
}

/**
 * Simpan data kendaraan ke cache
 * @param {string} platNormalized - Plat yang sudah dinormalisasi
 * @param {object} data - Data kendaraan dari API
 */
function saveToCache(platNormalized, data) {
  const cache = readCache();
  cache[platNormalized] = {
    ...data,
    cachedAt: new Date().toISOString(),
  };
  writeCache(cache);
}

module.exports = { setDbPath, readCache, getCachedPlat, saveToCache };
