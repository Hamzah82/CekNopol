/**
 * serviceToggle.js — Aktif/matikan layanan pencarian
 *
 * Saat layanan dimatikan:
 *   - User biasa: bot DIAM TOTAL (tidak ada balasan apa pun)
 *   - Admin: tetap bisa memakai (untuk keperluan testing)
 *   - Tidak ada pemotongan token, tidak ada log, tidak ada cooldown
 *   - Layanan yang mati disembunyikan dari pricelist
 *
 * File db/services.json:
 * {
 *   "ceknama": true,   // true = aktif
 *   "ceknopol": false  // false = mati
 * }
 */

const fs = require('fs');
const path = require('path');

/** Layanan yang bisa di-toggle (kunci internal huruf kecil) */
const SERVICES = ['ceknopol', 'ceknama', 'nik2kk', 'ceknomor', 'cekkk'];

/** Nama command tampilan */
const SERVICE_COMMANDS = {
  cekkk: 'cekKK',
};

let dbPath = './db';

function setDbPath(basePath) {
  dbPath = basePath;
}

function getFile() {
  return path.join(dbPath, 'services.json');
}

/**
 * Bangun objek default (semua aktif)
 * @returns {object}
 */
function buildDefault() {
  const obj = {};
  for (const s of SERVICES) obj[s] = true;
  return obj;
}

/**
 * Baca status semua layanan
 * @returns {object}
 */
function readStatus() {
  const def = buildDefault();
  try {
    const filePath = getFile();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(def, null, 2), 'utf-8');
      return def;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    const result = {};
    for (const s of SERVICES) {
      // Default aktif bila belum pernah diset
      result[s] = data[s] === undefined ? true : Boolean(data[s]);
    }
    return result;
  } catch (err) {
    console.error('[serviceToggle] Error membaca services.json:', err.message);
    return def;
  }
}

function writeStatus(data) {
  try {
    fs.writeFileSync(getFile(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[serviceToggle] Error menulis services.json:', err.message);
  }
}

/**
 * Cek apakah layanan aktif
 * @param {string} service - kunci internal, mis. 'ceknama'
 * @returns {boolean}
 */
function isEnabled(service) {
  const key = String(service).toLowerCase();
  if (!SERVICES.includes(key)) return true; // layanan tak dikenal -> jangan blokir
  return readStatus()[key] !== false;
}

/**
 * Aktif/matikan layanan
 * @param {string} service
 * @param {boolean} enabled
 * @returns {{success: boolean, error?: string, enabled?: boolean}}
 */
function setEnabled(service, enabled) {
  const key = String(service).toLowerCase();

  if (!SERVICES.includes(key)) {
    return { success: false, error: `Layanan "${service}" tidak dikenal.` };
  }

  const status = readStatus();
  status[key] = Boolean(enabled);
  writeStatus(status);

  return { success: true, enabled: Boolean(enabled) };
}

/**
 * Daftar semua layanan + statusnya
 * @returns {Array<{service: string, command: string, enabled: boolean}>}
 */
function getAll() {
  const status = readStatus();
  return SERVICES.map((s) => ({
    service: s,
    command: SERVICE_COMMANDS[s] || s,
    enabled: status[s] !== false,
  }));
}

/**
 * Daftar layanan yang AKTIF saja (untuk pricelist)
 * @returns {string[]}
 */
function getEnabledServices() {
  return SERVICES.filter((s) => readStatus()[s] !== false);
}

module.exports = {
  SERVICES,
  SERVICE_COMMANDS,
  setDbPath,
  isEnabled,
  setEnabled,
  getAll,
  getEnabledServices,
  readStatus,
};