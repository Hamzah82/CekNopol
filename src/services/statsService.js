/**
 * statsService.js — Pencatatan & ringkasan statistik penggunaan bot
 *
 * Data disimpan AGREGAT per hari di db/stats.json (bukan log mentah),
 * supaya file tetap kecil walau dipakai bertahun-tahun.
 *
 * Struktur:
 * {
 *   "days": {
 *     "2026-10-20": {
 *       "total": 120,               // total pencarian
 *       "sukses": 100,
 *       "gagal": 15,
 *       "cache": 5,
 *       "tokensUser": 340,          // token user terpakai
 *       "tokensProvider": 98,       // sisa token provider TERAKHIR hari itu
 *       "byService": { "ceknama": 50, "ceknopol": 40 },
 *       "byUser": { "123": 8, "456": 3 }
 *     }
 *   },
 *   "services": {},                 // total sepanjang waktu per layanan
 *   "lastTokensRemaining": 98,      // sisa token provider terakhir (global)
 *   "lastTokensAt": "ISO",
 *   "lastTokensService": "ceknama"
 * }
 */

const fs = require('fs');
const path = require('path');

/** Batas hari yang disimpan (sisanya dibuang) */
const MAX_DAYS = 120;

let dbPath = './db';

/**
 * Set path folder database
 * @param {string} basePath
 */
function setDbPath(basePath) {
  dbPath = basePath;
}

function getStatsFile() {
  return path.join(dbPath, 'stats.json');
}

/**
 * Kunci tanggal lokal (zona Asia/Jakarta) dalam format YYYY-MM-DD
 * @param {Date} [d]
 * @returns {string}
 */
function dateKey(d = new Date()) {
  // en-CA menghasilkan format YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
}

/**
 * Bangun struktur kosong
 * @returns {object}
 */
function emptyStats() {
  return {
    days: {},
    services: {},
    lastTokensRemaining: null,
    lastTokensAt: null,
    lastTokensService: null,
  };
}

/**
 * Baca seluruh statistik
 * @returns {object}
 */
