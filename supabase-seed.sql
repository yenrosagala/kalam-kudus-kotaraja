-- =====================================================================
--  Data awal (seed) - jalankan SETELAH supabase-migration.sql
--  Sama persis dengan seed di db.js (versi SQLite), supaya situsnya
--  tidak kosong saat pertama kali online.
--
--  Aman dijalankan ulang: tidak akan dobel.
-- =====================================================================

-- JADWAL ---------------------------------------------------------------
INSERT INTO public.jadwal_komisi (tanggal, tipe, komisi, jenis_ibadah, judul, tempat, waktu)
SELECT v.tanggal::date, v.tipe, v.komisi, v.jenis_ibadah, v.judul, v.tempat, v.waktu
FROM (VALUES
  ('2026-10-11','KU',    'Kebaktian Umum','Kebaktian Umum','Contoh Kebaktian Umum','GKKK Kotaraja','09.30 WIT'),
  ('2026-10-18','KU',    'Kebaktian Umum','Kebaktian Umum','Contoh Kebaktian Umum','GKKK Kotaraja','09.30 WIT'),
  ('2026-10-11','KOMISI','Pemuda','','Contoh jadwal Pemuda','GKKK Kotaraja',''),
  ('2026-10-18','KOMISI','Remaja','','Contoh jadwal Remaja','GKKK Kotaraja',''),
  ('2026-10-14','KOMISI','PW','','Contoh jadwal Persekutuan Wanita','GKKK Kotaraja',''),
  ('2026-10-16','KOMISI','PKP','','Contoh jadwal Persekutuan Kaum Pria','GKKK Kotaraja','')
) AS v(tanggal, tipe, komisi, jenis_ibadah, judul, tempat, waktu)
WHERE NOT EXISTS (SELECT 1 FROM public.jadwal_komisi);

-- MEZBAH ---------------------------------------------------------------
INSERT INTO public.mezbah
  (tanggal, judul, tema, bacaan, ayat, renungan, pesan, refleksi, doa_gkkk, doa_misi, doa_penutup)
SELECT
  '2026-09-08'::date,
  'JANGAN HANYA MENDENGAR PANGGILAN',
  'Mari, Ikutlah Aku',
  'Matius 4:18-22',
  'Matius 4:20',
  $t$“Lalu mereka pun segera meninggalkan jalanya dan mengikuti Dia.”

Petrus dan Andreas tidak hanya mendengar panggilan Yesus. Mereka merespons. Ada perbedaan besar antara mendengar dan melakukan. Kita dapat mendengar Firman setiap Minggu, membaca Alkitab, mengikuti persekutuan, bahkan mengetahui banyak ajaran Kristen, tetapi pertanyaannya adalah: Apa yang kita lakukan setelah mendengarnya?

Petrus dan Andreas tidak berkata, “Tuhan, nanti kalau ada waktu.” Mereka merespons panggilan Kristus.
Dalam kehidupan kita, mungkin Tuhan sudah berkali-kali mengingatkan untuk mengampuni, meninggalkan dosa, memperbaiki hubungan, mulai melayani, lebih sungguh berdoa, atau kembali hidup dekat dengan-Nya. Jangan terus berkata “nanti”.$t$,
  'Panggilan Tuhan membutuhkan respons. Iman yang hanya didengar tetapi tidak ditaati tidak akan membawa kita berjalan lebih jauh bersama Kristus.',
  'Adakah sesuatu yang sudah lama Tuhan minta saya lakukan tetapi terus saya tunda?',
  $t$GKKK PEKANBARU

1. Doakan untuk setiap leader dan anggota CROSS agar tetap solid. Kiranya melalui CROSS, mereka dapat bertumbuh dan lebih mengasihi Tuhan.
2. Doakan untuk persiapan HUT GKKK Pekanbaru ke-60 tahun yang akan dilaksanakan pada tanggal 4 Oktober 2026. Melalui acara Anniversary ini kiranya setiap jemaat dapat melihat penyertaan Allah bagi gereja-Nya, dan semakin giat mengerjakan visi Allah.
3. Doakan untuk persiapan Women's Breakthrough 2026 yang diadakan pada tanggal 11-13 September 2026. Doakan untuk preparation panitia dan para pembicara. Kiraya Tuhan yang menggerakan hati jemaat agar banyak para wanita yang terberkati lewat Breakthrough tahun ini.
4. Doakan untuk persiapan Raker 2027 yang akan dilaksanakan pada bulan November 2026. Mohon Tuhan memberikan hikmat kepada setiap pengurus ministry agar dapat menyusun program kerja di tahun depan.
5. Doakan untuk kesatuan hati para hamba Tuhan dan majelis agar dapat bergandeng tangan mengembangkan setiap pelayanan yang Tuhan percayakan, serta memuridkan setiap jemaat Tuhan.$t$,
  'Gorontalo: Berdoa bagi orang percaya dan para pelayan Tuhan di Gorontalo agar diberikan keberanian untuk menjadi saksi Kristus melalui kehidupan, kasih, dan kesetiaan mereka.',
  ''
WHERE NOT EXISTS (SELECT 1 FROM public.mezbah);

-- BERITA ---------------------------------------------------------------
INSERT INTO public.berita (tanggal, judul, ringkasan, gambar, isi)
SELECT v.tanggal::date, v.judul, v.ringkasan, v.gambar, v.isi
FROM (VALUES
  ('2026-10-04','Contoh: HUT GKKK-PEKANBARU ke-60','Contoh berita. Ganti lewat admin: buka halaman Berita, tekan "+ Tambah berita".',
   E'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=1200\nhttps://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200\nhttps://images.unsplash.com/photo-1511632765486-a01980e01a18?w=1200',
   'Contoh isi berita. Tulis paragraf pertama di sini.\n\nPemisah paragraf cukup satu baris kosong.'),
  ('2026-09-20','Contoh: Kebaktian FtNYouth','Contoh berita kedua, untuk menguji grid dan tanggal yang lebih lama.',
   E'https://images.unsplash.com/photo-1478147427282-58a87a120781?w=1200\nhttps://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=1200',
   'Contoh isi berita kedua.'),
  ('2026-09-13','Contoh: Retreat PW','Contoh berita ketiga.',
   'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200',
   'Contoh isi berita ketiga.'),
  ('2026-09-06','Contoh: Peresmian Kelas Anak','Contoh berita keempat, tanpa foto.',
   '',
   'Contoh isi berita keempat, tanpa foto.')
) AS v(tanggal, judul, ringkasan, gambar, isi)
WHERE NOT EXISTS (SELECT 1 FROM public.berita);

-- verifikasi -----------------------------------------------------------
SELECT 'jadwal_komisi' AS tabel, count(*) FROM public.jadwal_komisi
UNION ALL SELECT 'mezbah',        count(*) FROM public.mezbah
UNION ALL SELECT 'berita',        count(*) FROM public.berita;