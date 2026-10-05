# GK Kalam Kudus Kotaraja

Node.js + Express + SQLite (better-sqlite3). Data ada di `data/gkkk.sqlite`, diubah admin lewat tombol "Login" di menu bar halaman utama.

## Menjalankan
```bash
npm install
ADMIN_PASSWORD="kata-sandi-kuat" SESSION_SECRET="string-acak-panjang" npm start
```
Situs: http://localhost:3000  |  Admin: tombol "Login" di menu bar -> tombol "+ Tambah jadwal" / "+ Tambah renungan" / "+ Tambah berita" dan tombol "Ubah" pada tiap entri muncul

## Berita
Halaman `#/berita` menampilkan semua berita sebagai grid (gambar, tanggal, judul, ringkasan); klik judul untuk
membaca artikel lengkap di `#/berita/:id` dengan carousel gambar (tombol ‹ › di kiri/kanan gambar).
Lima berita terbaru otomatis tampil di beranda.
Admin menambah / mengubah / menghapus lewat tombol "+ Tambah berita" dan "Ubah" pada tiap kartu.

Kolom `gambar` diisi **satu URL per baris** (maks. 12, wajib diawali `http://`, `https://`, atau `/` untuk gambar
di server), bukan unggahan file. Baris yang bukan URL diabaikan; URL duplikat dihapus.

Empat berita contoh di `db.js` (judulnya diawali "Contoh:") hanya berfungsi sebagai isi awal supaya halaman tidak
kosong, dan otomatis hilang begitu berita pertama Anda terbitkan lewat tombol "+ Tambah berita".

## Tabel
- `jadwal_komisi` (id, tanggal, tipe KU|KOMISI, komisi, jenis_ibadah, tuan_rumah, liturgis, pelayan_firman, judul, teks, nats_pembimbing, tujuan, tempat, waktu, status)
- `mezbah` (tanggal PK, judul, tema, bacaan, ayat, renungan, pesan, refleksi, doa_gkkk, doa_misi, doa_penutup, diubah)
- `berita` (id, tanggal, judul, ringkasan, gambar, isi, diubah)

## API
Publik: `GET /api/komisi`, `/api/mezbah/hari-ini`, `/api/mezbah/daftar`, `/api/mezbah/:tanggal`, `/api/berita`, `/api/berita/:id`
Admin: `POST|PUT|DELETE /api/komisi`, `PUT|DELETE /api/mezbah/:tanggal`, `POST|PUT|DELETE /api/berita`, `PUT|DELETE /api/berita/:id`,
`GET /api/template/:jenis`, `POST /api/import/:jenis` (`:jenis` = `jadwal` atau `mezbah`)

Cadangan database otomatis di `data/backups/` (maks. sekali per jam saat ada perubahan, 30 terakhir).
Pasang di belakang HTTPS dan simpan folder `data/` di disk permanen.
