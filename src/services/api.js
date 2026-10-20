/**
 * api.js — Hit API eksternal untuk cek nopol
 */

const axios = require('axios');

let apiUrl = '';
let apiKey = '';

/**
 * Batas waktu request ke provider (ms).
 * Dibuat 60 detik: provider kadang lambat memproses query yang belum
 * pernah di-cache di sisi mereka. Timeout terlalu cepat membuat kuota
 * provider terpotong percuma karena request sebenarnya masih diproses.
 */
const REQUEST_TIMEOUT_MS = 60000;

/**
 * Ambil sisa token provider dari response API.
 * Field standar: tokens_remaining (sama untuk semua layanan).
 *
 * @param {object} body - Body response API
 * @returns {number|null} Sisa token, atau null bila tidak tersedia
 */
function extractTokensRemaining(body) {
  if (!body || typeof body !== 'object') return null;
  const val = body.tokens_remaining;
  if (val === undefined || val === null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

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
      timeout: REQUEST_TIMEOUT_MS,
    });

    const body = response.data;

    // Validasi response sesuai PRD
    if (!body || body.success !== true) {
      return {
        success: false,
        data: null,
        error: 'Data kendaraan tidak ditemukan.',
        tokensRemaining: extractTokensRemaining(body),
      };
    }

    if (!Array.isArray(body.data) || body.data.length === 0) {
      return {
        success: false,
        data: null,
        error: 'Data kendaraan tidak ditemukan.',
        tokensRemaining: extractTokensRemaining(body),
      };
    }

    // Ambil elemen pertama dari array data
    return {
      success: true,
      data: body.data[0],
      error: null,
      tokensRemaining: extractTokensRemaining(body),
    };
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return { success: false, data: null, error: 'Server terlalu lama merespons (timeout 60 detik). Data mungkin masih diproses provider — jangan ulangi terlalu cepat.' };
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
      timeout: REQUEST_TIMEOUT_MS,
    });

    const body = response.data;

    if (!body || body.success !== true) {
      return {
        success: false,
        data: null,
        total: 0,
        error: 'Data tidak ditemukan.',
        tokensRemaining: extractTokensRemaining(body),
      };
    }

    if (!Array.isArray(body.data) || body.data.length === 0) {
      return {
        success: false,
        data: null,
        total: 0,
        error: 'Data tidak ditemukan.',
        tokensRemaining: extractTokensRemaining(body),
      };
    }

    return {
      success: true,
      data: body.data,
      total: body.total || body.data.length,
      error: null,
      tokensRemaining: extractTokensRemaining(body),
    };
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return { success: false, data: null, total: 0, error: 'Server terlalu lama merespons (timeout 60 detik). Data mungkin masih diproses provider — jangan ulangi terlalu cepat.' };
    }
    if (err.response) {
      return { success: false, data: null, total: 0, error: `Server mengembalikan error (${err.response.status}).` };
    }
    return { success: false, data: null, total: 0, error: 'Gagal menghubungi server. Periksa koneksi internet.' };
  }
}

/**
 * Cek data NIK ke KK via API eksternal
 * @param {string} nik - NIK 16 digit
 * @returns {Promise<{success: boolean, data: object|null, error: string|null}>}
 */
async function cekNik2kk(nik) {
  try {
    const endpoint = `${apiUrl}/api/nik2kk`;
    const response = await axios.get(endpoint, {
      params: {
        nik: nik,
        key: apiKey,
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const body = response.data;

    if (!body || body.success !== true) {
      return {
        success: false,
        data: null,
        error: 'Data NIK tidak ditemukan.',
        tokensRemaining: extractTokensRemaining(body),
      };
    }

    if (!body.data) {
      return {
        success: false,
        data: null,
        error: 'Data NIK tidak ditemukan.',
        tokensRemaining: extractTokensRemaining(body),
      };
    }

    return {
      success: true,
      data: body.data,
      error: null,
      tokensRemaining: extractTokensRemaining(body),
    };
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return { success: false, data: null, error: 'Server terlalu lama merespons (timeout 60 detik). Data mungkin masih diproses provider — jangan ulangi terlalu cepat.' };
    }
    if (err.response) {
      return { success: false, data: null, error: `Server mengembalikan error (${err.response.status}).` };
    }
    return { success: false, data: null, error: 'Gagal menghubungi server. Periksa koneksi internet.' };
  }
}

module.exports = { initApi, cekNopol, cekNama, cekNik2kk };/**
 * Cek data nomor HP via API eksternal (GetContact)
 * @param {string} nomor - Nomor HP (format 08xx atau +628xx)
 * @returns {Promise<{success: boolean, data: object|null, error: string|null}>}
 */
async function cekNomor(nomor) {
  try {
    const endpoint = `${apiUrl}/api/getcontact`;
    const response = await axios.get(endpoint, {
      params: {
        nomor: nomor,
        key: apiKey,
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const body = response.data;

    if (!body || body.success !== true) {
      return {
        success: false,
        data: null,
        error: 'Data nomor HP tidak ditemukan.',
        tokensRemaining: extractTokensRemaining(body),
      };
    }

    if (!body.data) {
      return {
        success: false,
        data: null,
        error: 'Data nomor HP tidak ditemukan.',
        tokensRemaining: extractTokensRemaining(body),
      };
    }

    return {
      success: true,
      data: body.data,
      error: null,
      tokensRemaining: extractTokensRemaining(body),
    };
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return { success: false, data: null, error: 'Server terlalu lama merespons (timeout 60 detik). Data mungkin masih diproses provider — jangan ulangi terlalu cepat.' };
    }
    if (err.response) {
      return { success: false, data: null, error: `Server mengembalikan error (${err.response.status}).` };
    }
    return { success: false, data: null, error: 'Gagal menghubungi server. Periksa koneksi internet.' };
  }
}

module.exports = { initApi, cekNopol, cekNama, cekNik2kk, cekNomor };