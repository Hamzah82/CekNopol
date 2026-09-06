/**
 * api.js — Hit API eksternal untuk cek nopol
 */

const axios = require('axios');

let apiUrl = '';
let apiKey = '';

/**
 * Inisialisasi konfigurasi API
 * @param {string} url - Base URL API (tanpa trailing slash)
 * @param {string} key - API key
 */
function initApi(url, key) {
  apiUrl = url;
  apiKey = key;
}

/**
 * Cek data kendaraan berdasarkan plat nomor via API eksternal
 * @param {string} platNormalized - Plat yang sudah dinormalisasi (tanpa spasi, uppercase)
 * @returns {Promise<{success: boolean, data: object|null, error: string|null}>}
 */
async function cekNopol(platNormalized) {
  try {
    const endpoint = `${apiUrl}/api/nopol`;
    const response = await axios.get(endpoint, {
      params: {
        plat: platNormalized,
        key: apiKey,
      },
      timeout: 15000,
    });

    const body = response.data;

    // Validasi response sesuai PRD
    if (!body || body.success !== true) {
      return { success: false, data: null, error: 'Data kendaraan tidak ditemukan.' };
    }

    if (!Array.isArray(body.data) || body.data.length === 0) {
      return { success: false, data: null, error: 'Data kendaraan tidak ditemukan.' };
    }

    // Ambil elemen pertama dari array data
    return { success: true, data: body.data[0], error: null };
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return { success: false, data: null, error: 'Gagal menghubungi server (timeout). Coba lagi nanti.' };
    }
    if (err.response) {
      return { success: false, data: null, error: `Server mengembalikan error (${err.response.status}).` };
    }
    return { success: false, data: null, error: 'Gagal menghubungi server. Periksa koneksi internet.' };
  }
}

/**
 * Cek data orang berdasarkan nama via API eksternal
 * @param {string} nama - Nama yang dicari
 * @returns {Promise<{success: boolean, data: Array|null, total: number, error: string|null}>}
 */
async function cekNama(nama) {
  try {
    const endpoint = `${apiUrl}/api/cek_nama`;
    const response = await axios.get(endpoint, {
      params: {
        nama: nama,
        key: apiKey,
      },
      timeout: 15000,
    });

    const body = response.data;

    if (!body || body.success !== true) {
      return { success: false, data: null, total: 0, error: 'Data tidak ditemukan.' };
    }

    if (!Array.isArray(body.data) || body.data.length === 0) {
      return { success: false, data: null, total: 0, error: 'Data tidak ditemukan.' };
    }

    return { success: true, data: body.data, total: body.total || body.data.length, error: null };
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return { success: false, data: null, total: 0, error: 'Gagal menghubungi server (timeout). Coba lagi nanti.' };
    }
    if (err.response) {
      return { success: false, data: null, total: 0, error: `Server mengembalikan error (${err.response.status}).` };
    }
    return { success: false, data: null, total: 0, error: 'Gagal menghubungi server. Periksa koneksi internet.' };
  }
}

module.exports = { initApi, cekNopol, cekNama };
