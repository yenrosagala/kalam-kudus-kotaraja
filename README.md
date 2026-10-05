# GK Kalam Kudus Kotaraja

Situs statis: HTML + CSS + JavaScript polos di `root/`, database di **Supabase Postgres**.
Tidak ada server, tidak ada Node.js di produksi, tidak ada SQLite.

Browser bicara langsung ke Postgres lewat PostgREST (Supabase JS), dan admin login
lewat Supabase Auth. Host di **GitHub Pages**.

Isi folder `root/` tinggal di-*copy* apa adanya ke hosting statis mana pun.

## PENTING: kunci yang aman vs yang tidak

| Kunci | Boleh masuk `root/`? | Kenapa |
|---|---|---|
| Project URL (`https://xxx.supabase.co`) | Ya | bukan rahasia |
| **anon public** / **publishable** (`eyJ...` atau `sb_publishable_...`) | Ya | memang ada di browser; dilindungi **RLS** |
| **secret** / **service_role** (`sb_secret_...`) | **TIDAK PERNAH** | **bypass RLS** = akses penuh ke database |
| password postgres | **TIDAK PERNAH** | hanya untuk SQL Editor |

`root/supabase-config.js` memuat guard yang **menolak** `sb_secret_` secara eksplisit,
supaya salah tempel tidak diam-diam jadi lubang besar.

## Setup (sekali saja)

1. **Buat project** di [supabase.com](https://supabase.com).
2. **Jalankan `supabase-migration.sql`** di Dashboard → SQL Editor → New query.
   Membuat 3 tabel, index, batas panjang kolom, mengaktifkan **RLS**, dan memberi GRANT.
3. **Jalankan `supabase-seed.sql`** di SQL Editor juga. Isi awal: 6 jadwal, 1 renungan, 4 berita.
4. **Buat user admin**: Dashboard → Authentication → Users → Add user.
   Pakai email asli + password kuat, centang **Auto Confirm User**.
   Pastikan **"Allow public signups"** dimatikan di Authentication → Sign In / Providers,
   atau siapa pun bisa mendaftar jadi admin.
5. **Salin kredensial** ke `root/supabase-config.js`:
   - Settings → API Keys → **Project URL**
   - Settings → API Keys → yang berlabel **`anon public`** atau **`publishable`**
     (jangan yang `secret` / `service_role`)
6. **Deploy**: GitHub → Settings → Pages → Source: *Deploy from a branch* → `main` / `/root`.

## Test

```bash
npm test
```

`test-port.js` (46 pemeriksaan) menguji logika yang berjalan di browser: parser CSV
RFC 4180, validator jadwal/renungan/berita, penolakan URL foto berbahaya, dan batas
12 foto per berita. Tidak perlu koneksi Supabase.

`test-import.js` dan `test-berita.js` menguji `server.js` versi lama (SQLite).
Keduanya masih ada sebagai rujukan dan **tidak** dijalankan di produksi.

## Model keamanan

Semua pengguna `authenticated` dianggap admin, jadi **jangan** membuat user Auth
lain yang tidak kamu percaya. Penegakan sebenarnya ada di RLS:

- `anon` (pengunjung, tanpa login) → **hanya SELECT**
- `authenticated` (admin) → SELECT + INSERT + UPDATE + DELETE

Perubahan dari versi Express: dulu ada satu `ADMIN_PASSWORD` di server dan sesi lewat
cookie. Sekarang setiap admin punya akun sendiri, sehingga riwayat perubahan bisa
dilacak lewat Supabase dashboard.

## Struktur

```
root/index.html          halaman tunggal, semua tampilan via hash routing
root/style.css           gaya
root/app.js              seluruh logika: query, CRUD, impor CSV, auth
root/supabase-config.js  URL + publishable key + guard anti-secret-key
root/vendor/             supabase.min.js (lokal, tanpa CDN)
supabase-migration.sql   skema + RLS + GRANT  (jalankan sekali)
supabase-seed.sql        isi awal           (jalankan sekali)
test-port.js             test logika browser
server.js, db.js         versi lama Express + SQLite, rujukan saja
```

## Catatan operasional

- **Kolom `gambar`** di berita diisi **satu URL per baris** (maks. 12, diawali `http://`, `https://`, atau `/`).
- **Impor CSV** lewat halaman admin: tombol "Unduh template CSV" menghasilkan berkas
  dari browser (tidak perlu server). Baris yang gagal dilaporkan per nomor baris tanpa
  membatalkan baris lain.
- **Renungan "hari ini"** bertingkat: tanggal hari ini → renungan terakhir pada/sebelum
  hari ini → renungan terbaru. Tanggal pakai zona waktu `Asia/Jayapura` (WIT).
- Sample `jadwal ibadah.xlsx` berisi ~180 nama parishioner/pastor asli sehingga
  **tidak** ikut di-commit. Impor lewat halaman admin, bukan lewat git.