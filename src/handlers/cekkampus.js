/**
 * cekkampus.js — Handler /cekKampus <NIM|Nama>
 *
 * Mencari data kuliah mahasiswa di PDDikti.
 *
 * ATURAN PENTING (sesuai permintaan):
 *   1. Data hanya ditampilkan bila 100% identik dengan input.
 *      Bila tidak ada yang persis sama -> JANGAN tampilkan apa pun
 *      dan JANGAN potong token.
 *   2. Bila data ketemu -> token DIALIHKAN ke MAIN ADMIN.
 *      Alasannya: layanan ini tidak memakai modal token provider,
 *      jadi tokennya tidak perlu hangus — cukup berpindah ke admin.
 *
 * Subcommand admin (main admin):
 *   /cekKampus setprice <n>
 */

const kampusService = require('../services/kampusService');
const tokenManager = require('../services/tokenManager');
const priceService = require('../services/priceService');
const refundService = require('../services/refundService');
const logService = require('../services/logService');
const cooldownService = require('../services/cooldownService');
const { sendLoading, clearLoading } = require('../utils/loading');
const { formatError } = require('../utils/format');

/** @type {number[]} */
let setupAdminIds = [];

/**
 * Inisialisasi admin IDs dari setup.json (main admin)
 * @param {number[]} ids
 */
function initSetupAdmins(ids) {
  setupAdminIds = ids || [];
}

/**
 * Cek apakah user adalah main admin
 * @param {number} userId
 * @returns {boolean}
 */
function isMainAdmin(userId) {
  return setupAdminIds.includes(Number(userId));
}

/**
 * Escape HTML
 * @param {*} v
 * @returns {string}
 */
