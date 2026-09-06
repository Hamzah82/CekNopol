/**
 * validator.js — Validasi format plat nomor kendaraan Indonesia
 */

// Regex: minimal 1 huruf + 1-4 angka + 0-3 huruf (opsional suffix)
// Contoh valid: B1234XYZ, D 1234 ABC, AB123, F1A
const PLAT_REGEX = /^[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3}$/;

/**
 * Validasi apakah string merupakan format plat nomor yang valid
 * @param {string} plat - Plat nomor mentah dari user
 * @returns {boolean}
 */
function isValidPlat(plat) {
  if (!plat || typeof plat !== 'string') return false;
  const normalized = normalizePlat(plat);
  return PLAT_REGEX.test(normalized);
}

/**
 * Normalisasi plat nomor: hapus spasi, uppercase
 * @param {string} plat - Plat nomor mentah
 * @returns {string} Plat yang sudah dinormalisasi
 */
function normalizePlat(plat) {
  return plat.replace(/\s+/g, '').toUpperCase();
}

module.exports = { isValidPlat, normalizePlat };
