/**
 * refundService.js — Kembalikan token cache-hit ke main admin & kirim notifikasi
 */

const tokenManager = require('./tokenManager');

/** @type {number[]} */
let setupAdminIds = [];

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
 * Refund token hasil cache: kembalikan 1 token ke SETIAP main admin,
 * lalu susun pesan notifikasi untuk dikirim ke masing-masing admin.
 *
 * @param {object} params
 * @param {number} params.userId - ID user yang melakukan pencarian
 * @param {string} params.command - Nama command ('/ceknopol' atau '/ceknama')
 * @param {string} params.query - Query yang dicari (plat / nama)
 * @returns {{refunded: boolean, notification: string}}
 */
function refundCacheToken({ userId, command, query }) {
  // Kembalikan 1 token ke setiap main admin
  for (const adminId of setupAdminIds) {
    tokenManager.addToken(adminId, 1);
  }

  const notification = [
    `🔁 <b>Pengembalian Token (Cache Hit)</b>`,
    ``,
    `👤 User: <code>${userId}</code>`,
    `📋 Command: <b>${command}</b>`,
    `🔍 Query: <b>${query}</b>`,
    ``,
    `💰 Karena data ditemukan di cache, 1 token tidak dimusnahkan`,
    `dan dikembalikan ke saldo kamu (main admin).`,
  ].join('\n');

  return { refunded: true, notification };
}

module.exports = { initSetupAdmins, getMainAdmins, refundCacheToken };