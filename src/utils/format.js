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
 * Escape karakter HTML agar aman ditampilkan di Telegram.
 * Wajib dipakai untuk SEMUA nilai yang berasal dari provider.
 *
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
 * Ambil nilai field secara aman.
 *
 * Provider kadang memakai key dengan spasi di belakang (mis. "NIK_AYAH "),
 * jadi pencocokan dilakukan dengan trim + case-insensitive.
 *
 * @param {object} obj
 * @param {string[]} nama - kemungkinan nama field
 * @returns {*} nilai pertama yang ditemukan, atau undefined
 */
function ambil(obj, nama) {
  if (!obj || typeof obj !== 'object') return undefined;

  // 1. Cocok persis
  for (const n of nama) {
    if (obj[n] !== undefined && obj[n] !== null && obj[n] !== '') return obj[n];
  }

  // 2. Cocok setelah trim & lowercase (toleran spasi/huruf besar-kecil)
  const map = {};
  for (const k of Object.keys(obj)) {
    map[String(k).trim().toLowerCase()] = obj[k];
  }
  for (const n of nama) {
    const v = map[String(n).trim().toLowerCase()];
    if (v !== undefined && v !== null && v !== '') return v;
  }

  return undefined;
}

/**
 * Normalisasi jenis kelamin.
 * Data terbaru memakai "M"/"F", data lama memakai "LAKI-LAKI"/"PEREMPUAN".
 *
 * @param {*} v
 * @returns {string} 'L', 'P', atau '-'
 */
function normalJenisKelamin(v) {
  if (v === undefined || v === null || v === '') return '-';
  const t = String(v).trim().toUpperCase();
  if (['M', 'L', 'LAKI-LAKI', 'LAKI LAKI', 'PRIA'].includes(t)) return 'L';
  if (['F', 'P', 'PEREMPUAN', 'WANITA'].includes(t)) return 'P';
  return String(v);
}

/**
 * Format tanggal: ambil bagian YYYY-MM-DD saja (buang jam 00:00:00).
 * @param {*} v
 * @returns {string}
 */
