const express = require('express');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!PASS) { console.error('Set ADMIN_PASSWORD terlebih dahulu.'); process.exit(1); }

const { db, backup } = require('./db');

const sha = (x) => crypto.createHash('sha256').update(String(x)).digest();
const sign = (x) => crypto.createHmac('sha256', SECRET).update(x).digest('hex');

// --- sesi: cookie "exp.signature", berlaku 8 jam ---
function makeToken() { const exp = Date.now() + 8 * 3600e3; return exp + '.' + sign(String(exp)); }
function validToken(tok) {
  if (!tok) return false;
  const [exp, sig] = tok.split('.');
  return !!sig && Number(exp) > Date.now() &&
    crypto.timingSafeEqual(Buffer.from(sig.padEnd(64, '0').slice(0, 64)), Buffer.from(sign(exp)));
}
function cookie(req, name) {
  const m = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}
const needAdmin = (req, res, next) => validToken(cookie(req, 'sid')) ? next() : res.status(401).json({ error: 'Belum login.' });

// --- batas percobaan login ---
const tries = new Map();
function limited(ip) {
  const now = Date.now(), r = tries.get(ip) || { n: 0, reset: now + 15 * 60e3 };
  if (now > r.reset) { r.n = 0; r.reset = now + 15 * 60e3; }
  r.n++; tries.set(ip, r); return r.n > 10;
}

// --- validasi: menolak, bukan membuang diam-diam ---
const FIELDS = { judul: 200, tema: 200, bacaan: 200, ayat: 200, renungan: 10000, pesan: 3000, refleksi: 3000, doa_gkkk: 10000, doa_misi: 5000, doa_penutup: 3000 };
function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
function cleanMezbah(tanggal, b) {
  if (!validDate(tanggal)) throw 'Tanggal tidak valid (format YYYY-MM-DD).';
  const r = { tanggal };
  for (const [k, max] of Object.entries(FIELDS)) {
    let v = String(b[k] ?? '').replace(/\r\n/g, '\n').trim();
    if (v === '-') v = '';
    if (v.length > max) throw `Kolom ${k} terlalu panjang (maks. ${max} karakter).`;
    r[k] = v;
  }
  if (!r.judul) throw 'Judul wajib diisi.';
  if (!r.renungan) throw 'Renungan wajib diisi.';
  return r;
}
const BF = { judul: 200, ringkasan: 600, isi: 20000, gambar: 4000 };
// foto berita: satu URL per baris. Hanya http(s) atau path internal yang diterima supaya
// admin tidak bisa menyisipkan skema lain (mis. data:) lewat kolom ini.
const imgOK = (u) => /^(https?:\/\/|\/)/.test(u);
function cleanBerita(b) {
  const tanggal = String(b.tanggal || '').trim();
  if (!validDate(tanggal)) throw 'Tanggal tidak valid (format YYYY-MM-DD).';
  const r = { tanggal };
  for (const [k, max] of Object.entries(BF)) {
    const v = String(b[k] ?? '').replace(/\r\n/g, '\n').trim();
    if (v.length > max) throw `Kolom ${k} terlalu panjang (maks. ${max} karakter).`;
    r[k] = v;
  }
  if (!r.judul) throw 'Judul wajib diisi.';
  if (!r.isi) throw 'Isi berita wajib diisi.';
  const foto = [...new Set(r.gambar.split('\n').map(s => s.trim()).filter(imgOK))];
  if (foto.length > 12) throw 'Maksimal 12 foto per berita.';
  r.gambar = foto.join('\n');
  return r;
}

const KF = { komisi: 40, jenis_ibadah: 80, tuan_rumah: 120, liturgis: 120, pelayan_firman: 120, judul: 200, teks: 200, nats_pembimbing: 200, tujuan: 3000, tempat: 120, waktu: 40 };
function cleanKomisi(b) {
  const tanggal = String(b.tanggal || '').trim();
  if (!validDate(tanggal)) throw 'Tanggal tidak valid (format YYYY-MM-DD).';
  const r = { tanggal };
  for (const [k, max] of Object.entries(KF)) {
    const v = String(b[k] ?? '').trim();
    if (v.length > max) throw `Kolom ${k} terlalu panjang (maks. ${max} karakter).`;
    r[k] = v;
  }
  r.tipe = b.tipe === 'KU' ? 'KU' : 'KOMISI';
  if (r.tipe === 'KU') { r.komisi = 'Kebaktian Umum'; r.tuan_rumah = ''; if (!r.jenis_ibadah) r.jenis_ibadah = 'Kebaktian Umum'; }
  if (!r.komisi) throw 'Komisi wajib diisi.';
  if (!r.judul) throw 'Judul wajib diisi.';
  r.status = ['TERJADWAL', 'SELESAI', 'BATAL'].includes(b.status) ? b.status : 'TERJADWAL';
  return r;
}

