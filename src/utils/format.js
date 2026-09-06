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

module.exports = { formatKendaraan, formatNama, formatError, formatSuccess };
