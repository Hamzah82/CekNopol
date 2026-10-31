/**
 * kampusService.js — Cari data mahasiswa di PDDikti (native Node.js)
 *
 * Tidak lagi memakai skrip Python. Seluruh logika API PDDikti ditulis
 * langsung dengan axios, sehingga tidak butuh `python3` / `requests`
 * di server — cukup dependency npm yang sudah ada.
 *
 * API internal PDDikti (SPA React):
 *   - Pencarian : GET /api/pencarian/mhs/{nama|nim}
 *   - Detail    : GET /api/detail/mhs/{id}
 *   API menolak request tanpa header Referer/Origin domain PDDikti.
 *
 * ATURAN PENTING:
 *   Data hanya dianggap "ketemu" bila 100% identik dengan input.
 *
 * Pertahanan anti-403/WAF:
 *   - warm-up: buka halaman utama dulu agar cookie sesi terbentuk
 *   - pool User-Agent acak + header Sec-Fetch lengkap
 *   - retry + backoff eksponensial untuk 403/429/5xx/timeout
 *   - jitter antar permintaan detail
 */

const axios = require('axios');

const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';
const API_SEARCH = BASE_URL + '/api/pencarian/mhs/{q}';
const API_DETAIL = BASE_URL + '/api/detail/mhs/{id}';

const TIMEOUT_MS = 30 * 1000;
const MAX_RETRY = 4;
const BACKOFF_BASE = 1500; // ms

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Header browser-like, UA diacak tiap panggilan. */
function buatHeaders() {
  return {
    'User-Agent': pick(USER_AGENTS),
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: BASE_URL + '/',
    Origin: BASE_URL,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
}

/** Instance axios dengan cookie-jar sederhana (manual, tanpa tough-cookie). */
function buatSesi() {
  const jar = {};
  const client = axios.create({
    timeout: TIMEOUT_MS,
    headers: buatHeaders(),
    transitional: { silentJSONParsing: true },
  });
  // simpan Set-Cookie dari respons
  client.interceptors.response.use((res) => {
    const sc = res.headers['set-cookie'];
    if (sc) {
      for (const c of sc) {
        const [pair] = c.split(';');
        const idx = pair.indexOf('=');
        if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
      }
    }
    return res;
  });
  // kirimkan cookie yang tersimpan
  client.interceptors.request.use((cfg) => {
    const cookies = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookies) cfg.headers.Cookie = cookies;
    cfg.headers['User-Agent'] = pick(USER_AGENTS);
    return cfg;
  });
  return client;
}

/**
 * Normalisasi teks untuk perbandingan: huruf besar, tanpa aksen,
 * spasi tunggal, hanya huruf/angka/spasi.
 * @param {string} teks
 * @returns {string}
 */
