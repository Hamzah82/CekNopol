/**
 * format.js — Format hasil data kendaraan untuk ditampilkan di Telegram
 */

/**
 * Format data kendaraan menjadi pesan Telegram yang rapi
 * @param {object} data - Data kendaraan dari API atau cache
 * @returns {string} Pesan terformat (HTML parse mode)
 */
function formatKendaraan(data) {
  const lines = [
    `<b>🚗 Data Kendaraan</b>`,
    ``,
    `<b>Plat:</b> ${data.plat || '-'}`,
    `<b>Merk:</b> ${data.merk || '-'}`,
    `<b>Tipe:</b> ${data.tipe || '-'}`,
    `<b>Tahun:</b> ${data.tahun || '-'}`,
    `<b>Warna:</b> ${data.warna || '-'}`,
    `<b>Warna TNKB:</b> ${data.warnaTnkb || '-'}`,
    `<b>CC:</b> ${data.cc || '-'}`,
    `<b>Jenis:</b> ${data.jenisKendaraan || '-'}`,
    `<b>BBM:</b> ${data.bbm || '-'}`,
    ``,
    `<b>👤 Pemilik</b>`,
    `<b>Nama:</b> ${data.nama || '-'}`,
    `<b>Alamat:</b> ${data.alamat || '-'}`,
    ``,
    `<b>🔧 Identifikasi</b>`,
    `<b>No. Rangka:</b> ${data.rangka || '-'}`,
    `<b>No. Mesin:</b> ${data.mesin || '-'}`,
    `<b>No. BPKB:</b> ${data.bpkb || '-'}`,
    ``,
    `<b>💰 Pajak</b>`,
    `<b>Status:</b> ${data.statusPajak || '-'}`,
    `<b>Tgl Exp:</b> ${data.tglPajakExp || '-'}`,
  ];

  if (data.cachedAt) {
    lines.push(``, `<i>📦 Data dari cache (${new Date(data.cachedAt).toLocaleString('id-ID')})</i>`);
  }

  return lines.join('\n');
}

/**
 * Format data nama (NIK lookup) menjadi pesan Telegram
 * @param {object} data - Data dari API cek_nama
 * @returns {string} Pesan terformat (HTML parse mode)
 */
function formatNama(data) {
  const lines = [
    `<b>👤 Data Kependudukan</b>`,
    ``,
    `<b>NIK:</b> ${data.nik || '-'}`,
    `<b>Nama:</b> ${data.nama || '-'}`,
    `<b>Tgl Lahir:</b> ${data.tanggal_lahir || '-'}`,
    `<b>Umur:</b> ${data.umur || '-'}`,
    `<b>Jenis Kelamin:</b> ${data.jenis_kelamin || '-'}`,
    `<b>Tempat Lahir:</b> ${data.tempat_lahir || '-'}`,
    `<b>Pekerjaan:</b> ${data.pekerjaan || '-'}`,
    ``,
    `<b>📍 Alamat</b>`,
    `<b>Alamat:</b> ${data.alamat || '-'}`,
    `<b>Kecamatan:</b> ${data.kecamatan || '-'}`,
    `<b>Kab/Kota:</b> ${data.kab_kota || '-'}`,
    `<b>Provinsi:</b> ${data.provinsi || '-'}`,
    ``,
    `<b>📋 Lainnya</b>`,
    `<b>No. KK:</b> ${data.noKK || '-'}`,
    `<b>RT:</b> ${data.rt || '-'} / <b>RW:</b> ${data.rw || '-'}`,
  ];

  return lines.join('\n');
}

/**
 * Format pesan error
 * @param {string} message - Pesan error
 * @returns {string}
 */
function formatError(message) {
  return `❌ <b>Error</b>\n\n${message}`;
}

/**
 * Format pesan sukses sederhana
 * @param {string} message - Pesan
 * @returns {string}
 */
function formatSuccess(message) {
  return `✅ ${message}`;
}

