/**
 * refundService.js — Transfer token cache-hit dari user ke main admin & kirim notifikasi
 */

const tokenManager = require('./tokenManager');

let dbPath = './db';

/** @type {number[]} */
let setupAdminIds = [];

/** Index rotasi penerima token (agar adil jika admin lebih dari 1) */
let rotateIndex = 0;

function setDbPath(basePath) {
  dbPath = basePath;
}

/**
 * Inisialisasi main admin IDs dari setup.json
 * @param {number[]} ids
 */
function initSetupAdmins(ids) {
  setupAdminIds = ids || [];
}

/**
 * Dapatkan daftar main admin (dari setup.json)
 * @returns {number[]}
 */
function getMainAdmins() {
  return setupAdminIds;
}

/**
 * Pilih admin penerima berikutnya secara rotasi (round-robin).
 * Mengembalikan null jika tidak ada admin terdaftar.
 * @returns {number|null}
 */
function pickNextAdmin() {
  if (!setupAdminIds.length) return null;
  const admin = setupAdminIds[rotateIndex % setupAdminIds.length];
  rotateIndex = (rotateIndex + 1) % setupAdminIds.length;
  return admin;
}

/**
 * Transfer token dari user ke main admin (cache-hit):
 * user -amount, admin terpilih +amount. Total supply konsisten (tanpa inflasi).
 *
 * @param {object} params
 * @param {number} params.userId - ID user yang melakukan pencarian
 * @param {number} [params.amount] - Jumlah token sesuai harga layanan (default 1)
 * @param {string} params.command - Nama command ('/ceknopol' atau '/ceknama')
 * @param {string} params.query - Query yang dicari (plat / nama)
 * @returns {{transferred: boolean, recipientId: number|null, notification: string}}
 */
function transferCacheToken({ userId, amount, command, query }) {
  const tokenAmount = Number.isFinite(Number(amount)) && Number(amount) > 0 ? Math.floor(Number(amount)) : 1;

  // Potong token dari user sesuai harga layanan
  tokenManager.deductToken(userId, tokenAmount);

  // Pilih admin penerima (rotasi) lalu tambah token yang sama
  const recipientId = pickNextAdmin();
  if (recipientId !== null) {
    tokenManager.addToken(recipientId, tokenAmount);
  }

  const notification = [
    `🔁 <b>Pengalihan Token (Cache Hit)</b>`,
    ``,
    `👤 User: <code>${userId}</code>`,
    `📋 Command: <b>${command}</b>`,
    `🔍 Query: <b>${query}</b>`,
    ``,
    `💰 Data ditemukan di cache, <b>${tokenAmount}</b> token dialihkan dari user`,
    `ke saldo kamu (main admin).`,
  ].join('\n');

  return { transferred: true, recipientId, notification };
}

module.exports = { setDbPath, initSetupAdmins, getMainAdmins, transferCacheToken };