function normalisasi(teks) {
  if (!teks) return '';
  return String(teks)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Apakah input berupa NIM (seluruhnya angka setelah spasi/titik/strip dibuang).
 * @param {string} query
 * @returns {boolean}
 */
function deteksiNim(query) {
  const bersih = String(query || '').replace(/[\s.\-]/g, '');
  return bersih.length > 0 && /^\d+$/.test(bersih);
}

/**
 * Bandingkan NIM: hanya angka yang dihitung.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function nimSama(a, b) {
  const x = String(a || '').replace(/[\s.\-]/g, '');
  const y = String(b || '').replace(/[\s.\-]/g, '');
  return x.length > 0 && x === y;
}

/**
 * Warm-up: buka halaman utama agar WAF memberikan cookie sesi.
 * Kegagalan diabaikan (bukan hal fatal).
 * @param {import('axios').AxiosInstance} client
 */
async function warmup(client) {
  try {
    await client.get(BASE_URL + '/', {
      headers: { ...buatHeaders(), Accept: 'text/html,application/xhtml+xml' },
      timeout: 15000,
    });
  } catch (_) {
    /* abaikan */
  }
}

/**
 * GET JSON dengan retry + backoff untuk 403/429/5xx/timeout.
 * @param {import('axios').AxiosInstance} client
 * @param {string} url
 * @returns {Promise<object>}
 */
async function getJson(client, url) {
  let lastErr = null;
  for (let percobaan = 1; percobaan <= MAX_RETRY; percobaan++) {
    try {
      const res = await client.get(url, { headers: buatHeaders() });
      const data = typeof res.data === 'string' ? safeParse(res.data) : res.data;
      if (data && typeof data === 'object') return data;
      throw new Error('Respons bukan JSON yang valid.');
    } catch (e) {
      const status = e.response && e.response.status;
      const isRetryable =
        status === 403 || status === 429 || (status >= 500 && status <= 599) ||
        e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' ||
        /network|socket|connection/i.test(e.message || '');

      if (status === 404) {
        const err = new Error('Endpoint tidak ditemukan (404).');
        err.userMessage = 'Data tidak ditemukan di PDDikti (404).';
        throw err;
      }

      lastErr = e;
      if (isRetryable && percobaan < MAX_RETRY) {
        await sleep(BACKOFF_BASE * percobaan + Math.random() * 500);
        continue;
      }
      break;
    }
  }

  const status = lastErr && lastErr.response && lastErr.response.status;
  let userMessage = 'Gagal mengambil data dari PDDikti.';
  if (status === 403 || status === 429) {
    userMessage = 'PDDikti sedang membatasi permintaan (403). Coba lagi sebentar.';
  } else if (lastErr && (lastErr.code === 'ECONNABORTED' || /timeout/i.test(lastErr.message || ''))) {
    userMessage = 'Koneksi ke PDDikti timeout. Coba lagi nanti.';
  } else if (/network|socket|getaddrinfo|ENOTFOUND/i.test((lastErr && lastErr.message) || '')) {
    userMessage = 'Tidak dapat terhubung ke PDDikti.';
  }
  const err = new Error(userMessage);
  err.userMessage = userMessage;
  throw err;
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

/**
 * Ambil daftar hasil pencarian (mentah) untuk nama/NIM.
 * @param {import('axios').AxiosInstance} client
 * @param {string} query
 * @returns {Promise<Array>}
 */
async function cariMentah(client, query) {
  const url = API_SEARCH.replace('{q}', encodeURIComponent(query));
  const data = await getJson(client, url);
  if (!data || data.status !== 'success') {
    const msg = (data && data.message) || 'Pencarian gagal.';
    const err = new Error(msg);
    err.userMessage = msg;
    throw err;
  }
  let hasil = data.data || [];
  if (!Array.isArray(hasil)) hasil = [hasil];
  return hasil;
}

/**
 * Ambil detail satu mahasiswa berdasarkan ID.
 * ID base64 mengandung '+', '/', '=' dan TIDAK boleh di-encode ulang.
 * @param {import('axios').AxiosInstance} client
 * @param {string} id
 * @returns {Promise<object>}
 */
async function ambilDetail(client, id) {
  const url = API_DETAIL.replace('{id}', id); // tempel mentah
  const data = await getJson(client, url);
  if (!data || data.status !== 'success') {
    const msg = (data && data.message) || 'Gagal mengambil detail.';
    const err = new Error(msg);
    err.userMessage = msg;
    throw err;
  }
  return data.data || {};
}

/**
 * Cari data mahasiswa. Hanya mengembalikan hasil yang 100% cocok.
 * Bila tidak ada yang cocok, `hasil` berisi array kosong — pemanggil
 * tidak boleh memotong token.
 *
 * @param {string} query - NIM atau nama lengkap
 * @returns {Promise<{ok: boolean, hasil: Array, error?: string}>}
 */
async function cariMahasiswa(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, hasil: [], error: 'Input kosong.' };

  const client = buatSesi();
  await warmup(client);

  let daftar;
  try {
    daftar = await cariMentah(client, q);
  } catch (e) {
    return { ok: false, hasil: [], error: e.userMessage || e.message };
  }

  if (!daftar.length) return { ok: true, hasil: [] };

  const pakaiNim = deteksiNim(q);
  const cocok = daftar.filter((d) =>
    pakaiNim ? nimSama(d.nim, q) : normalisasi(d.nama) === normalisasi(q)
  );

  if (!cocok.length) return { ok: true, hasil: [] };

  // Ambil detail untuk setiap kandidat yang cocok (dengan jitter)
  const detailList = [];
  for (let i = 0; i < cocok.length; i++) {
    const item = cocok[i];
    if (!item.id) continue;
    if (i > 0) await sleep(400 + Math.random() * 500);
    try {
      const d = await ambilDetail(client, item.id);
      detailList.push(d);
    } catch (e) {
      // Jika hanya 1 kandidat dan detail gagal, kembalikan data pencarian saja
      console.error('[kampusService] detail gagal:', (e.userMessage || e.message || '').slice(0, 200));
      detailList.push(item);
    }
  }

  return { ok: true, hasil: detailList };
}

module.exports = {
  TIMEOUT_MS,
  normalisasi,
  deteksiNim,
  nimSama,
  cariMahasiswa,
};
