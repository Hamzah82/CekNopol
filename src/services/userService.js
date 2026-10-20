/**
 * userService.js — Penanda user yang pernah berinteraksi dengan bot
 *
 * Tujuan: menentukan secara AKURAT apakah sebuah /start berasal dari
 * user baru atau user lama. Sebelumnya penentuan ini memakai saldo token,
 * yang keliru untuk user lama yang saldonya sudah habis (0).
 *
 * File db/users.json:
 * {
 *   "123456789": { "firstSeen": "2026-10-20T07:00:00.000Z" }
 * }
 *
 * Aturan: sekali tercatat, tidak pernah dihapus otomatis. Penghapusan
 * hanya lewat fungsi forget() bila memang diperlukan.
 */

const fs = require('fs');
const path = require('path');

let dbPath = './db';

/**
 * Set path folder database
 * @param {string} basePath
 */
function setDbPath(basePath) {
  dbPath = basePath;
}

function getUsersFile() {
  return path.join(dbPath, 'users.json');
}

/**
 * Baca seluruh data user
 * @returns {object}
 */
function readUsers() {
  try {
    const filePath = getUsersFile();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '{}', 'utf-8');
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    console.error('[userService] Error membaca users.json:', err.message);
    return {};
  }
}

/**
 * Tulis seluruh data user
 * @param {object} data
 */
function writeUsers(data) {
  try {
    fs.writeFileSync(getUsersFile(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[userService] Error menulis users.json:', err.message);
  }
}

/**
 * Cek apakah user pernah terlihat sebelumnya.
 * TIDAK mencatat apa pun.
 *
 * @param {number|string} userId
 * @returns {boolean}
 */
function isKnown(userId) {
  return Boolean(readUsers()[String(userId)]);
}

/**
 * Catat user bila belum pernah terlihat.
 *
 * @param {number|string} userId
 * @returns {boolean} true bila ini PERTAMA KALI (user baru), false bila sudah ada
 */
function markSeen(userId) {
  const all = readUsers();
  const key = String(userId);

  if (all[key]) return false; // sudah pernah

  all[key] = { firstSeen: new Date().toISOString() };
  writeUsers(all);
  return true;
}

/**
 * Cek sekaligus catat dalam satu langkah.
 * Mengembalikan true bila user BARU (sebelumnya belum tercatat).
 *
 * @param {number|string} userId
 * @returns {boolean}
 */
function checkAndMark(userId) {
  return markSeen(userId);
}

/**
 * Ambil data user
 * @param {number|string} userId
 * @returns {object|null}
 */
function getUser(userId) {
  return readUsers()[String(userId)] || null;
}

/**
 * Jumlah user yang pernah tercatat
 * @returns {number}
 */
function countUsers() {
  return Object.keys(readUsers()).length;
}

/**
 * Hapus catatan seorang user (untuk keperluan internal/debug)
 * @param {number|string} userId
 * @returns {boolean}
 */
function forget(userId) {
  const all = readUsers();
  const key = String(userId);
  if (!all[key]) return false;
  delete all[key];
  writeUsers(all);
  return true;
}

module.exports = {
  setDbPath,
  isKnown,
  markSeen,
  checkAndMark,
  getUser,
  countUsers,
  forget,
};
