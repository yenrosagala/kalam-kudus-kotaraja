const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'data');
const BACKUPS = path.join(DIR, 'backups');
fs.mkdirSync(BACKUPS, { recursive: true });

const db = new Database(process.env.DB_FILE || path.join(DIR, 'gkkk.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS jadwal_komisi (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal        TEXT NOT NULL CHECK (tanggal GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  tipe           TEXT NOT NULL DEFAULT 'KOMISI' CHECK (tipe IN ('KU','KOMISI')),
  komisi         TEXT NOT NULL,                 -- 'Kebaktian Umum' bila tipe KU; selain itu Pemuda, Remaja, PW, PKP, ...
  jenis_ibadah   TEXT NOT NULL DEFAULT '',
  tuan_rumah     TEXT NOT NULL DEFAULT '',
  liturgis       TEXT NOT NULL DEFAULT '',
  pelayan_firman TEXT NOT NULL DEFAULT '',
  judul          TEXT NOT NULL,
  teks           TEXT NOT NULL DEFAULT '',      -- ayat utama
  nats_pembimbing TEXT NOT NULL DEFAULT '',
  tujuan         TEXT NOT NULL DEFAULT '',
  tempat         TEXT NOT NULL DEFAULT '',
  waktu          TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'TERJADWAL' CHECK (status IN ('TERJADWAL','SELESAI','BATAL')),
  diubah         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mezbah (
  tanggal   TEXT PRIMARY KEY CHECK (tanggal GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  judul     TEXT NOT NULL,
  tema      TEXT NOT NULL DEFAULT '',   -- tema mingguan
  bacaan    TEXT NOT NULL DEFAULT '',   -- bacaan Alkitab
  ayat      TEXT NOT NULL DEFAULT '',   -- ayat kunci
  renungan  TEXT NOT NULL,
  pesan     TEXT NOT NULL DEFAULT '',   -- pesan hari ini
  refleksi  TEXT NOT NULL DEFAULT '',   -- refleksi keluarga
  doa_gkkk  TEXT NOT NULL DEFAULT '',   -- pokok doa: keluarga besar GKKK
  doa_misi  TEXT NOT NULL DEFAULT '',   -- pokok doa: misi
  doa_penutup TEXT NOT NULL DEFAULT '',
  diubah    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS berita (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal   TEXT NOT NULL CHECK (tanggal GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  judul     TEXT NOT NULL,
  ringkasan TEXT NOT NULL DEFAULT '',   -- judul + 1-2 kalimat untuk kartu di daftar
  gambar    TEXT NOT NULL DEFAULT '',   -- URL foto, satu per baris ( carousel )
  isi       TEXT NOT NULL,              -- isi berita
  diubah    TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// migrasi untuk database lama yang belum punya kolom tipe / jenis_ibadah
const cols = db.prepare("PRAGMA table_info(jadwal_komisi)").all().map(c => c.name);
if (!cols.includes('tipe')) db.exec("ALTER TABLE jadwal_komisi ADD COLUMN tipe TEXT NOT NULL DEFAULT 'KOMISI'");
if (!cols.includes('jenis_ibadah')) db.exec("ALTER TABLE jadwal_komisi ADD COLUMN jenis_ibadah TEXT NOT NULL DEFAULT ''");
db.exec('CREATE INDEX IF NOT EXISTS idx_jk ON jadwal_komisi (tanggal, komisi)');
db.exec('CREATE INDEX IF NOT EXISTS idx_berita ON berita (tanggal DESC, id DESC)');

// ---- data awal (hanya jika tabel masih kosong) ----
if (!db.prepare('SELECT COUNT(*) c FROM jadwal_komisi').get().c) { // CONTOH, ganti lewat admin
  const ins = db.prepare('INSERT INTO jadwal_komisi (tanggal, tipe, komisi, jenis_ibadah, judul, tempat, waktu) VALUES (?,?,?,?,?,?,?)');
  [['2026-10-11', 'KU', 'Kebaktian Umum', 'Kebaktian Umum', 'Contoh Kebaktian Umum', 'GKKK Kotaraja', '09.30 WIT'],
   ['2026-10-18', 'KU', 'Kebaktian Umum', 'Kebaktian Umum', 'Contoh Kebaktian Umum', 'GKKK Kotaraja', '09.30 WIT'],
   ['2026-10-11', 'KOMISI', 'Pemuda', '', 'Contoh jadwal Pemuda', 'GKKK Kotaraja', ''],
   ['2026-10-18', 'KOMISI', 'Remaja', '', 'Contoh jadwal Remaja', 'GKKK Kotaraja', ''],
   ['2026-10-14', 'KOMISI', 'PW', '', 'Contoh jadwal Persekutuan Wanita', 'GKKK Kotaraja', ''],
   ['2026-10-16', 'KOMISI', 'PKP', '', 'Contoh jadwal Persekutuan Kaum Pria', 'GKKK Kotaraja', '']]
    .forEach(r => ins.run(...r));
}
if (!db.prepare('SELECT COUNT(*) c FROM mezbah').get().c) {
  db.prepare(`INSERT INTO mezbah (tanggal, judul, tema, bacaan, ayat, renungan, pesan, refleksi, doa_gkkk, doa_misi, doa_penutup)
    VALUES (@tanggal,@judul,@tema,@bacaan,@ayat,@renungan,@pesan,@refleksi,@doa_gkkk,@doa_misi,@doa_penutup)`).run({
    tanggal: '2026-09-08',
    judul: 'JANGAN HANYA MENDENGAR PANGGILAN',
    tema: 'Mari, Ikutlah Aku',
    bacaan: 'Matius 4:18–22',
    ayat: 'Matius 4:20',
    renungan: `“Lalu mereka pun segera meninggalkan jalanya dan mengikuti Dia.”

Petrus dan Andreas tidak hanya mendengar panggilan Yesus. Mereka merespons. Ada perbedaan besar antara mendengar dan melakukan. Kita dapat mendengar Firman setiap Minggu, membaca Alkitab, mengikuti persekutuan, bahkan mengetahui banyak ajaran Kristen, tetapi pertanyaannya adalah: Apa yang kita lakukan setelah mendengarnya?

Petrus dan Andreas tidak berkata, “Tuhan, nanti kalau ada waktu.” Mereka merespons panggilan Kristus.
Dalam kehidupan kita, mungkin Tuhan sudah berkali-kali mengingatkan untuk mengampuni, meninggalkan dosa, memperbaiki hubungan, mulai melayani, lebih sungguh berdoa, atau kembali hidup dekat dengan-Nya. Jangan terus berkata “nanti”.`,
    pesan: 'Panggilan Tuhan membutuhkan respons. Iman yang hanya didengar tetapi tidak ditaati tidak akan membawa kita berjalan lebih jauh bersama Kristus.',
    refleksi: 'Adakah sesuatu yang sudah lama Tuhan minta saya lakukan tetapi terus saya tunda?',
    doa_gkkk: `GKKK PEKANBARU

1. Doakan untuk setiap leader dan anggota CROSS agar tetap solid. Kiranya melalui CROSS, mereka dapat bertumbuh dan lebih mengasihi Tuhan.
2. Doakan untuk persiapan HUT GKKK Pekanbaru ke-60 tahun yang akan dilaksanakan pada tanggal 4 Oktober 2026. Melalui acara Anniversary ini kiranya setiap jemaat dapat melihat penyertaan Allah bagi gereja-Nya, dan semakin giat mengerjakan visi Allah.
3. Doakan untuk persiapan Women's Breakthrough 2026 yang diadakan pada tanggal 11-13 September 2026. Doakan untuk persiapan panitia dan para pembicara. Kiranya Tuhan yang menggerakan hati jemaat agar banyak para wanita yang terberkati lewat Breakthrough tahun ini.
4. Doakan untuk persiapan Raker 2027 yang akan dilaksanakan pada bulan November 2026. Mohon Tuhan memberikan hikmat kepada setiap pengurus ministry agar dapat menyusun program kerja di tahun depan.
5. Doakan untuk kesatuan hati para hamba Tuhan dan majelis agar dapat bergandeng tangan mengembangkan setiap pelayanan yang Tuhan percayakan, serta memuridkan setiap jemaat Tuhan.`,
    doa_misi: 'Gorontalo: Berdoa bagi orang percaya dan para pelayan Tuhan di Gorontalo agar diberikan keberanian untuk menjadi saksi Kristus melalui kehidupan, kasih, dan kesetiaan mereka.',
    doa_penutup: ''
  });
}

// ---- data awal (hanya jika tabel masih kosong) ----
if (!db.prepare('SELECT COUNT(*) c FROM berita').get().c) { // CONTOH, ganti lewat admin
  const insB = db.prepare('INSERT INTO berita (tanggal, judul, ringkasan, gambar, isi) VALUES (?,?,?,?,?)');
  [['2026-10-04', 'Contoh: HUT GKKK-PEKANBARU ke-60', 'Contoh berita. Ganti lewat admin: buka halaman Berita, tekan "+ Tambah berita".',
    'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=1200\nhttps://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200\nhttps://images.unsplash.com/photo-1511632765486-a01980e01a18?w=1200',
    'Contoh isi berita. Tulis paragraf pertama di sini.\n\nPemisah paragraf cukup satu baris kosong.'],
   ['2026-09-20', 'Contoh: Kebaktian FtNYouth', 'Contoh berita kedua, untuk menguji grid dan tanggal yang lebih lama.',
    'https://images.unsplash.com/photo-1478147427282-58a87a120781?w=1200\nhttps://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=1200',
    'Contoh isi berita kedua.'],
   ['2026-09-13', 'Contoh: Retreat PW', 'Contoh berita ketiga.',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200',
    'Contoh isi berita ketiga.'],
   ['2026-09-06', 'Contoh: Peresmian Kelas Anak', 'Contoh berita keempat.',
    '',
    'Contoh isi berita keempat, tanpa foto.']
  ].forEach(r => insB.run(...r));
}

// cadangan database (maks. sekali per jam, simpan 30 terakhir)
let lastBackup = 0;
function backup() {
  if (Date.now() - lastBackup < 3600e3) return;
  lastBackup = Date.now();
  const f = path.join(BACKUPS, 'gkkk-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sqlite');
  db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
  const all = fs.readdirSync(BACKUPS).sort();
  all.slice(0, Math.max(0, all.length - 30)).forEach(x => fs.unlinkSync(path.join(BACKUPS, x)));
}

module.exports = { db, backup };
