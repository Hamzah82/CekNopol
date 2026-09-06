# PRD — Bot Telegram Cek Nopol Kendaraan

> **Project:** CekNopolBot  
> **Platform:** Bot Telegram (Node.js)  
> **Database:** Full JSON (lokal)  
> **Status:** Draft v1.0

---

## 1. Tujuan

Menyediakan bot Telegram yang memungkinkan user mengecek data kendaraan bermotor berdasarkan plat nomor melalui API eksternal, dengan sistem token (saldo) untuk membatasi pemakaian, serta cache lokal untuk mengurangi panggilan API berulang.

---

## 2. Stack Teknologi

| Komponen | Pilihan |
|---|---|
| Runtime | Node.js (v18+) |
| Framework Bot | `node-telegram-bot-api` (polling) atau `telegraf.js` (recommended) |
| Database | JSON files lokal (`*.json`) |
| HTTP Client | `axios` atau `node-fetch` |
| Konfigurasi | `setup.json` (menggantikan `.env`) |
| API Eksternal | Lihat `APIdoc.txt` — endpoint `/api/nopol` |

---

## 3. Struktur Project

```
ceknopol-bot/
├── index.js                  # Entry point bot
├── setup.json                # Konfigurasi (BOT_TOKEN, API_KEY, dll)
├── package.json
├── PRD.md                    # Dokumen ini
├── db/
│   ├── plat.json             # Cache data kendaraan (key: plat)
│   ├── tokens.json           # Saldo token per user { userId: number }
│   └── admins.json           # Daftar ID admin [number]
└── src/
    ├── bot.js                # Inisialisasi & setup bot
    ├── handlers/
    │   ├── start.js          # Handler /start & /menu
    │   ├── token.js          # Handler /token (user & admin)
    │   └── cek.js            # Handler /cek <plat>
    ├── services/
    │   ├── api.js            # Hit API eksternal
    │   ├── cache.js          # Baca/tulis plat.json
    │   └── tokenManager.js   # Kelola saldo token (tokens.json)
    └── utils/
        ├── format.js         # Format hasil untuk ditampilkan
        └── validator.js      # Validasi format plat nomor
```

---

## 4. Konfigurasi — `setup.json`

Semua konfigurasi bot disimpan dalam satu file `setup.json` di root project, **bukan** `.env` atau file terpisah-pisah.

### Format

```json
{
  "botToken": "8151563999:AAH9qWYZ8cBPq-PPq2i0DWAX0Hm0ac3Bl50",
  "apiUrl": "https://typically-bonus-ultram-appearance.trycloudflare.com",
  "apiKey": "D1315AFJ",
  "adminIds": [123456789, 987654321],
  "botUsername": "CekNopolBot",
  "dbPath": "./db"
}
```

### Penjelasan Field

| Field | Tipe | Deskripsi |
|---|---|---|
| `botToken` | string | Token bot Telegram dari @BotFather |
| `apiUrl` | string | Base URL API eksternal (tanpa trailing slash) |
| `apiKey` | string | API key untuk mengakses API nopol |
| `adminIds` | array of number | Daftar Telegram User ID yang punya akses admin |
| `botUsername` | string | (opsional) Username bot untuk keperluan display |
| `dbPath` | string | (opsional) Path folder database, default `./db` |

### Cara Load

```js
const config = JSON.parse(fs.readFileSync('./setup.json', 'utf-8'));
```

**Catatan:** `setup.json` **wajib** di-ignore di `.gitignore` jika project di-push ke repo publik, karena berisi token dan API key.

---

## 5. Fitur & Command

### 5.1 User Commands

#### `/start` atau `/menu`
Menampilkan **pesan sambutan** dan panduan cara menggunakan bot.

**Isi pesan:**
- Sambutan
- Daftar command yang tersedia beserta penjelasannya
- Format plat nomor yang valid (contoh: B1234XYZ, D 1234 ABC)
- Cara mendapatkan token (jika perlu)

#### `/token`
Menampilkan **sisa token** yang dimiliki user saat ini.

**Logika:**
- Baca `tokens.json`
- Jika user belum pernah tercatat → return 0 atau pesan "Belum memiliki token"
- Jika ada → tampilkan jumlah token tersisa

#### `/cek <platNomor>`
Fitur utama — mengecek data kendaraan berdasarkan plat nomor.

**Alur lengkap:**