function readStats() {
  try {
    const filePath = getStatsFile();
    if (!fs.existsSync(filePath)) {
      const empty = emptyStats();
      fs.writeFileSync(filePath, JSON.stringify(empty, null, 2), 'utf-8');
      return empty;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const base = emptyStats();
    return {
      days: data && typeof data.days === 'object' && data.days ? data.days : base.days,
      services: data && typeof data.services === 'object' && data.services ? data.services : base.services,
      lastTokensRemaining:
        data && data.lastTokensRemaining !== undefined ? data.lastTokensRemaining : null,
      lastTokensAt: data && data.lastTokensAt !== undefined ? data.lastTokensAt : null,
      lastTokensService: data && data.lastTokensService !== undefined ? data.lastTokensService : null,
    };
  } catch (err) {
    console.error('[statsService] Error membaca stats.json:', err.message);
    return emptyStats();
  }
}

/**
 * Tulis seluruh statistik
 * @param {object} stats
 */
function writeStats(stats) {
  try {
    fs.writeFileSync(getStatsFile(), JSON.stringify(stats, null, 2), 'utf-8');
  } catch (err) {
    console.error('[statsService] Error menulis stats.json:', err.message);
  }
}

/**
 * Buang hari terlama bila melebihi MAX_DAYS
 * @param {object} days
 * @returns {object}
 */
function trimDays(days) {
  const keys = Object.keys(days).sort(); // ascending (YYYY-MM-DD)
  if (keys.length <= MAX_DAYS) return days;

  const keep = keys.slice(keys.length - MAX_DAYS);
  const result = {};
  for (const k of keep) result[k] = days[k];
  return result;
}

/**
 * Buat struktur hari kosong
 * @returns {object}
 */
function emptyDay() {
  return {
    total: 0,
    sukses: 0,
    gagal: 0,
    cache: 0,
    tokensUser: 0,
    tokensProvider: null,
    byService: {},
    byUser: {},
  };
}

/**
 * Catat satu pencarian.
 *
 * @param {object} params
 * @param {number} params.userId
 * @param {string} params.service - nama layanan internal, mis. 'ceknama'
 * @param {number} params.cost - biaya token user
 * @param {'sukses'|'gagal'|'cache'} params.source
 * @param {number|null} [params.tokensRemaining] - sisa token provider (jika tembak API)
 * @returns {void}
 */
function recordSearch({ userId, service, cost, source, tokensRemaining }) {
  const stats = readStats();
  const key = dateKey();

  if (!stats.days[key]) stats.days[key] = emptyDay();
  const day = stats.days[key];

  day.total += 1;
  day.tokensUser += Number(cost) || 0;

  if (source === 'sukses') day.sukses += 1;
  else if (source === 'gagal') day.gagal += 1;
  else if (source === 'cache') day.cache += 1;

  const svc = String(service);
  day.byService[svc] = (day.byService[svc] || 0) + 1;

  const uid = String(userId);
  day.byUser[uid] = (day.byUser[uid] || 0) + 1;

  // total sepanjang waktu per layanan
  stats.services[svc] = (stats.services[svc] || 0) + 1;

  // simpan sisa token provider (hanya dari tembak API)
  if (source !== 'cache' && tokensRemaining !== null && tokensRemaining !== undefined) {
    const n = Number(tokensRemaining);
    if (Number.isFinite(n)) {
      day.tokensProvider = n;
      stats.lastTokensRemaining = n;
      stats.lastTokensAt = new Date().toISOString();
      stats.lastTokensService = svc;
    }
  }

  stats.days = trimDays(stats.days);
  writeStats(stats);
}

/**
 * Ambil objek hari tertentu (atau kosong)
 * @param {string} key - YYYY-MM-DD
 * @returns {object}
 */
function getDay(key) {
  const stats = readStats();
  return stats.days[key] || emptyDay();
}

/**
 * Gabungkan beberapa hari menjadi satu ringkasan
 * @param {string[]} keys
 * @returns {object}
 */
function sumDays(keys) {
  const stats = readStats();
  const acc = emptyDay();
  acc.tokensProvider = null;

  for (const k of keys) {
    const d = stats.days[k];
    if (!d) continue;
    acc.total += d.total || 0;
    acc.sukses += d.sukses || 0;
    acc.gagal += d.gagal || 0;
    acc.cache += d.cache || 0;
    acc.tokensUser += d.tokensUser || 0;
    if (d.tokensProvider !== null && d.tokensProvider !== undefined) {
      acc.tokensProvider = d.tokensProvider;
    }
    for (const [s, n] of Object.entries(d.byService || {})) {
      acc.byService[s] = (acc.byService[s] || 0) + n;
    }
    for (const [u, n] of Object.entries(d.byUser || {})) {
      acc.byUser[u] = (acc.byUser[u] || 0) + n;
    }
  }

  return acc;
}

/**
 * Kunci tanggal N hari terakhir (termasuk hari ini)
 * @param {number} n
 * @returns {string[]}
 */
function lastNDays(n) {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(dateKey(d));
  }
  return keys;
}

/**
 * Ringkasan lengkap untuk /stats
 * @returns {object}
 */
function getSummary() {
  const stats = readStats();
  const today = getDay(dateKey());
  const week = sumDays(lastNDays(7));
  const month = sumDays(lastNDays(30));
  const allTime = sumDays(Object.keys(stats.days));

  // Layanan terpopuler sepanjang waktu
  const topServices = Object.entries(stats.services)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([service, count]) => ({ service, count }));

  // User paling aktif bulan ini
  const topUsers = Object.entries(month.byUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([userId, count]) => ({ userId, count }));

  return {
    today,
    week,
    month,
    allTime,
    topServices,
    topUsers,
    lastTokensRemaining: stats.lastTokensRemaining,
    lastTokensAt: stats.lastTokensAt,
    lastTokensService: stats.lastTokensService,
    daysTracked: Object.keys(stats.days).length,
  };
}

module.exports = {
  setDbPath,
  dateKey,
  recordSearch,
  getDay,
  getSummary,
  readStats,
  MAX_DAYS,
};
