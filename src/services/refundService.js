/**
 * refundService.js — Transfer token cache-hit dari user ke main admin & kirim notifikasi
 */

const tokenManager = require('./tokenManager');

/** @type {number[]} */
let setupAdminIds = [];

/** Index rotasi penerima token (agar adil jika admin lebih dari 1) */
let rotateIndex = 0;

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
 * Transfer 1 token dari user ke main admin (cache-hit):
 * user -1, admin terpilih +1. Total supply konsisten (tidak ada inflasi).
 *
 * @param {object} params
 * @param {number} params.userId - ID user yang melakukan pencarian
 * @param {string} params.command - Nama command ('/ceknopol' atau '/ceknama')
 * @param {string} params.query - Query yang dicari (plat / nama)
 * @returns {{transferred: boolean, recipientId: number|null, notification: string}}
 */
function transferCacheToken({ userId, command, query }) {
  // Potong 1 token dari user
  tokenManager.deductToken(userId, 1);

  // Pilih admin penerima (rotasi) lalu tambah 1 token
  const recipientId = pickNextAdmin();
  if (recipientId !== null) {
    tokenManager.addToken(recipientId, 1);
  }

  const notification = [
    `🔁 <b>Pengalihan Token (Cache Hit)</b>`,
    ``,
    `👤 User: <code>${userId}</code>`,
    `📋 Command: <b>${command}</b>`,
    `🔍 Query: <b>${query}</b>`,
    ``,
    `💰 Data ditemukan di cache, 1 token dialihkan dari user`,
    `ke saldo kamu (main admin).`,
  ].join('\n');

  return { transferred: true, recipientId, notification };
}

module.exports = { initSetupAdmins, getMainAdmins, transferCacheToken };