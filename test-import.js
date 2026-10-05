// Cek impor CSV: parser, upsert tanpa duplikat, laporan baris gagal.
// Jalankan: node test-import.js   (server diuji di port/db terpisah, data asli tidak tersentuh)
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const PORT = 3999, PASS = 'test-pass-123', BOM = '\uFEFF';
const BASE = `http://127.0.0.1:${PORT}`;
const TMP_DB = path.join(os.tmpdir(), 'gkkk-import-test-' + process.pid + '.sqlite');
const ok = [], bad = [];
const step = (name, fn) => {
  try { fn(); ok.push(name); console.log(`  PASS  ${name}`); }
  catch (e) { bad.push(name); console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

let srv;                    // di scope modul: finally di luar IIFE tidak bisa melihat const di dalam
let err = '';
srv = spawn(process.execPath, ['server.js'], {
  cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(PORT), ADMIN_PASSWORD: PASS, SESSION_SECRET: 'test-secret', DB_FILE: TMP_DB }
});
srv.stderr.on('data', d => err += d);

const j = async (u, o = {}) => {
  const r = await fetch(BASE + u, {
    method: o.method || 'GET',
    body: o.body ? JSON.stringify(o.body) : undefined,
    headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}) }
  });
  const raw = Buffer.from(await r.arrayBuffer());     // byte asli: text() akan stripping BOM
  let b; try { b = JSON.parse(raw.toString('utf8')); } catch { b = raw.toString('utf8'); }
  return { status: r.status, body: b, raw, headers: r.headers };
};