/**
 * Format data NIK->KK menjadi pesan Telegram
 * @param {object} data - Data dari API nik2kk
 * @returns {string} Pesan terformat (HTML parse mode)
 */
function formatNik2kk(data) {
  const lines = [
    `<b>🔍 Data NIK → KK</b>`,
    ``,
    `<b>NIK:</b> ${data.nik || '-'}`,
    `<b>No. KK:</b> ${data.nokk || '-'}`,
    `<b>Nama:</b> ${data.nama || '-'}`,
    `<b>Tempat Lahir:</b> ${data.tempat_lahir || '-'}`,
    `<b>Tanggal Lahir:</b> ${data.tanggal_lahir || '-'}`,
    `<b>Jenis Kelamin:</b> ${data.jenis_kelamin || '-'}`,
  ];

  return lines.join('\n');
}

module.exports = { formatKendaraan, formatNama, formatNik2kk, formatError, formatSuccess };/**
 * Format data nomor HP (GetContact) menjadi pesan Telegram
 * @param {object} data - Data dari API getcontact
 * @returns {string} Pesan terformat (HTML parse mode)
 */
function formatNomor(data) {
  const lines = [
    `<b>📱 Data Nomor HP</b>`,
    ``,
    `<b>Nomor:</b> ${data.nomor || '-'}`,
    `<b>Operator:</b> ${data.operator || '-'}`,
    `<b>Nama:</b> ${data.nama || '-'}`,
    `<b>Spam:</b> ${data.is_spam ? '⚠️ Ya' : '✅ Tidak'}`,
    `<b>Mencurigakan:</b> ${data.is_suspicious ? '⚠️ Ya' : '✅ Tidak'}`,
    `<b>Total Tags:</b> ${data.total_tags || 0}`,
  ];

  // Tampilkan tags jika ada
  if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
    lines.push(``, `<b>🏷️ Tags Populer:</b>`);
    data.tags.slice(0, 10).forEach((tag) => {
      lines.push(`• ${tag.tag} <i>(${tag.count}x)</i>`);
    });
  }

  if (data.tokens_remaining !== undefined) {
    lines.push(``, `<i>💰 Sisa token API: ${data.tokens_remaining}</i>`);
  }

  if (data.cachedAt) {
    lines.push(``, `<i>📦 Data dari cache (${new Date(data.cachedAt).toLocaleString('id-ID')})</i>`);
  }

  return lines.join('\n');
}


/**
 * Format satu blok data KK (kepala keluarga + anggota) menjadi teks Telegram.
 *
 * @param {object} kk - Objek data KK (no_kk, jumlah_anggota, kepala_keluarga, anggota)
 * @param {string} [header] - Judul blok (mis. 'Data KK Terbaru')
 * @returns {string} Pesan terformat HTML
 */
