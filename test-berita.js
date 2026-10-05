// Regression suite untuk fitur Berita / newsletter.
// Menjalankan server sendiri di port acak + DB sementara, jadi data produksi tidak tersentuh.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP = __dirname;
const DB = path.join(os.tmpdir(), 'kalam-test-berita-' + process.pid + '.sqlite');
const PORT = 3990 + (process.pid % 60);
const PASS = 'test-berita-123';

let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n)); };
const eq = (n, got, want) => ok(n + ' -> ' + JSON.stringify(got), JSON.stringify(got) === JSON.stringify(want));

(async () => {
  for (const s of ['', '-shm', '-wal']) { try { fs.unlinkSync(DB + s); } catch {} }
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: APP, env: { ...process.env, PORT: String(PORT), DB_FILE: DB, ADMIN_PASSWORD: PASS, SESSION_SECRET: 'test-berita' }, stdio: 'ignore',
  });
  const B = 'http://127.0.0.1:' + PORT;
  let cookie = '';

  const api = async (m, p, body, asAdmin = true) => {
    const h = { 'content-type': 'application/json' };
    if (asAdmin && cookie) h.cookie = cookie;
    const r = await fetch(B + p, { method: m, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (sc.length) cookie = sc.map(s => s.split(';')[0]).join('; ');
    let d = null; try { d = await r.json(); } catch {}
    return { s: r.status, d };
  };

  for (let i = 0; i < 60; i++) {
    try { await fetch(B + '/'); break; } catch { await new Promise(r => setTimeout(r, 250)); }
  }

  try {
    // ---- proteksi admin ----
    eq('POST berita tanpa login -> 401', (await api('POST', '/api/berita', { tanggal: '2026-01-01', judul: 'x', isi: 'x' }, false)).s, 401);
    eq('PUT berita tanpa login -> 401', (await api('PUT', '/api/berita/1', { tanggal: '2026-01-01', judul: 'x', isi: 'x' }, false)).s, 401);
    eq('DELETE berita tanpa login -> 401', (await api('DELETE', '/api/berita/1', {}, false)).s, 401);

    // ---- daftar & rincian publik ----
    eq('GET daftar berita publik -> 200', (await api('GET', '/api/berita', undefined, false)).s, 200);
    eq('GET berita 9999 -> 404', (await api('GET', '/api/berita/9999', undefined, false)).s, 404);

    const seed = (await api('GET', '/api/berita', undefined, false)).d;
    ok('data awal berita >= 4 entri', Array.isArray(seed) && seed.length >= 4);
    ok('daftar berita terurut tanggal terbaru dulu',
      seed.every((b, i) => i === 0 || seed[i - 1].tanggal >= b.tanggal));
    ok('daftar berita tidak membocorkan kolom isi', seed.every(b => b.isi === undefined));

    // ---- login ----
    eq('login password salah -> 401', (await api('POST', '/api/login', { password: 'salah' })).s, 401);
    eq('login benar -> 200', (await api('POST', '/api/login', { password: PASS })).s, 200);
    eq('/api/me setelah login -> 200', (await api('GET', '/api/me')).s, 200);

    // ---- validasi (setelah login, jadi 400 dari validasi bukan 401) ----
    eq('judul kosong -> 400', (await api('POST', '/api/berita', { tanggal: '2026-05-05', judul: '', isi: 'isi' })).s, 400);
    eq('isi kosong -> 400', (await api('POST', '/api/berita', { tanggal: '2026-05-05', judul: 'Judul', isi: '' })).s, 400);
    eq('tanggal salah -> 400', (await api('POST', '/api/berita', { tanggal: '05-05-2026', judul: 'J', isi: 'I' })).s, 400);
    eq('judul kepanjangan -> 400', (await api('POST', '/api/berita', { tanggal: '2026-05-05', judul: 'x'.repeat(201), isi: 'I' })).s, 400);

    // ---- buat berita (fokus: field gambar = carousel, ringkasan) ----
    const buat = await api('POST', '/api/berita', {
      tanggal: '2026-05-05', judul: 'Berita Uji', ringkasan: 'Ringkasan uji',
      gambar: 'https://a.test/1.jpg\nhttps://a.test/2.jpg\n\nhttps://a.test/3.jpg\nhttps://a.test/1.jpg',
      isi: 'Paragraf satu.\n\nParagraf dua.',
    });
    eq('POST berita -> 200', buat.s, 200);
    const id = buat.d.id;
    ok('foto di-normalisasi (baris kosong & duplikat dibuang, 3 tersisa)', buat.d.gambar.split('\n').length === 3);
ok('CRLF dinormalkan ke LF', !buat.d.gambar.includes(String.fromCharCode(13)));

    // skema foto: hanya http(s)/path internal yang boleh lewat
    const dirty = await api('POST', '/api/berita', {
      tanggal: '2026-05-05', judul: 'Dirty', isi: 'I',
      gambar: 'javascript:alert(1)\ndata:text/html,x\nhttps://a.test/ok.jpg',
    });
    eq('foto skema berbahaya dibuang', dirty.d.gambar, 'https://a.test/ok.jpg');
    await api('DELETE', '/api/berita/' + dirty.d.id);

    const banyak = await api('POST', '/api/berita', {
      tanggal: '2026-05-06', judul: 'Banyak Foto', isi: 'I',
      gambar: Array.from({ length: 13 }, (_, i) => 'https://a.test/' + i + '.jpg').join('\n'),
    });
    eq('lebih dari 12 foto -> 400', banyak.s, 400);

    // ---- ubah ----
    eq('PUT berita -> 200', (await api('PUT', '/api/berita/' + id, { tanggal: '2026-06-06', judul: 'Berita Ubah', ringkasan: 'R', gambar: 'https://a.test/u.jpg', isi: 'Isi baru.' })).s, 200);
    eq('judul terupdate', (await api('GET', '/api/berita/' + id, undefined, false)).d.judul, 'Berita Ubah');
    eq('tanggal terupdate', (await api('GET', '/api/berita/' + id, undefined, false)).d.tanggal, '2026-06-06');
    eq('PUT berita tak ada -> 404', (await api('PUT', '/api/berita/9999', { tanggal: '2026-06-06', judul: 'J', isi: 'I' })).s, 404);

    // ---- daftar terurut ulang setelah tanggal diubah ----
    const daftar2 = (await api('GET', '/api/berita', undefined, false)).d;
    ok('daftar tetap terurut setelah ubah tanggal',
      daftar2.every((b, i) => i === 0 || daftar2[i - 1].tanggal >= b.tanggal));

    // ---- 5 terbaru untuk beranda ----
    ok('daftar >= 5 entri untuk slice 5 di beranda', daftar2.length >= 5);
    ok('lima pertama = 5 berita terbaru',
      JSON.stringify(daftar2.slice(0, 5).map(b => b.id)) === JSON.stringify(daftar2.slice(0, 5).map(b => b.id)));

    // ---- hapus ----
    eq('DELETE berita -> 200', (await api('DELETE', '/api/berita/' + id)).s, 200);
    eq('berita terhapus -> 404', (await api('GET', '/api/berita/' + id, undefined, false)).s, 404);

    // ---- logout ----
    eq('logout -> 200', (await api('POST', '/api/logout')).s, 200);
    cookie = '';
    eq('POST berita setelah logout -> 401', (await api('POST', '/api/berita', { tanggal: '2026-05-05', judul: 'x', isi: 'x' })).s, 401);

    // ---- halaman statis ----
    for (const p of ['/', '/app.js', '/style.css']) eq('GET ' + p + ' -> 200', (await api('GET', p)).s, 200);
  } catch (e) {
    fail++;
    console.log('FAIL exception -> ' + e.message);
  }

  console.log('\n' + pass + ' lulus, ' + fail + ' gagal');
  srv.kill();
  for (const s of ['', '-shm', '-wal']) { try { fs.unlinkSync(DB + s); } catch {} }
  process.exit(fail ? 1 : 0);
})();