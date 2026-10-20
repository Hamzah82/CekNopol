/**
 * logService.js — Log pencarian user ke grup Telegram
 *
 * Admin menambahkan bot ke grup, lalu main admin menjalankan /setlog
 * di grup tersebut. Grup itu menjadi SATU-SATUNYA tujuan log.
 *
 * Data tersimpan di db/loggroup.json:
 * {
 *   "chatId": -100123456789,   // ID grup log (null jika belum diset)
 *   "title": "Log Pencarian",  // judul grup saat diset
 *   "setBy": 123456789,        // user ID admin yang menyetel
 *   "setAt": "2026-01-01T00:00:00.000Z"
 * }
 */

const fs = require('fs');
const path = require('path');

let dbPath = './db';

/**
 * Set path folder database
 * @param {string} basePath - Path ke folder db
 */
function setDbPath(basePath) {
  dbPath = basePath;
}

function getLogGroupFile() {
  return path.join(dbPath, 'loggroup.json');
}

/**
 * Baca konfigurasi grup log
 * @returns {{chatId: number|null, title: string, setBy: number|null, setAt: string|null}}
 */
function readConfig() {
  const def = { chatId: null, title: '', setBy: null, setAt: null };
  try {
    const filePath = getLogGroupFile();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(def, null, 2), 'utf-8');
      return def;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return {
      chatId: data.chatId === null || data.chatId === undefined ? null : Number(data.chatId),
      title: typeof data.title === 'string' ? data.title : '',
      setBy: data.setBy === null || data.setBy === undefined ? null : Number(data.setBy),
      setAt: typeof data.setAt === 'string' ? data.setAt : null,
    };
  } catch (err) {
    console.error('[logService] Error membaca loggroup.json:', err.message);
    return def;
  }
}

/**
 * Tulis konfigurasi grup log
 * @param {object} config
 */
function writeConfig(config) {
  try {
    fs.writeFileSync(getLogGroupFile(), JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('[logService] Error menulis loggroup.json:', err.message);
  }
}

/**
 * Set grup log aktif (satu grup saja — menimpa yang lama)
 * @param {number} chatId - ID grup
 * @param {string} title - Judul grup
 * @param {number} setBy - User ID admin
 * @returns {object} Konfigurasi baru
 */
function setLogGroup(chatId, title, setBy) {
  const config = {
    chatId: Number(chatId),
    title: title || '',
    setBy: Number(setBy),
    setAt: new Date().toISOString(),
  };
  writeConfig(config);
  return config;
}

/**
 * Matikan grup log
 * @returns {object} Konfigurasi kosong
 */
function clearLogGroup() {
  const config = { chatId: null, title: '', setBy: null, setAt: null };
  writeConfig(config);
  return config;
}

/**
 * Ambil chat ID grup log aktif
 * @returns {number|null}
 */
function getLogChatId() {
  return readConfig().chatId;
}

/**
 * Ambil konfigurasi lengkap grup log
 * @returns {object}
 */
function getConfig() {
  return readConfig();
}

/**
 * Escape karakter HTML
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format angka rupiah
 * @param {number} n
 * @returns {string}
 */
function rupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

/**
 * Bentuk pesan log pencarian
 *
 * Hanya memuat metadata pencarian — TIDAK memuat hasil pencarian.
 *
 * @param {object} params
 * @param {number} params.userId - Telegram user ID pencari
 * @param {string} [params.username] - Username tanpa @ (boleh kosong)
 * @param {string} [params.fullName] - Nama tampilan user
 * @param {string} params.service - Jenis layanan, mis. 'Cek Nama'
 * @param {string} params.command - Command yang dipakai, mis. '/ceknama'
 * @param {string} params.query - Kata kunci / input yang dicari
 * @param {number} params.cost - Biaya dalam token
 * @param {'sukses'|'gagal'|'cache'} params.source - Sumber hasil
 * @returns {string} Pesan terformat HTML
 */
function formatLog({ userId, username, fullName, service, command, query, cost, source }) {
  const lines = [
    `📋 <b>LOG PENCARIAN</b>`,
    `─────────────────────`,
    ``,
    `<b>👤 User</b>`,
  ];

  if (username) {
    lines.push(`Username: @${escapeHtml(username)}`);
  } else {
    lines.push(`Username: <i>(tidak ada)</i>`);
  }

  lines.push(`ID: <code>${Number(userId)}</code>`);

  if (fullName) {
    lines.push(`Nama: ${escapeHtml(fullName)}`);
  }

  lines.push(``, `<b>🔍 Pencarian</b>`);
  lines.push(`Layanan: <b>${escapeHtml(service)}</b>`);
  lines.push(`Command: <code>${escapeHtml(command)}</code>`);
  lines.push(`Query: <code>${escapeHtml(query)}</code>`);

  lines.push(``, `<b>💰 Biaya</b>`);
  lines.push(`Token: <b>${Number(cost)}</b> token`);

  if (source === 'cache') {
    lines.push(`<i>Sumber: cache</i>`);
  } else if (source === 'gagal') {
    lines.push(`<i>Status: data tidak ditemukan / gagal</i>`);
  } else {
    lines.push(`<i>Sumber: API</i>`);
  }

  lines.push(``, `🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);

  return lines.join('\n');
}


/**
 * Kirim log pencarian ke grup log (jika aktif).
 * Gagal kirim TIDAK mengganggu alur pencarian user.
 *
 * @param {object} telegram - ctx.telegram
 * @param {object} params - Data log (lihat formatLog)
 * @returns {Promise<boolean>} true jika terkirim
 */
async function sendLog(telegram, params) {
  const chatId = getLogChatId();
  if (!chatId) return false;

  try {
    const text = formatLog(params);
    await telegram.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    return true;
  } catch (err) {
    console.error('[logService] Gagal kirim log ke grup:', err.message);
    return false;
  }
}

module.exports = {
  setDbPath,
  readConfig,
  setLogGroup,
  clearLogGroup,
  getLogChatId,
  getConfig,
  formatLog,
  sendLog,
};
