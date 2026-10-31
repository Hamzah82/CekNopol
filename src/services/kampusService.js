/**
 * kampusService.js — Cari data mahasiswa di PDDikti (native Node.js)
 *
 * Tidak butuh Python. Seluruh logika API PDDikti ditulis langsung.
 *
 * API internal PDDikti (SPA React):
 *   - Pencarian : GET /api/pencarian/mhs/{nama|nim}
 *   - Detail    : GET /api/detail/mhs/{id}
 *   API menolak request tanpa header Referer/Origin domain PDDikti.
 *
 * Pertahanan anti-403/WAF (berlapis):
 *   1. Warm-up: buka halaman utama dulu agar cookie sesi terbentuk
 *   2. Pool User-Agent acak + header Sec-Fetch/Sec-CH-UA lengkap
 *   3. Retry + backoff eksponensial untuk 403/429/5xx/timeout
 *   4. Jitter antar permintaan detail
 *   5. Fallback ke curl (TLS fingerprint berbeda) jika axios tetap 403
 *   6. Fallback ke beberapa base URL PDDikti (mirror)
 *   7. Dukungan proxy via env HTTP_PROXY/HTTPS_PROXY
 */

const axios = require('axios');
const { execFileSync } = require('child_process');

const PROXY_LIST = [
  // proxy publik — fallback terakhir jika IP server Pterodactyl diblokir PDDikti
  (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
];

const BASE_URLS = [
  'https://pddikti.kemdiktisaintek.go.id',
  'https://pddikti.kemdikbud.go.id',
];
const API_SEARCH_TPL = '{base}/api/pencarian/mhs/{q}';
const API_DETAIL_TPL = '{base}/api/detail/mhs/{id}';

const TIMEOUT_MS = 30 * 1000;
const MAX_RETRY = 5;
const BACKOFF_BASE = 1500;

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

function buatHeaders(base) {
  return {
    'User-Agent': pick(USER_AGENTS),
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: base + '/',
    Origin: base,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-CH-UA': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"',
  };
}

/** Parse Set-Cookie (bisa string atau array) jadi map. */
function parseCookies(headers) {
  const jar = {};
  let sc = headers['set-cookie'] || headers['Set-Cookie'];
  if (!sc) return jar;
  const list = Array.isArray(sc) ? sc : [sc];
  for (const c of list) {
    if (typeof c !== 'string') continue;
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return jar;
}

function cookieString(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

/** Buat axios instance dengan proxy (jika env set). */
function buatClient(base) {
  const cfg = {
    timeout: TIMEOUT_MS,
    headers: buatHeaders(base),
    transitional: { silentJSONParsing: true },
  };

  // Dukungan proxy via env
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxyUrl) {
    try {
      const u = new URL(proxyUrl);
      cfg.proxy = {
        protocol: u.protocol.replace(':', ''),
        host: u.hostname,
        port: parseInt(u.port) || (u.protocol === 'https:' ? 443 : 80),
      };
      if (u.username) cfg.proxy.auth = { username: u.username, password: u.password };
    } catch (_) { /* abaikan proxy invalid */ }
  }

  return axios.create(cfg);
}

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

function deteksiNim(query) {
  const bersih = String(query || '').replace(/[\s.\-]/g, '');
  return bersih.length > 0 && /^\d+$/.test(bersih);
}

function nimSama(a, b) {
  const x = String(a || '').replace(/[\s.\-]/g, '');
  const y = String(b || '').replace(/[\s.\-]/g, '');
  return x.length > 0 && x === y;
}

async function warmup(client, base) {
  try {
    const r = await client.get(base + '/', {
      headers: { ...buatHeaders(base), Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      timeout: 15000,
    });
    return parseCookies(r.headers || {});
  } catch (_) {
    return {};
  }
}

async function fetchViaProxy(url) {
  for (const makeProxy of PROXY_LIST) {
    const proxyUrl = makeProxy(url);
    try {
      const r = await axios.get(proxyUrl, {
        timeout: TIMEOUT_MS,
        headers: { 'User-Agent': pick(USER_AGENTS), Accept: 'application/json, text/plain, */*' },
        transitional: { silentJSONParsing: true },
      });
      let data = r.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { data = null; } }
      if (data && typeof data === 'object' && data.status === 'success') {
        console.log('[kampusService] proxy OK via', proxyUrl.slice(0, 40));
        return data;
      }
    } catch (e) {
      console.log('[kampusService] proxy gagal:', proxyUrl.slice(0, 40), '->', (e.response ? e.response.status : e.message));
    }
  }
  return null;
}

async function getJson(client, base, url, cookies) {
  let lastErr = null;
  for (let percobaan = 1; percobaan <= MAX_RETRY; percobaan++) {
    try {
      const headers = { ...buatHeaders(base) };
      if (cookies && Object.keys(cookies).length) {
        headers.Cookie = cookieString(cookies);
      }
      const res = await client.get(url, { headers });
      let data = res.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) { data = null; }
      }
      // simpan cookie baru
      const newCookies = parseCookies(res.headers || {});
      Object.assign(cookies, newCookies);
      if (data && typeof data === 'object') return { data, cookies };
      throw new Error('Respons bukan JSON yang valid.');
    } catch (e) {
      const status = e.response && e.response.status;
      const isRetryable =
        status === 403 || status === 429 || (status >= 500 && status <= 599) ||
        e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' ||
        /network|socket|connection|getaddrinfo|ENOTFOUND/i.test(e.message || '');

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

  // Fallback 1: curl (TLS fingerprint berbeda)
  try {
    const result = execFileSync('curl', [
      '-s', '-L', '--compressed', '--max-time', String(Math.floor(TIMEOUT_MS / 1000)),
      url,
      '-H', 'Accept: application/json, text/plain, */*',
      '-H', 'Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      '-H', 'Referer: ' + base + '/',
      '-H', 'Origin: ' + base,
      '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      '-H', 'Sec-Fetch-Dest: empty',
      '-H', 'Sec-Fetch-Mode: cors',
      '-H', 'Sec-Fetch-Site: same-origin',
    ], { encoding: 'utf8', timeout: TIMEOUT_MS + 5000 });

    if (result && result.trim()) {
      const data = JSON.parse(result);
      if (data && typeof data === 'object') return { data, cookies };
    }
  } catch (_) { /* curl tidak tersedia atau gagal — abaikan */ }

  const status = lastErr && lastErr.response && lastErr.response.status;
  let userMessage = 'Gagal mengambil data dari PDDikti.';
  if (status === 403 || status === 429) {
    userMessage = 'PDDikti sedang membatasi permintaan (403). Coba lagi sebentar.';
  } else if (lastErr && (lastErr.code === 'ECONNABORTED' || /timeout/i.test(lastErr.message || ''))) {
    userMessage = 'Koneksi ke PDDikti timeout. Coba lagi nanti.';
  } else if (/network|socket|getaddrinfo|ENOTFOUND/i.test((lastErr && lastErr.message) || '')) {
    userMessage = 'Tidak dapat terhubung ke PDDikti.';
  }
  // Fallback 2: proxy publik (kalau IP server diblokir total)
  try {
    const proxyData = await fetchViaProxy(url);
    if (proxyData) return { data: proxyData, cookies };
  } catch (_) { /* abaikan */ }

  const err = new Error(userMessage);
  err.userMessage = userMessage;
  throw err;
}

async function cariMentah(base, client, query, cookies) {
  const url = API_SEARCH_TPL.replace('{base}', base).replace('{q}', encodeURIComponent(query));
  const { data, cookies: newCookies } = await getJson(client, base, url, cookies);
  Object.assign(cookies, newCookies);
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

async function ambilDetail(base, client, id, cookies) {
  const url = API_DETAIL_TPL.replace('{base}', base).replace('{id}', id);
  const { data } = await getJson(client, base, url, cookies);
  if (!data || data.status !== 'success') {
    const msg = (data && data.message) || 'Gagal mengambil detail.';
    const err = new Error(msg);
    err.userMessage = msg;
    throw err;
  }
  return data.data || {};
}

async function cariMahasiswa(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, hasil: [], error: 'Input kosong.' };

  console.log('[kampusService] cariMahasiswa:', q);
  // Coba beberapa base URL (mirror) sampai salah satu berhasil
  let lastError = 'Gagal mengambil data dari PDDikti.';
  for (const base of BASE_URLS) {
    const client = buatClient(base);
    let cookies = await warmup(client, base);
    // jeda singkat setelah warm-up
    await sleep(300 + Math.random() * 400);

    let daftar;
    try {
      daftar = await cariMentah(base, client, q, cookies);
    } catch (e) {
      lastError = e.userMessage || e.message;
      console.error('[kampusService] mirror', base, 'gagal:', (e.userMessage || e.message || '').slice(0, 200));
      continue; // coba mirror berikutnya
    }

    if (!daftar.length) return { ok: true, hasil: [] };

    const pakaiNim = deteksiNim(q);
    const cocok = daftar.filter((d) =>
      pakaiNim ? nimSama(d.nim, q) : normalisasi(d.nama) === normalisasi(q)
    );

    if (!cocok.length) return { ok: true, hasil: [] };

    const detailList = [];
    for (let i = 0; i < cocok.length; i++) {
      const item = cocok[i];
      if (!item.id) continue;
      if (i > 0) await sleep(400 + Math.random() * 500);
      try {
        const d = await ambilDetail(base, client, item.id, cookies);
        detailList.push(d);
      } catch (e) {
        console.error('[kampusService] detail gagal:', (e.userMessage || e.message || '').slice(0, 200));
        detailList.push(item);
      }
    }

    return { ok: true, hasil: detailList };
  }

  return { ok: false, hasil: [], error: lastError };
}

module.exports = {
  TIMEOUT_MS,
  normalisasi,
  deteksiNim,
  nimSama,
  cariMahasiswa,
};