function esc(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Nilai bersih: kosong -> '-'
 * @param {*} v
 * @returns {string}
 */
function val(v) {
  const t = v === undefined || v === null ? '' : String(v).trim();
  return t === '' || t === '-' ? '-' : esc(t);
}

/**
 * Format tanggal ke DD-MM-YYYY
 * @param {*} v
 * @returns {string}
 */
function tgl(v) {
  const t = v === undefined || v === null ? '' : String(v).trim();
  if (!t || t === '-') return '-';
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : esc(t);
}

/**
 * Format satu data mahasiswa
 * @param {object} d
 * @param {number} [no]
 * @param {number} [total]
 * @returns {string}
 */
function formatMahasiswa(d, no, total) {
  const L = [];

  if (total && total > 1) {
    L.push(`<b>${no}. ${esc(d.nama || '-')}</b>`);
  } else {
    L.push(`<b>${esc(d.nama || '-')}</b>`);
  }

  L.push(`<b>NIM:</b> ${val(d.nim)}`);
  L.push(`<b>Perguruan Tinggi:</b> ${val(d.nama_pt)}`);
  if (d.kode_pt) L.push(`<b>Kode PT:</b> ${val(d.kode_pt)}`);
  L.push(`<b>Program Studi:</b> ${val(d.prodi)}`);
  if (d.kode_prodi) L.push(`<b>Kode Prodi:</b> ${val(d.kode_prodi)}`);
  L.push(`<b>Jenjang:</b> ${val(d.jenjang)}`);

  const jk = String(d.jenis_kelamin || '').toUpperCase();
  const jkLabel = jk === 'L' ? 'Laki-laki' : jk === 'P' ? 'Perempuan' : jk || '-';
  L.push(`<b>Jenis Kelamin:</b> ${esc(jkLabel)}`);

  if (d.jenis_daftar) L.push(`<b>Jenis Daftar:</b> ${val(d.jenis_daftar)}`);
  L.push(`<b>Tanggal Masuk:</b> ${tgl(d.tanggal_masuk)}`);
  L.push(`<b>Status:</b> ${val(d.status_saat_ini)}`);

  return L.join('\n');
}

/**
 * Register handler /cekKampus
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.command('cekKampus', async (ctx) => {
    const userId = ctx.from.id;
    const arg = ctx.message.text.replace(/^\/cekKampus(@\w+)?\s*/i, '').trim();

    // ─── Setprice (main admin) ──────────────────────────────
    if (/^setprice(\s|$)/i.test(arg)) {
      if (!isMainAdmin(userId)) {
        ctx.reply(formatError('Hanya <b>main admin</b> yang bisa mengatur harga layanan.'), {
          parse_mode: 'HTML',
        });
        return;
      }

      const nominalRaw = arg.replace(/^setprice/i, '').trim();
      const current = priceService.getPrice('cekkampus');

      if (!nominalRaw) {
        ctx.reply(
          `⚙️ <b>Harga Cek Kampus</b>\n\n` +
            `Harga saat ini: <b>${current}</b> token\n\n` +
            `Gunakan: <code>/cekKampus setprice &lt;jumlah token&gt;</code>\n` +
            `Contoh: <code>/cekKampus setprice 2</code>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const hasil = priceService.setPrice('cekkampus', nominalRaw);
      if (!hasil.success) {
        ctx.reply(formatError(hasil.error), { parse_mode: 'HTML' });
        return;
      }

      ctx.reply(
        `✅ <b>Harga Cek Kampus diperbarui</b>\n\n` +
          `Harga lama: ${current} token\n` +
          `Harga baru: <b>${hasil.price}</b> token\n\n` +
          `<i>Token dialihkan ke admin, tidak hangus.</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── Validasi input ─────────────────────────────────────
    if (!arg) {
      ctx.reply(
        formatError(
          'Masukkan NIM atau nama lengkap.\n\n' +
            `Contoh:\n<code>/cekKampus 26081010214</code>\n` +
            `<code>/cekKampus AWANGKU MUHAMMAD HAMZAH</code>\n\n` +
            `<i>Nama harus lengkap agar data ditemukan.</i>`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (arg.length < 3) {
      ctx.reply(formatError('Input terlalu pendek. Minimal 3 karakter.'), { parse_mode: 'HTML' });
      return;
    }

    // ─── Layanan mati? ──────────────────────────────────────
    const serviceToggle = require('../services/serviceToggle');
    if (!serviceToggle.isEnabled('cekkampus') && !isMainAdmin(userId)) {
      return; // diam total
    }

    // ─── Anti-spam ──────────────────────────────────────────
    const cd = cooldownService.check(userId);
    if (cd.blocked) {
      ctx.reply(
        formatError(
          `Terlalu cepat.\n\nTunggu <b>${cd.remaining} detik</b> lagi sebelum memakai layanan berikutnya.`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── Cek saldo ──────────────────────────────────────────
    const price = priceService.getPrice('cekkampus');
    const balance = tokenManager.getTokenBalance(userId);
    if (balance < price) {
      ctx.reply(
        formatError(
          `Saldo token tidak mencukupi.\n\n` +
            `Harga layanan ini: <b>${price}</b> token\n` +
            `Saldo kamu: <b>${balance}</b> token\n\n` +
            `Top-up dengan <code>/buy &lt;jumlah&gt;</code>`
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    cooldownService.mark(userId);

    const loader = await sendLoading(ctx);

    // ─── Cari data ──────────────────────────────────────────
    const hasil = await kampusService.cariMahasiswa(arg);

    // Gagal teknis (jaringan/timeout) -> JANGAN potong token
    if (!hasil.ok) {
      await clearLoading(loader, ctx);

      logService
        .sendLog(ctx.telegram, {
          userId,
          username: ctx.from.username || '',
          fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
          service: 'Cek Kampus',
          serviceKey: 'cekkampus',
          command: '/cekKampus',
          query: String(arg),
          cost: price,
          source: 'gagal',
        })
        .catch(() => {});

      ctx.reply(formatError(hasil.error || 'Gagal mengambil data.'), { parse_mode: 'HTML' });
      return;
    }

    // Tidak ada yang 100% cocok -> JANGAN tampilkan, JANGAN potong token
    if (!hasil.hasil.length) {
      await clearLoading(loader, ctx);

      logService
        .sendLog(ctx.telegram, {
          userId,
          username: ctx.from.username || '',
          fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
          service: 'Cek Kampus',
          serviceKey: 'cekkampus',
          command: '/cekKampus',
          query: String(arg),
          cost: price,
          source: 'gagal',
        })
        .catch(() => {});

      ctx.reply(
        `🔍 <b>Data tidak ditemukan</b>\n\n` +
          `Tidak ada data yang <b>persis sama</b> dengan:\n` +
          `<code>${esc(arg)}</code>\n\n` +
          `Pastikan ${kampusService.deteksiNim(arg) ? 'NIM' : 'nama'} sudah benar dan lengkap ` +
          `sesuai KTP / KK.\n\n` +
          `<i>Token kamu tidak terpotong.</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ─── Data ketemu: potong token user, alihkan ke main admin ───
    await clearLoading(loader, ctx);

    const total = hasil.hasil.length;
    const bagian = hasil.hasil.map((d, i) => formatMahasiswa(d, i + 1, total));

    const teks =
      `🎓 <b>DATA MAHASISWA</b>\n` +
      `─────────────────────\n\n` +
      bagian.join('\n\n' + '─'.repeat(21) + '\n\n');

    for (const potong of splitMessage(teks)) {
      await ctx.reply(potong, { parse_mode: 'HTML' });
    }

    // Alihkan token ke main admin (bukan hangus)
    const alih = refundService.transferCacheToken({
      userId,
      amount: price,
      command: '/cekKampus',
      query: arg,
    });

    if (alih.recipientId !== null) {
      ctx.telegram
        .sendMessage(alih.recipientId, alih.notification, { parse_mode: 'HTML' })
        .catch(() => {});
    }

    logService
      .sendLog(ctx.telegram, {
        userId,
        username: ctx.from.username || '',
        fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        service: 'Cek Kampus',
        serviceKey: 'cekkampus',
        command: '/cekKampus',
        query: String(arg),
        cost: price,
        source: 'sukses',
      })
      .catch(() => {});
  });
}

/**
 * Pecah pesan panjang agar tidak melebihi batas Telegram.
 * @param {string} text
 * @param {number} [limit]
 * @returns {string[]}
 */
function splitMessage(text, limit = 3800) {
  if (text.length <= limit) return [text];

  const lines = text.split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if ((current + '\n' + line).length > limit) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);

  return chunks.length ? chunks : [text];
}

module.exports = { register, initSetupAdmins };