// jadwal tidak punya UNIQUE(tanggal, komisi), jadi upsert dihitung manual lewat kunci alami
function saveKomisi(r) {
  const cols = Object.keys(r);
  const hit = db.prepare('SELECT id FROM jadwal_komisi WHERE tanggal = ? AND komisi = ?').get(r.tanggal, r.komisi);
  if (hit) {
    db.prepare(`UPDATE jadwal_komisi SET ${cols.map(c => `${c}=@${c}`).join(',')}, diubah=datetime('now') WHERE id=@id`).run({ ...r, id: hit.id });
    return 'diperbarui';
  }
  db.prepare(`INSERT INTO jadwal_komisi (${cols.join(',')}) VALUES (${cols.map(c => '@' + c).join(',')})`).run(r);
  return 'ditambah';
}
// tanggal sudah jadi PRIMARY KEY di tabel mezbah
function saveMezbah(r) {
  const cols = Object.keys(r);
  const ada = db.prepare('SELECT 1 FROM mezbah WHERE tanggal = ?').get(r.tanggal);
  db.prepare(`INSERT INTO mezbah (${cols.join(',')}, diubah) VALUES (${cols.map(c => '@' + c).join(',')}, datetime('now'))
    ON CONFLICT(tanggal) DO UPDATE SET ${cols.filter(c => c !== 'tanggal').map(c => `${c}=excluded.${c}`).join(',')}, diubah=datetime('now')`).run(r);
  return ada ? 'diperbarui' : 'ditambah';
}
const todayWIT = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jayapura' }).format(new Date());