```
1. Validasi format plat (regex: minimal 1 huruf + 1-4 angka + 1-2 huruf)
   ❌ Format salah → "Format plat tidak valid. Contoh: B1234XYZ"
   
2. Cek saldo token user
   ❌ Token <= 0 → "Saldo token tidak mencukupi. Hubungi admin."

3. Normalisasi plat (hapus spasi, uppercase)

4. Cek cache lokal (plat.json)
   🔍 Jika plat ADA di cache:
      → Kurangi 1 token dari saldo user
      → Kirim data dari cache ke user (tanpa tembak API)
      → SELESAI
   
5. 🔍 Jika plat TIDAK ada di cache:
   a. Tembak API eksternal:
      GET /api/nopol?plat={plat}&key={apiKey}
   
   b. Validasi respons API:
      - Jika response.success !== true → API error/data tidak ditemukan
        → "Data kendaraan tidak ditemukan."
        → JANGAN kurangi saldo token user!
        → SELESAI
   
   c. Jika response.success === true:
      - Kurangi 1 token dari saldo user
      - Simpan hasil ke plat.json (cache)
      - Kirim data kendaraan ke user (diformat rapi)

6. Kirim hasil ke user
```

**Poin penting:**
- ✅ Cache dulu baru API — kurangi panggilan API boros token
- ✅ **Cache tetap kena potongan token** (1 token) — karena data sudah pernah di-fetch sebelumnya
- ✅ Jangan kurangi token jika API return error / data tidak ditemukan
- ✅ Jangan kirim seluruh `plat.json` ke user — hanya data plat yang diminta
- ✅ Format pesan hasil diperjelas (merk, tipe, tahun, warna, nama pemilik, dll)

---

### 5.2 Admin Commands

#### `/token <IDuser> +<jumlah>` atau `/token <IDuser> -<jumlah>`
Hanya bisa dijalankan oleh user yang terdaftar di `setup.json` → `adminIds`.

**Logika:**
- Cek apakah `userId` pengirim ada di `adminIds` → ❌ Jika bukan admin, abaikan/tolak
- Parse `<IDuser>` (Telegram user ID numeric)
- Parse operator (`+` atau `-`) dan jumlah
- Update `tokens.json`
- Kirim konfirmasi ke admin

**Contoh:**
```
/token 123456789 +10   → Tambah 10 token ke user 123456789
/token 123456789 -5    → Kurangi 5 token dari user 123456789
```

---

## 6. Database Schema (JSON)

### 6.1 `db/plat.json` — Cache Data Kendaraan

```json
{
  "B1234XYZ": {
    "plat": "B 1234 XYZ",
    "merk": "TOYOTA",
    "tipe": "AVANZA 1.3 G M/T",
    "tahun": "2020",
    "warna": "PUTIH",
    "warnaTnkb": "HITAM",
    "cc": "1298",
    "rangka": "MHBJ3****",
    "mesin": "HR12****",
    "bpkb": "N05****",
    "nama": "BUDI S****",
    "nik": "327304XXXXXX0001",
    "alamat": "JL. MERDEKA NO. 10",
    "jenisKendaraan": "MB. PENUMPANG",
    "statusPajak": "AKTIF",
    "tglPajakExp": "2025-12-31",
    "cachedAt": "2025-09-02T19:35:00.000Z"
  }
}
```

**Catatan:**
- Key = plat nomor yang sudah dinormalisasi (tanpa spasi, uppercase)
- `cachedAt` = timestamp kapan data disimpan (untuk keperluan TTL/expired cache opsional)
- Field yang dikirim ke user dipilih yang informatif saja (tidak semua field)

### 6.2 `db/tokens.json` — Saldo Token

```json
{
  "123456789": 10,
  "987654321": 5
}
```

- Key = Telegram User ID (string)
- Value = jumlah token (integer, tidak boleh negatif)

### 6.3 `db/admins.json` — Cadangan Admin ID (opsional)

```json
[123456789, 111222333]
```

> **Catatan:** Sumber utama admin ID adalah `setup.json` → `adminIds`.  
> File `admins.json` bersifat **opsional** — bisa dipakai sebagai fallback/override jika ingin mengubah daftar admin tanpa mengedit `setup.json`.  
> Pada implementasi awal, admin ID cukup dibaca dari `setup.json`; `admins.json` bisa ditambahkan belakangan jika diperlukan.

---

## 7. API Integration

