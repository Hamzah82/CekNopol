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

module.exports = {
  setDbPath,
  normalizeKey,
  // Plat
  getCachedPlat,
  saveToCachePlat,
  // Nama
  getCachedNama,
  saveToCacheNama,
};