function formatSatuKK(kk, header) {
  const esc = (v) => String(v === undefined || v === null || v === '' ? '-' : v);

  const lines = [];

  if (header) {
    lines.push(header, '');
  }

  lines.push(`<b>No. KK:</b> ${esc(kk.no_kk)}`);

  const kk_anggota = Array.isArray(kk.anggota) ? kk.anggota : [];
  const jumlah = kk.jumlah_anggota !== undefined && kk.jumlah_anggota !== null
    ? kk.jumlah_anggota
    : kk_anggota.length + (kk.kepala_keluarga ? 1 : 0);
  lines.push(`<b>Jumlah anggota:</b> ${esc(jumlah)}`);

  // ─── Kepala Keluarga ───────────────────────────────────
  const kk2 = kk.kepala_keluarga;
  if (kk2 && typeof kk2 === 'object') {
    lines.push('', '<b>👤 KEPALA KELUARGA</b>');
    lines.push(`<b>Nama:</b> ${esc(kk2.NAMA_LENGKAP)}`);
    lines.push(`<b>NIK:</b> ${esc(kk2.NIK)}`);
    lines.push(`<b>JK:</b> ${esc(kk2.JENIS_KELAMIN)}`);
    lines.push(`<b>Tempat Lahir:</b> ${esc(kk2.TEMPAT_LAHIR)}`);
    lines.push(`<b>Tanggal Lahir:</b> ${esc(kk2.TANGGAL_LAHIR)}`);
    lines.push(`<b>Agama:</b> ${esc(kk2.AGAMA)}`);
    lines.push(`<b>Pekerjaan:</b> ${esc(kk2.PEKERJAAN)}`);
    lines.push(`<b>Status:</b> ${esc(kk2.STATUS_PERNIKAHAN)}`);

    const alamat = [kk2.KELURAHAN, kk2.KECAMATAN, kk2.KOTA, kk2.PROVINSI]
      .filter(Boolean)
      .join(', ');
    if (alamat) lines.push(`<b>Alamat:</b> ${esc(alamat)}`);
  }

  // ─── Anggota ───────────────────────────────────────────
  if (kk_anggota.length > 0) {
    lines.push('', `<b>👥 ANGGOTA (${kk_anggota.length})</b>`);

    const batas = 15;
    const tampil = kk_anggota.slice(0, batas);

    tampil.forEach((a, i) => {
      lines.push('');
      lines.push(`<b>${i + 1}. ${esc(a.NAMA_LENGKAP)}</b>`);
      lines.push(`NIK: ${esc(a.NIK)}`);
      lines.push(`JK: ${esc(a.JENIS_KELAMIN)} | Lahir: ${esc(a.TANGGAL_LAHIR)}`);
      lines.push(`Hubungan: ${esc(a.STATUS_HUBUNGAN_KELUARGA)}`);
      const alamatA = [a.KELURAHAN, a.KECAMATAN]
        .filter(Boolean)
        .join(', ');
      if (alamatA) lines.push(`Alamat: ${esc(alamatA)}`);
    });

    if (kk_anggota.length > batas) {
      lines.push('', `<i>...dan ${kk_anggota.length - batas} anggota lainnya</i>`);
    }
  }

  return lines.join('\n');
}

/**
 * Format hasil cek KK untuk ditampilkan ke user.
 *
 * Aturan:
 *   - Jika ada data KK terbaru -> hanya tampilkan data terbaru
 *   - Jika tidak ada         -> tampilkan data lama (maksimal 3 entri)
 *
 * @param {object} result - { kk_terbaru, kk_lama }
 * @param {object} [opts]
 * @param {string} [opts.cachedAt] - Waktu cache (untuk penanda)
 * @returns {string} Pesan terformat HTML
 */
function formatCekKK(result, opts = {}) {
  const terbaru = result && result.kk_terbaru;
  const lama = result && Array.isArray(result.kk_lama) ? result.kk_lama : [];

  const hasTerbaru = terbaru && typeof terbaru === 'object' && Object.keys(terbaru).length > 0;

  let out = '';

  if (hasTerbaru) {
    out = formatSatuKK(terbaru, '📋 <b>DATA KK TERBARU</b>');
  } else {
    const tampil = lama.slice(0, 3);
    const bagian = tampil.map((k, i) => {
      const judul = tampil.length > 1 ? `📋 <b>DATA KK LAMA #${i + 1}</b>` : '📋 <b>DATA KK LAMA</b>';
      return formatSatuKK(k, judul);
    });

    out =
      '⚠️ <b>Data KK terbaru tidak tersedia.</b>\n' +
      '<i>Menampilkan data lama.</i>\n\n' +
      bagian.join('\n\n' + '─'.repeat(21) + '\n\n');

    if (lama.length > tampil.length) {
      out += `\n\n<i>...dan ${lama.length - tampil.length} data lama lainnya tidak ditampilkan.</i>`;
    }
  }

  if (opts.cachedAt) {
    out += `\n\n<i>📦 Data dari cache (${new Date(opts.cachedAt).toLocaleString('id-ID')})</i>`;
  }

  return out;
}

module.exports = { formatKendaraan, formatNama, formatNik2kk, formatNomor, formatCekKK, formatError, formatSuccess };