/**
 * cache.js — Baca/tulis cache (db/plat.json & db/nama.json)
 */

const fs = require('fs');
const path = require('path');

let dbPath = './db';

// ─── Helpers ─────────────────────────────────────────────────

function setDbPath(basePath) {
  dbPath = basePath;
}

function readJsonFile(filename) {
  try {
    const filePath = path.join(dbPath, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '{}', 'utf-8');
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[cache] Error membaca ${filename}:`, err.message);
    const filePath = path.join(dbPath, filename);
    fs.writeFileSync(filePath, '{}', 'utf-8');
    return {};
  }
}

function writeJsonFile(filename, data) {
  try {
    const filePath = path.join(dbPath, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[cache] Error menulis ${filename}:`, err.message);
  }
}

function normalizeKey(raw) {
  return raw.replace(/\s+/g, '').toUpperCase();
}

// ─── Cache Plat (db/plat.json) ───────────────────────────────

function getCachedPlat(platNormalized) {
  const cache = readJsonFile('plat.json');
  return cache[platNormalized] || null;
}

function saveToCachePlat(platNormalized, data) {
  const cache = readJsonFile('plat.json');
  cache[platNormalized] = {
    ...data,
    cachedAt: new Date().toISOString(),
  };
  writeJsonFile('plat.json', cache);
}

// ─── Cache Nama (db/nama.json) ───────────────────────────────

/**
 * Cek apakah nama ada di cache
 * @param {string} nama - Nama yang sudah dinormalisasi (tanpa spasi, uppercase)
 * @returns {object|null} Object { total, data[] } atau null
 */
function getCachedNama(namaNormalized) {
  const cache = readJsonFile('nama.json');
  return cache[namaNormalized] || null;
}

/**
 * Simpan hasil pencarian nama ke cache
 * @param {string} namaNormalized - Nama yang sudah dinormalisasi
 * @param {object} result - { total, data[] } dari API
 */
function saveToCacheNama(namaNormalized, result) {
  const cache = readJsonFile('nama.json');
  cache[namaNormalized] = {
    total: result.total,
    data: result.data,
    cachedAt: new Date().toISOString(),
  };
  writeJsonFile('nama.json', cache);
}

// ─── Cache Nik2kk (db/nik2kk.json) ───────────────────────────

/**
 * Cek apakah NIK ada di cache
 * @param {string} nikNormalized - NIK yang sudah dinormalisasi
 * @returns {object|null} Data NIK atau null
 */
function getCachedNik2kk(nikNormalized) {
  const cache = readJsonFile('nik2kk.json');
  return cache[nikNormalized] || null;
}

/**
 * Simpan hasil pencarian NIK ke cache
 * @param {string} nikNormalized - NIK yang sudah dinormalisasi
 * @param {object} data - Data dari API
 */
function saveToCacheNik2kk(nikNormalized, data) {
  const cache = readJsonFile('nik2kk.json');
  cache[nikNormalized] = {
    ...data,
    cachedAt: new Date().toISOString(),
  };
  writeJsonFile('nik2kk.json', cache);
}

module.exports = {
  setDbPath,
  normalizeKey,
  // Plat
  getCachedPlat,
  saveToCachePlat,
  // Nama
  getCachedNama,
  saveToCacheNama,
  // Nik2kk
  getCachedNik2kk,
  saveToCacheNik2kk,
};// ─── Cache Nomor HP (db/nomor.json) ──────────────────────────

/**
 * Cek apakah nomor HP ada di cache
 * @param {string} nomorNormalized - Nomor yang sudah dinormalisasi
 * @returns {object|null} Data nomor atau null
 */
function getCachedNomor(nomorNormalized) {
  const cache = readJsonFile('nomor.json');
  return cache[nomorNormalized] || null;
}

/**
 * Simpan hasil pencarian nomor HP ke cache
 * @param {string} nomorNormalized - Nomor yang sudah dinormalisasi
 * @param {object} data - Data dari API
 */
function saveToCacheNomor(nomorNormalized, data) {
  const cache = readJsonFile('nomor.json');
  cache[nomorNormalized] = {
    ...data,
    cachedAt: new Date().toISOString(),
  };
  writeJsonFile('nomor.json', cache);
}

module.exports = {
  setDbPath,
  normalizeKey,
  // Plat
  getCachedPlat,
  saveToCachePlat,
  // Nama
  getCachedNama,
  saveToCacheNama,
  // Nik2kk
  getCachedNik2kk,
  saveToCacheNik2kk,
  // Nomor
  getCachedNomor,
  saveToCacheNomor,
};