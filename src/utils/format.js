/**
 * format.js — Format hasil data kendaraan untuk ditampilkan di Telegram
 */

/**
 * Format data kendaraan menjadi pesan Telegram yang rapi.
 *
 * Catatan struktur data:
 *   - Sebagian field bisa kosong ("") -> ditampilkan '-'
 *   - noHp kadang berisi 16 digit (tertukar dengan NIK oleh provider)
 *   - tanggal berformat "YYYY-MM-DD HH:MM:SS.ffffff" -> dipotong
 *   - pkbPokok/jumlahPajak berupa angka mentah -> diformat rupiah
 *
 * @param {object} data - Data kendaraan dari API atau cache
 * @returns {string} Pesan terformat (HTML parse mode)
 */
function formatKendaraan(data) {
  const d = data || {};

  // ─── Helper ───
  const esc = (v) =>
    String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  /** Nilai bersih: kosong/spasi -> '-' */
  const val = (v) => {
    const t = v === undefined || v === null ? '' : String(v).trim();
    return t === '' ? '-' : esc(t);
  };

  /** Apakah field punya isi */
  const ada = (v) => v !== undefined && v !== null && String(v).trim() !== '';

  /** Tanggal -> DD-MM-YYYY (buang jam & mikrodetik) */
  const tgl = (v) => {
    if (!ada(v)) return '-';
    const t = String(v).trim();
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : esc(t);
  };

  /** Angka -> Rp1.234.567 */
  const rupiah = (v) => {
    if (!ada(v)) return '-';
    const n = Number(String(v).replace(/[^0-9]/g, ''));
    if (!Number.isFinite(n) || n === 0) return '-';
    return 'Rp' + n.toLocaleString('id-ID');
  };

  /** Baris opsional: hanya ditambahkan bila ada isi */
  const opsional = (label, v, fmt) => {
    if (!ada(v)) return;
    L.push(`<b>${label}:</b> ${fmt ? fmt(v) : val(v)}`);
  };

  const L = [];

  // ─── Kendaraan ───
  L.push(`<b>🚗 DATA KENDARAAN</b>`, ``);
  L.push(`<b>Plat:</b> ${val(d.plat)}`);
  L.push(`<b>Merk:</b> ${val(d.merk)}`);
  L.push(`<b>Tipe:</b> ${val(d.tipe)}`);
  L.push(`<b>Tahun:</b> ${val(d.tahun)}`);
  L.push(`<b>Warna:</b> ${val(d.warna)}`);
  opsional('Warna TNKB', d.warnaTnkb);
  opsional('CC', d.cc);
  opsional('Jenis', d.jenisKendaraan);
  opsional('BBM', d.bbm);
  opsional('APM', d.apm);
  opsional('Tgl Daftar', d.tglDaftar, tgl);

  // ─── Pemilik ───
  const adaPemilik = ada(d.nama) || ada(d.nik) || ada(d.alamat) || ada(d.noHp);
  if (adaPemilik) {
    L.push(``, `<b>👤 PEMILIK</b>`);
    opsional('Nama', d.nama);
    opsional('NIK', d.nik);
    opsional('Pekerjaan', d.pekerjaan);
    opsional('No. KK', d.noKK);

    // noHp bisa berisi NIK (16 digit) karena provider kadang tertukar
    if (ada(d.noHp)) {
      const hp = String(d.noHp).trim();
      const label = /^\d{16}$/.test(hp) ? 'No. HP <i>(format NIK)</i>' : 'No. HP';
      L.push(`<b>${label}:</b> ${esc(hp)}`);
    }

    opsional('Alamat', d.alamat);
    opsional('RT/RW', d.rtRw);
    opsional('Kota', d.kota);
    opsional('Provinsi', d.provinsi);
    opsional('Polda', d.polda);
  }

  // ─── Identifikasi ───
  const adaId = ada(d.rangka) || ada(d.mesin) || ada(d.bpkb) || ada(d.stnk);
  if (adaId) {
    L.push(``, `<b>🔧 IDENTIFIKASI</b>`);
    opsional('No. Rangka', d.rangka);
    opsional('No. Mesin', d.mesin);
    opsional('No. BPKB', d.bpkb);
    opsional('No. STNK', d.stnk);
    opsional('Sumbu', d.sumbu);
    opsional('Roda', d.roda);
  }

  // ─── Pajak ───
  const adaPajak =
    ada(d.statusPajak) ||
    ada(d.tglPajakExp) ||
    ada(d.jumlahPajak) ||
    ada(d.pkbPokok) ||
    ada(d.tglBayarPajak);
  if (adaPajak) {
    L.push(``, `<b>💰 PAJAK</b>`);
    opsional('Status', d.statusPajak);
    opsional('Berlaku s/d', d.tglPajakExp, tgl);
    opsional('Masa STNK', d.tglStnk, tgl);
    opsional('PKB Pokok', d.pkbPokok, rupiah);
    opsional('Jumlah Pajak', d.jumlahPajak, rupiah);
    opsional('Tgl Bayar', d.tglBayarPajak, tgl);
  }

  if (d.cachedAt) {
    L.push(``, `<i>📦 Data dari cache (${new Date(d.cachedAt).toLocaleString('id-ID')})</i>`);
  }

  return L.join('\n');
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

/**
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

    // Semua anggota ditampilkan tanpa batas
    anggota.forEach((a, i) => {
      L.push('', ...barisAnggota(a, i + 1));
    });
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
 * Format data dari kk_lama.
 *
 * PENTING: kk_lama adalah ARRAY PER ANGGOTA keluarga (bukan per KK).
 * Semua entri berasal dari satu nomor KK yang sama, jadi disusun
 * menyerupai tampilan KK pada umumnya: No. KK lalu daftar anggota.
 *
 * @param {Array<object>} anggota - isi kk_lama
 * @returns {string}
 */
function formatDariLama(anggota) {
  if (!Array.isArray(anggota) || anggota.length === 0) {
    return '❌ <b>Data KK tidak ditemukan.</b>';
  }

  const L = [];

  // Nomor KK dari entri pertama (semua sama)
  const nokk = normalNomor(ambil(anggota[0], ['nkk', 'no_kk']));

  L.push(`<b>No. KK:</b> ${esc(nokk)}`);
  L.push(`<b>Jumlah anggota:</b> ${anggota.length}`);
  L.push('', `<b>👥 ANGGOTA (${anggota.length})</b>`);

  anggota.forEach((a, i) => {
    L.push('');
    L.push(`<b>${i + 1}. ${esc(ambil(a, ['nama', 'NAMA_LENGKAP']) || '-')}</b>`);
    L.push(`NIK: ${esc(normalNomor(ambil(a, ['nik', 'NIK'])))}`);

    const jk = normalJenisKelamin(ambil(a, ['jenis_kelamin', 'JENIS_KELAMIN']));
    const lahir = normalTanggal(ambil(a, ['tanggal_lahir', 'TANGGAL_LAHIR']));
    L.push(`JK: ${esc(jk)} | Lahir: ${esc(lahir)}`);

    const tmp = ambil(a, ['tempat_lahir', 'TEMPAT_LAHIR']);
    if (tmp) L.push(`Tempat Lahir: ${esc(tmp)}`);

    // Status kawin pada data ini berupa kode angka
    const kawin = ambil(a, ['kawin', 'STATUS_PERNIKAHAN']);
    if (kawin !== undefined) {
      const label = { 1: 'BELUM KAWIN', 2: 'KAWIN', 3: 'CERAI HIDUP', 4: 'CERAI MATI' };
      L.push(`Status Kawin: ${esc(label[String(kawin)] || kawin)}`);
    }

    const alamat = susunAlamat([
      ambil(a, ['alamat']),
      ambil(a, ['rt']) ? `RT ${ambil(a, ['rt'])}` : '',
      ambil(a, ['rw']) ? `RW ${ambil(a, ['rw'])}` : '',
      ambil(a, ['kecamatan']),
      ambil(a, ['kota']),
      ambil(a, ['provinsi']),
    ]);
    if (alamat) L.push(`Alamat: ${esc(alamat)}`);
  });

  return L.join('\n');
}

/**
 * Format hasil cek KK untuk ditampilkan ke user.
 *
 * Tampilan SERAGAM — user tidak diberi tahu apakah datanya baru atau lama.
 * Seluruh anggota ditampilkan tanpa batas.
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

  let out;

  if (hasTerbaru) {
    out = formatSatuKK(terbaru);
  } else if (lama.length > 0) {
    out = formatDariLama(lama);
  } else {
    return '❌ <b>Data KK tidak ditemukan.</b>';
  }

  if (opts.cachedAt) {
    out += `\n\n<i>📦 Data dari cache (${new Date(opts.cachedAt).toLocaleString('id-ID')})</i>`;
  }

  return out;
}

module.exports = { formatKendaraan, formatNama, formatNik2kk, formatNomor, formatCekKK, formatError, formatSuccess };