# GK Kalam Kudus Kotaraja

Situs statis: HTML + CSS + JavaScript polos di `root/`, database di **Supabase Postgres**.
Tanpa server, tanpa Node.js di produksi, tanpa build step, tanpa dependency.

Browser bicara langsung ke Postgres lewat PostgREST (Supabase JS), dan admin login
lewat Supabase Auth. Hosting di **GitHub Pages**.

Isi folder `root/` tinggal di-*copy* apa adanya ke hosting statis mana pun.
Tidak perlu `npm install`, tidak perlu `npm run build` — repo ini tidak punya
proses build sama sekali.

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
   Membuat 6 tabel (`jadwal_komisi`, `mezbah`, `berita`, `jemaat`, `jemaat_daftar`,
   `teks_tentang`), 1 view ringkasan, index, mengaktifkan **RLS**, dan memberi GRANT.
   Semua kolom teks bertipe `text`, jadi Postgres sendiri tidak membatasi
   panjangnya. Batasnya datang dari CHECK `char_length` per kolom: mulai 40
   (`jadwal_komisi.komisi`) sampai 20000 (`berita.isi`); `teks_tentang.isi`
   dibatasi 800 supaya kalimat yang bisa disunting admin tidak jadi dokumen.
3. **Jalankan `supabase-seed.sql`** di SQL Editor juga, supaya situs tidak kosong
   saat pertama kali online: jadwal, data mezbah, dan beberapa berita contoh.
4. **Buat user admin**: Dashboard → Authentication → Users → Add user.
   Pakai email asli + password kuat, centang **Auto Confirm User**.
   Pastikan **"Allow public signups"** dimatikan di Authentication → Sign In / Providers,
   atau siapa pun bisa mendaftar jadi admin.
5. **Salin kredensial** ke `root/supabase-config.js`:
   - Settings → API Keys → **Project URL**
   - Settings → API Keys → yang berlabel **`anon public`** atau **`publishable`**
     (jangan yang `secret` / `service_role`)
6. **Deploy**: Settings → Pages → Source: **GitHub Actions**. Workflow
   `.github/workflows/deploy-pages.yml` otomatis upload folder `root/` setiap
   ada push ke `main` yang menyentuh `root/`.

Kedua file SQL aman dijalankan ulang: keduanya pakai `IF NOT EXISTS` /
`WHERE NOT EXISTS`, jadi tidak dobel dan tidak menimpa data yang sudah ada.

## Yang benar-benar ter-deploy

Hanya isi `root/`. Workflow meng-upload folder itu ke branch `gh-pages`, dan branch
itu tidak pernah berisi file lain — jadi SQL, data, dan konfigurasi lokal tidak
pernah terunduh publik. Aset di `index.html` sengaja relatif (`./style.css`),
bukan absolut, karena URL Pages punya prefix `/kalam-kudus-kotaraja/`.

## Struktur

```
root/                    satu-satunya folder yang ter-deploy
  index.html             halaman tunggal, semua tampilan via hash routing
  style.css              gaya
  app.js                 seluruh logika: query, CRUD, impor CSV, auth
  supabase-config.js     URL + publishable key + guard anti-secret-key
  vendor/                supabase.min.js (lokal, tanpa CDN)
  gkkk-mark.png          favicon + logo
  hero.jpg, hero-sm.jpg  gambar hero (desktop / mobile)
supabase-migration.sql   skema + RLS + GRANT      (jalankan sekali)
supabase-seed.sql        isi awal                (jalankan sekali)
.github/workflows/       deploy otomatis ke GitHub Pages
```

Tidak ada `server.js`, `db.js`, `tools/`, atau `test-*.js` lagi. Versi Express +
SQLite sudah dihapus; kalau butuh server statis lokal untuk mencoba, pakai apa
saja (Live Server, `python -m http.server`) — bukan `node server.js`.

## Model keamanan

Semua pengguna `authenticated` dianggap admin, jadi **jangan** membuat user Auth
lain yang tidak kamu percaya. Penegakan sebenarnya ada di RLS:

- `anon` (pengunjung, tanpa login) → **hanya SELECT**
- `authenticated` (admin) → SELECT + INSERT + UPDATE + DELETE

Semua admin punya akun sendiri, sehingga riwayat perubahan bisa dilacak lewat
Supabase dashboard.

## Catatan operasional

- **Kolom `gambar`** di berita diisi **satu URL per baris** (maks. 12, diawali
  `http://`, `https://`, atau `/`).
- **Impor CSV** lewat halaman admin: tombol "Unduh template CSV" menghasilkan
  berkas dari browser (tidak perlu server). Baris yang gagal dilaporkan per nomor
  baris tanpa membatalkan baris lain.
- **Impor Jemaat** mengikuti aturan worksheet, bukan mengira-ira:
  - nomor keluarga berjalan mengikuti urutan sheet — Waena 1–19, Kotaraja
    20–47, Tanah di Hitam 48–59, Holtekam dan Koya 60–64, Jayapura 65–67,
    Sentani 68–70. Nomor berikutnya setelah impor **71**;
  - nomor itu **angka polos**, bukan teks — `app.js` menjumlahkannya
    (`+r.no_keluarga`) untuk membuat nomor pendaftar baru, jadi format seperti
    `W-01` akan merusak penghitungan;
  - `daerah` diambil dari nama sheet setelah awalan `Jemaat di ` dibuang;
  - `nama_keluarga` = kata terakhir nama kepala keluarga; alamat yang kosong
    mewarisi baris sebelumnya dalam keluarga yang sama.
- **Tanggal lahir** diisi hanya kalau workbook memang punya tahun dan formatnya
  jelas (204 nama: 155 terisi, 49 dikosongkan). Tahun tidak pernah ditebak.
- **Kerinduan pelayanan** (`jemaat.pelayanan`, 11 nilai) diseragamkan — workbook
  memakai dua ejaan, keduanya jadi `Singer`. Kolom `jk` dan `kepala` sengaja
  dibiarkan kosong karena tidak ada di workbook, bukan bug.
- **Renungan "hari ini"** bertingkat: tanggal hari ini → renungan terakhir pada
  atau sebelum hari ini → renungan terbaru. Tanggal pakai zona waktu
  `Asia/Jayapura` (WIT).
- Workbook sumber `DATA JEMAAT` berisi **204 nama dari 70 keluarga** di 6
  wilayah, jadi **tidak** ikut di-commit (lihat `.gitignore`). Impor lewat
  halaman admin, bukan lewat git.
- Repo ini **tidak** membawa test otomatis. Verifikasi sebelum deploy: buka
  `root/index.html` lewat server statis, cek tiap halaman lewat hash routing,
  dan cek `node --check root/app.js` kalau kamu menyunting `app.js`.

## Tidak ada test suite

Dulu ada `test-port.js`, `test-jemaat.js`, `test-berita.js`, dan `test-import.js`.
Semuanya dihapus beserta dependensi `express` + `better-sqlite3`, jadi
`npm install` sekarang tidak mengunduh apa pun. Kalau perubahan nanti terasa
berisiko, tambahkan lagi pemeriksaan yang kamu butuh — tapi jangan menambahkannya
untuk sekadar "kepatuhan"; website ini tidak butuh itu.