function normalTanggal(v) {
  if (v === undefined || v === null || v === '') return '-';
  const t = String(v).trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`; // DD-MM-YYYY
  return t;
}

/**
 * NIK/NKK sebagai string. Provider kadang mengirim sebagai angka.
 * Konversi ke string agar presisi 16 digit terjaga.
 *
 * @param {*} v
 * @returns {string}
 */
function normalNomor(v) {
  if (v === undefined || v === null || v === '') return '-';
  return String(v).trim();
}

/**
 * Susun alamat dari beberapa bagian.
 * @param {Array<*>} bagian
 * @returns {string}
 */
function susunAlamat(bagian) {
  return bagian
    .map((x) => (x === undefined || x === null ? '' : String(x).trim()))
    .filter((x) => x !== '')
    .join(', ');
}

/**
 * Format blok anggota (format KK TERBARU).
 *
 * @param {object} a - objek anggota
 * @param {number} index - nomor urut
 * @returns {string[]}
 */
function barisAnggota(a, index) {
  const L = [];

  const nama = ambil(a, ['NAMA_LENGKAP', 'nama']);
  L.push(`<b>${index}. ${esc(nama || '-')}</b>`);
  L.push(`NIK: ${esc(normalNomor(ambil(a, ['NIK', 'nik'])))}`);

  const jk = normalJenisKelamin(ambil(a, ['JENIS_KELAMIN', 'jenis_kelamin']));
  const lahir = normalTanggal(ambil(a, ['TANGGAL_LAHIR', 'tanggal_lahir']));
  L.push(`JK: ${esc(jk)} | Lahir: ${esc(lahir)}`);

  const tmpLahir = ambil(a, ['TEMPAT_LAHIR', 'tempat_lahir']);
  if (tmpLahir) L.push(`Tempat Lahir: ${esc(tmpLahir)}`);

  const hubungan = ambil(a, ['STATUS_HUBUNGAN_KELUARGA', 'status_hubungan_keluarga']);
  if (hubungan) L.push(`Hubungan: ${esc(hubungan)}`);

  const agama = ambil(a, ['AGAMA', 'agama']);
  if (agama) L.push(`Agama: ${esc(agama)}`);

  const darah = ambil(a, ['GOL_DARAH', 'gol_darah']);
  if (darah && darah !== '-') L.push(`Gol. Darah: ${esc(darah)}`);

  const didik = ambil(a, ['PENDIDIKAN', 'pendidikan']);
  if (didik) L.push(`Pendidikan: ${esc(didik)}`);

  const kerja = ambil(a, ['PEKERJAAN', 'pekerjaan']);
  if (kerja) L.push(`Pekerjaan: ${esc(kerja)}`);

  const kawin = ambil(a, ['STATUS_PERNIKAHAN', 'status_pernikahan']);
  if (kawin) L.push(`Status Kawin: ${esc(kawin)}`);

  const alamat = susunAlamat([
    ambil(a, ['ALAMAT', 'alamat']),
    ambil(a, ['RT', 'rt']) ? `RT ${ambil(a, ['RT', 'rt'])}` : '',
    ambil(a, ['RW', 'rw']) ? `RW ${ambil(a, ['RW', 'rw'])}` : '',
    ambil(a, ['KELURAHAN', 'kelurahan']),
    ambil(a, ['KECAMATAN', 'kecamatan']),
    ambil(a, ['KOTA', 'kota']),
    ambil(a, ['PROVINSI', 'provinsi']),
  ]);
  if (alamat) L.push(`Alamat: ${esc(alamat)}`);

  const namaIbu = ambil(a, ['NAMA_LGKP_IBU', 'nama_ibu']);
  const namaAyah = ambil(a, ['NAMA_LGKP_AYAH', 'nama_ayah']);
  if (namaIbu || namaAyah) {
    L.push(`Orang Tua: ${esc(namaIbu || '-')} / ${esc(namaAyah || '-')}`);
  }

  return L;
}

/**
 * Format satu blok data KK TERBARU (kepala keluarga + anggota).
 *
 * @param {object} kk - { no_kk, jumlah_anggota, kepala_keluarga, anggota }
 * @param {string} [header]
 * @returns {string}
 */
function formatSatuKK(kk, header) {
  const L = [];

  if (header) L.push(header, '');

  L.push(`<b>No. KK:</b> ${esc(normalNomor(ambil(kk, ['no_kk', 'nkk'])))}`);

  const anggota = Array.isArray(kk.anggota) ? kk.anggota : [];
  const kepala = amabilObjek(kk.kepala_keluarga);

  const jumlah =
    ambil(kk, ['jumlah_anggota']) !== undefined
      ? ambil(kk, ['jumlah_anggota'])
      : anggota.length + (kepala ? 1 : 0);
  L.push(`<b>Jumlah anggota:</b> ${esc(jumlah)}`);

  // ─── Kepala Keluarga ───
  if (kepala) {
    L.push('', '<b>👤 KEPALA KELUARGA</b>');
    // barisAnggota() selalu memberi prefix nomor; untuk kepala keluarga
    // nomornya dibuang dan judulnya dirapikan
    L.push(
      ...barisAnggota(kepala, 0).map((x, idx) => {
        if (idx === 0) {
          const nama = ambil(kepala, ['NAMA_LENGKAP', 'nama']) || '-';
          return `<b>${esc(nama)}</b>`;
        }
        return x;
      })
    );
  } else {
    L.push('', '<i>Data kepala keluarga tidak tersedia.</i>');
  }

  // ─── Anggota ───
  if (anggota.length > 0) {
    L.push('', `<b>👥 ANGGOTA (${anggota.length})</b>`);

    const batas = 15;
    anggota.slice(0, batas).forEach((a, i) => {
      L.push('', ...barisAnggota(a, i + 1));
    });

    if (anggota.length > batas) {
      L.push('', `<i>...dan ${anggota.length - batas} anggota lainnya</i>`);
    }
  }

  return L.join('\n');
}

/**
 * Pastikan nilai adalah objek yang berisi (bukan null / array kosong).
 * @param {*} v
 * @returns {object|null}
 */
function amabilObjek(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return Object.keys(v).length > 0 ? v : null;
}

/**
 * Format satu entri data KK LAMA.
 *
 * Struktur data lama BERBEDA dari yang terbaru:
 *   nkk, nik, nama, tempat_lahir, tanggal_lahir, jenis_kelamin,
 *   kawin, alamat, provinsi, kota, tipe_kota, kecamatan, rt, rw, status
 *
 * Data lama berisi SATU ORANG per entri, bukan satu keluarga.
 *
 * @param {object} d - satu entri kk_lama
 * @param {string} [header]
 * @returns {string}
 */
function formatKkLama(d, header) {
  const L = [];

  if (header) L.push(header, '');

  L.push(`<b>Nama:</b> ${esc(ambil(d, ['nama', 'NAMA_LENGKAP']) || '-')}`);
  L.push(`<b>NIK:</b> ${esc(normalNomor(ambil(d, ['nik', 'NIK'])))}`);
  L.push(`<b>No. KK:</b> ${esc(normalNomor(ambil(d, ['nkk', 'no_kk'])))}`);

  const jk = normalJenisKelamin(ambil(d, ['jenis_kelamin', 'JENIS_KELAMIN']));
  const lahir = normalTanggal(ambil(d, ['tanggal_lahir', 'TANGGAL_LAHIR']));
  L.push(`<b>JK:</b> ${esc(jk)}`);
  L.push(`<b>Tanggal Lahir:</b> ${esc(lahir)}`);

  const tmp = ambil(d, ['tempat_lahir', 'TEMPAT_LAHIR']);
  if (tmp) L.push(`<b>Tempat Lahir:</b> ${esc(tmp)}`);

  // Status kawin pada data lama berupa kode angka
  const kawin = ambil(d, ['kawin', 'STATUS_PERNIKAHAN']);
  if (kawin !== undefined) {
    const labelKawin = { 1: 'BELUM KAWIN', 2: 'KAWIN', 3: 'CERAI HIDUP', 4: 'CERAI MATI' };
    L.push(`<b>Status Kawin:</b> ${esc(labelKawin[String(kawin)] || kawin)}`);
  }

  const alamat = susunAlamat([
    ambil(d, ['alamat']),
    ambil(d, ['rt']) ? `RT ${ambil(d, ['rt'])}` : '',
    ambil(d, ['rw']) ? `RW ${ambil(d, ['rw'])}` : '',
    ambil(d, ['kecamatan']),
    ambil(d, ['kota']),
    ambil(d, ['provinsi']),
  ]);
  if (alamat) L.push(`<b>Alamat:</b> ${esc(alamat)}`);

  const status = ambil(d, ['status']);
  if (status) L.push(`<b>Status Data:</b> ${esc(status)}`);

  return L.join('\n');
}

/**
 * Format hasil cek KK untuk ditampilkan ke user.
 *
 * Aturan:
 *   - Ada data KK terbaru -> HANYA tampilkan data terbaru
 *   - Tidak ada          -> tampilkan data lama (maks 3 entri)
 *
 * @param {object} result - { kk_terbaru, kk_lama }
 * @param {object} [opts]
 * @param {string} [opts.cachedAt]
 * @returns {string}
 */
function formatCekKK(result, opts = {}) {
  const terbaru = result && result.kk_terbaru;
  const lama = result && Array.isArray(result.kk_lama) ? result.kk_lama : [];

  const hasTerbaru = amabilObjek(terbaru) !== null;

  let out = '';

  if (hasTerbaru) {
    out = formatSatuKK(terbaru, '📋 <b>DATA KK TERBARU</b>');
  } else {
    const tampil = lama.slice(0, 3);

    if (tampil.length === 0) {
      return '❌ <b>Data KK tidak ditemukan.</b>';
    }

    const bagian = tampil.map((k, i) => {
      const judul =
        tampil.length > 1 ? `📋 <b>DATA KK LAMA #${i + 1}</b>` : '📋 <b>DATA KK LAMA</b>';
      return formatKkLama(k, judul);
    });

    out =
      '⚠️ <b>Data KK terbaru tidak tersedia.</b>\n' +
      '<i>Menampilkan data lama (per orang, bukan per keluarga).</i>\n\n' +
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