### Endpoint
```
GET /api/nopol?plat={plat}&key={api_key}
```

### Response Sukses
```json
{
  "success": true,
  "data": [{ ... }],
  "tokens_remaining": 98
}
```

### Response Gagal / Tidak Ditemukan
- `success: false`
- Atau HTTP status non-200
- Atau `data` kosong / tidak sesuai struktur

### Validasi Response
- Wajib cek `response.success === true`
- Wajib cek `response.data` adalah array dengan minimal 1 elemen
- Jika tidak sesuai → anggap data tidak ditemukan → **JANGAN kurangi token**

---

## 8. Error Handling

| Skenario | Tindakan |
|---|---|
| `setup.json` tidak ditemukan | Log error dan exit, beri tahu cara setup |
| Format plat salah | Balas pesan error, jangan kurangi token |
| Token habis | Balas "Saldo tidak cukup", jangan proses |
| API timeout / error network | Balas "Gagal menghubungi server, coba lagi" |
| API return success=false | Balas "Data tidak ditemukan", jangan kurangi token |
| File JSON corrupt | Inisialisasi ulang dengan data default, log error |
| Bukan admin jalankan command admin | Abaikan / balas "Kamu bukan admin" |

---

## 9. Keamanan

- **BOT_TOKEN** & **API_KEY** disimpan di `setup.json` — **jangan commit** (tambahkan `setup.json` ke `.gitignore`)
- Validasi input plat nomor → regex untuk cegah injection
- Admin ID dicek dari `setup.json.adminIds` — tidak bisa diubah lewat command bot
- Token tidak bisa negatif (floor to 0 jika operasi pengurangan menyebabkan negatif)
- File `setup.json` permission sebaiknya dibatasi (baca saja untuk user lain)

---

## 10. Inisialisasi & Setup

### Langkah-langkah

1. Buat folder project dan `package.json`
2. Install dependencies: `telegraf`, `axios` (tidak perlu `dotenv`)
3. Buat folder `db/` dengan file JSON default:
   - `plat.json` → `{}`
   - `tokens.json` → `{}`
4. Buat file `setup.json` di root project:
   ```json
   {
     "botToken": "8151563999:AAH9qWYZ8cBPq-PPq2i0DWAX0Hm0ac3Bl50",
     "apiUrl": "https://typically-bonus-ultram-appearance.trycloudflare.com",
     "apiKey": "D1315AFJ",
     "adminIds": [123456789, 987654321],
     "dbPath": "./db"
   }
   ```
5. Tambahkan `setup.json` ke `.gitignore`
6. Jalankan `node index.js`

---

## 11. Daftar Perintah Ringkas

| Command | Siapa | Deskripsi |
|---|---|---|
| `/start` | Semua | Sambutan & panduan |
| `/menu` | Semua | Sama seperti `/start` |
| `/token` | Semua | Lihat sisa token sendiri |
| `/cek <plat>` | Semua | Cek data kendaraan (butuh token) |
| `/token <id> +<n>` | Admin | Tambah token user |
| `/token <id> -<n>` | Admin | Kurangi token user |

---

## 12. Catatan Pengembangan

- Gunakan `telegraf.js` (recommended) karena lebih modern, mendukung middleware, dan mudah dibaca
- Bot bisa jalan di VPS / Termux / Railway / Render
- Untuk production, pertimbangkan backup periodik file JSON
- Cache `plat.json` bisa ditambahkan TTL (misal: 30 hari) jika ingin refresh data otomatis
- Setiap kali bot restart, pastikan `setup.json` valid dan folder `db/` serta file JSON-nya ada (auto-create jika belum)
- Tidak perlu `dotenv` — semua config dibaca dari `setup.json` via `fs.readFileSync`

---

## 13. Milestone (Rencana Implementasi)

1. ✅ **PRD disetujui** — dokumen ini
2. ⬜ **Setup project** — init npm, install deps, struktur folder, `setup.json`
3. ⬜ **Handler /start & /menu** — pesan sambutan
4. ⬜ **Handler /token user** — lihat saldo
5. ⬜ **Handler /token admin** — tambah/kurang token
6. ⬜ **Handler /cek** — cache → API → simpan → kirim
7. ⬜ **Error handling & validasi** — semua edge case
8. ⬜ **Testing & deployment**

---

> **Dibuat oleh:** 🐢 Ruka AI  
> **Tanggal:** 2 September 2025