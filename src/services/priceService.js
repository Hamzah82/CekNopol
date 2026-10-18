/**
 * priceService.js — Harga token per layanan (db/prices.json)
 *
 * Setiap layanan punya harga dalam satuan TOKEN (bukan rupiah).
 * Default: 1 token untuk semua layanan.
 *
 * Struktur db/prices.json:
 * {
 *   "ceknopol": 1,
 *   "ceknama": 1,
 *   "nik2kk": 1,
 *   "ceknomor": 1
 * }
 */

const fs = require('fs');
const path = require('path');

/** Daftar layanan yang didukung */
const SERVICES = ['ceknopol', 'ceknama', 'nik2kk', 'ceknomor'];

/** Harga default (token) untuk semua layanan */
const DEFAULT_PRICE = 1;

/** Harga maksimum yang diizinkan (mencegah input tidak wajar) */
const MAX_PRICE = 1000;

let dbPath = './db';

/**
 * Set path folder database
 * @param {string} basePath - Path ke folder db
 */
function setDbPath(basePath) {
  dbPath = basePath;
}

function getPricesFile() {
  return path.join(dbPath, 'prices.json');
}

/**
 * Bangun objek harga default
 * @returns {Object<string, number>}
 */
function buildDefaultPrices() {
  const obj = {};
  for (const s of SERVICES) obj[s] = DEFAULT_PRICE;
  return obj;
}

/**
 * Validasi nama layanan
 * @param {string} service
 * @returns {boolean}
 */
function isValidService(service) {
  return SERVICES.includes(String(service).toLowerCase());
}

/**
 * Baca seluruh harga layanan
 * @returns {Object<string, number>}
 */
function readPrices() {
  const defaults = buildDefaultPrices();
  try {
    const filePath = getPricesFile();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaults, null, 2), 'utf-8');
      return defaults;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const result = {};
    for (const s of SERVICES) {
      const v = Number(data[s]);
      result[s] = Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_PRICE;
    }
    return result;
  } catch (err) {
    console.error('[priceService] Error membaca prices.json:', err.message);
    return defaults;
  }
}

/**
 * Tulis seluruh harga layanan
 * @param {Object<string, number>} prices
 */
function writePrices(prices) {
  try {
    fs.writeFileSync(getPricesFile(), JSON.stringify(prices, null, 2), 'utf-8');
  } catch (err) {
    console.error('[priceService] Error menulis prices.json:', err.message);
  }
}

/**
 * Ambil harga satu layanan
 * @param {string} service - Nama layanan tanpa slash, mis. 'ceknama'
 * @returns {number} Harga dalam token
 */
function getPrice(service) {
  const prices = readPrices();
  const key = String(service).toLowerCase();
  return prices[key] || DEFAULT_PRICE;
}

/**
 * Set harga satu layanan
 * @param {string} service - Nama layanan
 * @param {number} amount - Harga dalam token (> 0)
 * @returns {{success: boolean, price?: number, error?: string}}
 */
function setPrice(service, amount) {
  const key = String(service).toLowerCase();

  if (!isValidService(key)) {
    return { success: false, error: `Layanan "${service}" tidak dikenal.` };
  }

  const nominal = parseInt(amount, 10);
  if (!Number.isFinite(nominal) || nominal < 1) {
    return { success: false, error: 'Harga harus berupa angka minimal 1 token.' };
  }

  if (nominal > MAX_PRICE) {
    return { success: false, error: `Harga maksimal ${MAX_PRICE} token.` };
  }

  const prices = readPrices();
  prices[key] = nominal;
  writePrices(prices);

  return { success: true, price: nominal };
}

/**
 * Ambil semua harga (urut sesuai SERVICES)
 * @returns {Array<{service: string, price: number}>}
 */
function getAllPrices() {
  const prices = readPrices();
  return SERVICES.map((s) => ({ service: s, price: prices[s] }));
}

module.exports = {
  SERVICES,
  DEFAULT_PRICE,
  MAX_PRICE,
  setDbPath,
  isValidService,
  getPrice,
  setPrice,
  getAllPrices,
  readPrices,
};