(async () => {
  for (const f of [TMP_DB, TMP_DB + '-wal', TMP_DB + '-shm']) fs.rmSync(f, { force: true });
  for (const f of [TMP_DB, TMP_DB + '-wal', TMP_DB + '-shm']) fs.rmSync(f, { force: true });

  let up = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await j('/api/komisi')).status === 200) { up = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  if (!up) { console.log('server tidak mau start'); console.log(err); process.exit(1); }

  // db.js mengisi data contoh saat tabel kosong, jadi semua hitungan dibuat relatif terhadap baseline
  console.log('\n1. gerbang login');
  let r = await j('/api/template/jadwal');
  step('GET /api/template/jadwal -> 401 tanpa sesi', () => assert.strictEqual(r.status, 401));
  r = await j('/api/import/jadwal', { method: 'POST', body: { csv: 'tanggal,judul\n' } });
  step('POST /api/import/jadwal -> 401 tanpa sesi', () => assert.strictEqual(r.status, 401));
  r = await j('/api/login', { method: 'POST', body: { password: 'salah' } });
  step('login dengan sandi salah -> 401', () => assert.strictEqual(r.status, 401));
  r = await j('/api/login', { method: 'POST', body: { password: PASS } });
  step('login dengan sandi benar -> 200', () => assert.strictEqual(r.status, 200));
  const setc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')];
  const sid = String(setc[0]).split(';')[0];
  step('cookie sid terbit dan httpOnly', () => {
    assert.ok(sid.startsWith('sid='), 'cookie sid tidak ada');
    assert.ok(/HttpOnly/i.test(setc[0]), 'cookie tidak httpOnly');
  });
  const cookie = { cookie: sid };
  const base = (await j('/api/mezbah/daftar', cookie)).body.length;

  console.log('\n2. template');
  for (const [jenis, cols, fname] of [
    ['jadwal', 'tanggal,tipe,komisi,jenis_ibadah,judul,teks,nats_pembimbing,pelayan_firman,liturgis,tuan_rumah,tempat,waktu,status,tujuan', 'template-jadwal.csv'],
    ['mezbah', 'tanggal,judul,tema,bacaan,ayat,renungan,pesan,refleksi,doa_gkkk,doa_misi,doa_penutup', 'template-renungan.csv']
  ]) {
    r = await j(`/api/template/${jenis}`, cookie);
    step(`template ${jenis}: BOM + header + nama berkas`, () => {
      assert.strictEqual(r.status, 200);
      assert.ok(/text\/csv/.test(r.headers.get('content-type')), 'bukan text/csv');
      assert.ok(r.headers.get('content-disposition').includes(fname), 'nama berkas salah');
      assert.deepStrictEqual([...r.raw.subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'BOM UTF-8 hilang -> Excel salah baca karakter');
      const lines = r.raw.toString('utf8').replace(BOM, '').trim().split('\r\n');
      assert.strictEqual(lines[0], cols, 'header tidak cocok');
      assert.strictEqual(lines.length, 2, 'template harus header + 1 baris contoh');
    });
  }

  console.log('\n3. parser CSV (koma, kutip, newline di dalam sel)');
  const nasty = BOM + [
    'tanggal,judul,tema,bacaan,ayat,renungan,pesan,refleksi,doa_gkkk,doa_misi,doa_penutup',
    '2026-11-08,"Judul, dengan koma","Tema ""kutip"" di dalam",Lukas 10:21-24,Lukas 10:24,"Baris satu\nBaris dua, masih koma\nBaris tiga",Pesan.,Refleksi.,Doa.,Misi.,Penutup.'
  ].join('\r\n');
  r = await j('/api/import/mezbah', { method: 'POST', body: { csv: nasty }, ...cookie });
  step('impor 1 baris nasty -> added:1 updated:0 errorCount:0', () => {
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual({ a: r.body.added, u: r.body.updated, e: r.body.errorCount }, { a: 1, u: 0, e: 0 });
  });
  r = await j('/api/mezbah/2026-11-08', cookie);
  step('isi sel multi-baris / berkoma / berkutip utuh setelah disimpan', () => {
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.judul, 'Judul, dengan koma');
    assert.strictEqual(r.body.tema, 'Tema "kutip" di dalam');
    assert.strictEqual(r.body.renungan, 'Baris satu\nBaris dua, masih koma\nBaris tiga');
  });

  console.log('\n4. impor ulang = perbarui, bukan menggandakan');
  let n1 = (await j('/api/mezbah/daftar', cookie)).body.length;
  step('baseline + 1', () => assert.strictEqual(n1, base + 1));
  r = await j('/api/import/mezbah', { method: 'POST', body: { csv: nasty }, ...cookie });
  step('impor kedua -> updated:1 added:0', () =>
    assert.deepStrictEqual({ a: r.body.added, u: r.body.updated }, { a: 0, u: 1 }));
  let n2 = (await j('/api/mezbah/daftar', cookie)).body.length;
  step('jumlah entri tetap sama (tidak ada duplikat)', () => assert.strictEqual(n2, n1));

  console.log('\n5. baris salah dilaporkan, baris lain tetap masuk');
  const kcsv = [
    'tanggal,tipe,judul,tempat',            // subset kolom: kolom opsional boleh tidak ada
    '2026-12-06,KU,Ibadah Natal,GKKK Kotaraja',
    'bukan-tanggal,KU,Judul Buruk,'
  ].join('\r\n');
  r = await j('/api/import/jadwal', { method: 'POST', body: { csv: kcsv }, ...cookie });
  step('1 valid + 1 tidak valid -> added:1 errorCount:1', () =>
    assert.deepStrictEqual({ a: r.body.added, u: r.body.updated, e: r.body.errorCount }, { a: 1, u: 0, e: 1 }));
  step('nomor baris error = 3 (header=1, data=2,3)', () =>
    assert.strictEqual(r.body.errors[0].baris, 3));
  step('pesan error menyebut penyebabnya', () =>
    assert.ok(/tanggal/i.test(r.body.errors[0].pesan), 'pesan tidak jelas: ' + r.body.errors[0].pesan));
  r = await j('/api/komisi', cookie);
  step('baris valid tetap masuk walau baris lain gagal', () => {
    const row = r.body.find(x => x.tanggal === '2026-12-06');
    assert.ok(row, 'baris valid hilang');
    assert.strictEqual(row.judul, 'Ibadah Natal');
  });

  console.log('\n6. header salah ditolak dengan jelas');
  r = await j('/api/import/mezbah', { method: 'POST', body: { csv: 'a,b,c\n1,2,3' }, ...cookie });
  step('header tanpa kolom wajib -> 400 + sebut kolomnya', () => {
    assert.strictEqual(r.status, 400);
    assert.ok(/tanggal/.test(r.body.error), 'tidak menyebut kolom kurang: ' + r.body.error);
  });
  r = await j('/api/import/jadwal', { method: 'POST', body: { csv: 'tanggal,judul' }, ...cookie });
  step('hanya baris judul -> 400', () => assert.strictEqual(r.status, 400));
  r = await j('/api/import/jadwal', { method: 'POST', body: { csv: '' }, ...cookie });
  step('csv kosong -> 400', () => assert.strictEqual(r.status, 400));
  r = await j('/api/import/bogus', { method: 'POST', body: { csv: 'tanggal,judul' }, ...cookie });
  step('jenis tidak dikenal -> 404', () => assert.strictEqual(r.status, 404));
})().finally(async () => {
  srv.kill();
  await new Promise(r => srv.on('exit', r));   // tunggu server benar-benar melepas file db
  for (const f of [TMP_DB, TMP_DB + '-wal', TMP_DB + '-shm']) { try { fs.rmSync(f, { force: true }); } catch {} }
  console.log(`\n${ok.length} lulus, ${bad.length} gagal`);
  if (err.trim()) console.log('stderr server:\n' + err.trim().split('\n').slice(0, 8).map(l => '  ' + l).join('\n'));
  if (bad.length) process.exit(1);
});