const app = express();
// CSV bulk bisa jauh lebih besar dari JSON biasa. body-parser hanya membaca stream sekali,
// jadi parser besar dipasang di /api/import dulu; parser umum lalu melewati yang sudah terisi.
app.use('/api/import', express.json({ limit: '8mb' }));
app.use(express.json({ limit: '300kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); });

// ---- jadwal ibadah komisi ----
app.get('/api/komisi', (req, res) =>
  res.json(db.prepare('SELECT * FROM jadwal_komisi ORDER BY tanggal DESC, komisi').all()));
app.post('/api/komisi', needAdmin, (req, res) => {
  let r; try { r = cleanKomisi(req.body || {}); } catch (e) { return res.status(400).json({ error: String(e) }); }
  backup();
  const cols = Object.keys(r);
  const id = db.prepare(`INSERT INTO jadwal_komisi (${cols.join(',')}) VALUES (${cols.map(c => '@' + c).join(',')})`).run(r).lastInsertRowid;
  res.json(db.prepare('SELECT * FROM jadwal_komisi WHERE id = ?').get(id));
});
app.put('/api/komisi/:id', needAdmin, (req, res) => {
  let r; try { r = cleanKomisi(req.body || {}); } catch (e) { return res.status(400).json({ error: String(e) }); }
  backup();
  r.id = +req.params.id;
  const set = Object.keys(r).filter(c => c !== 'id').map(c => `${c}=@${c}`).join(',');
  const n = db.prepare(`UPDATE jadwal_komisi SET ${set}, diubah=datetime('now') WHERE id=@id`).run(r).changes;
  n ? res.json(db.prepare('SELECT * FROM jadwal_komisi WHERE id = ?').get(r.id)) : res.status(404).json({ error: 'Tidak ditemukan.' });
});
app.delete('/api/komisi/:id', needAdmin, (req, res) => {
  backup();
  db.prepare('DELETE FROM jadwal_komisi WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
});

// ---- mezbah keluarga ----
app.get('/api/mezbah/daftar', (req, res) =>
  res.json(db.prepare('SELECT tanggal, judul, tema, bacaan, ayat FROM mezbah ORDER BY tanggal DESC LIMIT 400').all()));
app.get('/api/mezbah/hari-ini', (req, res) => {
  const t = todayWIT();
  const row = db.prepare('SELECT * FROM mezbah WHERE tanggal = ?').get(t)
    || db.prepare('SELECT * FROM mezbah WHERE tanggal <= ? ORDER BY tanggal DESC LIMIT 1').get(t)
    || db.prepare('SELECT * FROM mezbah ORDER BY tanggal DESC LIMIT 1').get();
  row ? res.json(row) : res.status(404).json({ error: 'Belum ada renungan.' });
});
app.get('/api/mezbah/:tanggal', (req, res) => {
  const row = db.prepare('SELECT * FROM mezbah WHERE tanggal = ?').get(req.params.tanggal);
  row ? res.json(row) : res.status(404).json({ error: 'Renungan tidak ditemukan.' });
});
app.put('/api/mezbah/:tanggal', needAdmin, (req, res) => {
  let r; try { r = cleanMezbah(req.params.tanggal, req.body || {}); } catch (e) { return res.status(400).json({ error: String(e) }); }
  backup();
  saveMezbah(r);
  res.json(db.prepare('SELECT * FROM mezbah WHERE tanggal = ?').get(r.tanggal));
});
app.delete('/api/mezbah/:tanggal', needAdmin, (req, res) => {
  backup();
  db.prepare('DELETE FROM mezbah WHERE tanggal = ?').run(req.params.tanggal);
  res.json({ ok: true });
});

// ---- berita / newsletter: daftar, rincian (carousel foto), dan CRUD admin ----
const B_LIST = 'SELECT id, tanggal, judul, ringkasan, gambar FROM berita ORDER BY tanggal DESC, id DESC';
const satuBerita = (id) => db.prepare('SELECT * FROM berita WHERE id = ?').get(id);
const simpanBerita = (r) => db.prepare(`INSERT INTO berita (tanggal, judul, ringkasan, gambar, isi) VALUES (@tanggal, @judul, @ringkasan, @gambar, @isi)`).run(r);

app.get('/api/berita', (req, res) => res.json(db.prepare(B_LIST).all()));
app.get('/api/berita/:id', (req, res) => {
  const row = satuBerita(req.params.id);
  row ? res.json(row) : res.status(404).json({ error: 'Berita tidak ditemukan.' });
});
app.post('/api/berita', needAdmin, (req, res) => {
  let r; try { r = cleanBerita(req.body || {}); } catch (e) { return res.status(400).json({ error: String(e) }); }
  backup();
  const info = simpanBerita(r);
  res.json(satuBerita(info.lastInsertRowid));
});
app.put('/api/berita/:id', needAdmin, (req, res) => {
  let r; try { r = cleanBerita(req.body || {}); } catch (e) { return res.status(400).json({ error: String(e) }); }
  if (!satuBerita(req.params.id)) return res.status(404).json({ error: 'Tidak ditemukan.' });
  backup();
  db.prepare('UPDATE berita SET tanggal=@tanggal, judul=@judul, ringkasan=@ringkasan, gambar=@gambar, isi=@isi, diubah=datetime(\'now\') WHERE id=@id').run({ ...r, id: req.params.id });
  res.json(satuBerita(req.params.id));
});
app.delete('/api/berita/:id', needAdmin, (req, res) => {
  backup();
  db.prepare('DELETE FROM berita WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- impor massal dari CSV ----
// .xlsx asli itu zip berisi XML dan butuh pustaka; CSV tetap bisa dibuka/diedit Excel tanpa dependensi baru.
const BOM = '\uFEFF';
const csvCell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csvRow = (cells) => cells.map(csvCell).join(',');

// parser RFC4180: koma & newline di dalam kutip, tanda kutip terescap, CRLF, dan BOM Excel
function parseCSV(text) {
  const s = String(text).replace(/^\uFEFF/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c !== '"') f += c; else if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else f += c;
  }
  if (row.length || f !== '') {
    row.push(f);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

const K_COLS = ['tanggal', 'tipe', 'komisi', 'jenis_ibadah', 'judul', 'teks', 'nats_pembimbing', 'pelayan_firman', 'liturgis', 'tuan_rumah', 'tempat', 'waktu', 'status', 'tujuan'];
const M_COLS = ['tanggal', 'judul', 'tema', 'bacaan', 'ayat', 'renungan', 'pesan', 'refleksi', 'doa_gkkk', 'doa_misi', 'doa_penutup'];
const SPECS = {
  jadwal: {
    cols: K_COLS, need: ['tanggal', 'judul'], file: 'template-jadwal.csv',
    contoh: { tanggal: '2026-11-08', tipe: 'KU', komisi: '', jenis_ibadah: 'Kebaktian Umum', judul: 'Judul kebaktian', teks: 'Matius 5:1-12', nats_pembimbing: '', pelayan_firman: 'Pdt. Nama', liturgis: '', tuan_rumah: '', tempat: 'GKKK Kotaraja', waktu: '09.30 WIT', status: 'TERJADWAL', tujuan: '' },
    clean: cleanKomisi, save: saveKomisi
  },
  mezbah: {
    cols: M_COLS, need: ['tanggal', 'judul', 'renungan'], file: 'template-renungan.csv',
    contoh: { tanggal: '2026-11-08', judul: 'Judul renungan', tema: 'Tema minggu ini', bacaan: 'Lukas 10:21-24', ayat: 'Lukas 10:24', renungan: 'Tulis isi renungan di sini.', pesan: 'Pesan singkat hari ini.', refleksi: 'Pertanyaan untuk keluarga.', doa_gkkk: 'Pokok doa keluarga besar GKKK.', doa_misi: 'Pokok doa misi.', doa_penutup: '' },
    clean: (b) => cleanMezbah(b.tanggal, b), save: saveMezbah
  }
};

app.get('/api/template/:jenis', needAdmin, (req, res) => {
  const s = SPECS[req.params.jenis];
  if (!s) return res.status(404).json({ error: 'Jenis tidak dikenal.' });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${s.file}"`);
  res.send(BOM + [csvRow(s.cols), csvRow(s.cols.map(c => s.contoh[c] ?? ''))].join('\r\n'));
});

app.post('/api/import/:jenis', needAdmin, (req, res) => {
  const s = SPECS[req.params.jenis];
  if (!s) return res.status(404).json({ error: 'Jenis tidak dikenal.' });

  const rows = parseCSV((req.body || {}).csv || '');
  if (rows.length < 2) return res.status(400).json({ error: 'CSV hanya berisi baris judul, tidak ada data.' });

  // kolom dibaca dari baris judul, bukan urutan, jadi admin bebas menukar kolom
  const head = rows[0].map(h => h.trim().toLowerCase());
  const at = {};
  head.forEach((h, i) => { if (s.cols.includes(h) && at[h] === undefined) at[h] = i; });
  const kurang = s.need.filter(k => at[k] === undefined);
  if (kurang.length) return res.status(400).json({ error: `Kolom wajib belum ada di baris judul: ${kurang.join(', ')}` });

  // validasi semua baris dulu: satu baris salah tidak boleh membatalkan sisanya
  const good = [], errors = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.every(c => !c.trim())) continue;
    const body = {};
    s.cols.forEach(c => { body[c] = at[c] === undefined ? '' : (cells[at[c]] ?? ''); });
    try { good.push(s.clean(body)); }
    catch (e) { errors.push({ baris: i + 1, pesan: String(e) }); }
  }
  if (!good.length && !errors.length) return res.status(400).json({ error: 'Tidak ada baris data di CSV.' });

  let added = 0, updated = 0;
  backup();
  db.transaction((list) => { for (const r of list) { if (s.save(r) === 'ditambah') added++; else updated++; } })(good);

  res.json({ ok: true, total: good.length + errors.length, added, updated, errorCount: errors.length, errors: errors.slice(0, 50) });
});

// ---- login ----
app.post('/api/login', (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
  const ok = crypto.timingSafeEqual(sha(req.body && req.body.password), sha(PASS));
  if (!ok) return res.status(401).json({ error: 'Kata sandi salah.' });
  tries.delete(req.ip);
  res.cookie('sid', makeToken(), { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 8 * 3600e3 });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { res.clearCookie('sid'); res.json({ ok: true }); });
app.get('/api/me', needAdmin, (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log('Berjalan di http://localhost:' + PORT));
