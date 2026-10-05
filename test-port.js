// cek logika yang dipindah dari server.js ke browser (parseCSV + validator).
// app.js bukan modul, jadi dimuat lewat vm dengan stub DOM secukupnya lalu
// variabel yang perlu dites dikeluarkan lewat globalThis.
const fs = require('fs'), vm = require('vm'), path = require('path');

const stub = () => new Proxy({}, { get: (t, k) => {
  if (k === 'value') return '';
  if (k === 'checked' || k === 'hidden') return false;
  return typeof k === 'string' ? (...a) => stub() : undefined;
}, set: () => true });

const ctx = vm.createContext({
  console, Intl, Date, JSON, Map, Set, Object, Array, String, Number, Blob: class {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
  window: {}, document: {
    getElementById: stub, querySelectorAll: () => [], createElement: stub,
    addEventListener() {}, title: '', hidden: false
  },
  location: { hash: '' }, history: { replaceState() {} },
  addEventListener() {}, setInterval: () => 0, setTimeout: () => 0,
  confirm: () => true, alert: () => {}
});
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
ctx.window.scrollTo = () => {};

const src = fs.readFileSync(path.join(__dirname, 'root', 'app.js'), 'utf8');
const probe = '\n;globalThis.__t={parseCSV,cleanKomisi,cleanMz,cleanBerita,SPECS,validDate,imgOK,teksShare,alkitabURL,refHTML};';
vm.runInContext(src + probe, ctx, { filename: 'app.js' });

const { parseCSV, cleanKomisi, cleanMz, cleanBerita, SPECS, validDate, imgOK, teksShare, alkitabURL, refHTML } = ctx.__t;
let n = 0, bad = 0;
const ok = (name, cond) => { n++; if (!cond) { bad++; console.log('  GAGAL: ' + name); } };
const eq = (name, got, want) => ok(name + ' (dapat ' + JSON.stringify(got) + ', harus ' + JSON.stringify(want) + ')', JSON.stringify(got) === JSON.stringify(want));
const throws = (name, fn, re) => {
  n++;
  try { fn(); bad++; console.log('  GAGAL: ' + name + ' (tidak melempar error)'); }
  catch (e) { if (re && !re.test(e.message)) { bad++; console.log('  GAGAL: ' + name + ' (pesan "' + e.message + '" tidak cocok /' + re.source + '/)'); } }
};

// --- parseCSV ---
eq('koma sederhana', parseCSV('a,b\nc,d'), [['a','b'],['c','d']]);
eq('kutip berisi koma', parseCSV('a,"b,c",d'), [['a','b,c','d']]);
eq('kutip terescap', parseCSV('a,"say ""hi""",b'), [['a','say "hi"','b']]);
eq('newline di dalam kutip', parseCSV('a,"b\nc",d'), [['a','b\nc','d']]);
eq('CRLF', parseCSV('a,b\r\nc,d'), [['a','b'],['c','d']]);
eq('BOM Excel dibuang', parseCSV('\uFEFFa,b'), [['a','b']]);
eq('baris kosong dilewati', parseCSV('a,b\n\nc,d\n'), [['a','b'],['c','d']]);
eq('tanpa newline di akhir', parseCSV('a,b'), [['a','b']]);
eq('sel kosong', parseCSV('a,,b'), [['a','','b']]);

// --- validDate ---
ok('tanggal sah', validDate('2026-10-11'));
ok('bulan tidak sah ditolak', !validDate('2026-13-01'));
ok('format salah ditolak', !validDate('11/10/2026'));
// tiga kasus ini dulu membuat toISOString() melempar RangeError
ok('hari 0 ditolak', !validDate('2026-00-10'));
ok('Februari 30 ditolak', !validDate('2026-02-30'));
ok('29 Februari tahun loncat sah', validDate('2024-02-29'));
ok('29 Februari tahun biasa ditolak', !validDate('2026-02-29'));

// --- cleanKomisi ---
const k1 = cleanKomisi({ tanggal: '2026-10-11', tipe: 'KU', komisi: 'diabaikan', judul: 'KU', waktu: '09.30 WIT' });
eq('tipe KU paksa komisi', k1.komisi, 'Kebaktian Umum');
eq('tipe KU isi jenis_ibadah', k1.jenis_ibadah, 'Kebaktian Umum');
eq('tipe KU kosongkan tuan_rumah', k1.tuan_rumah, '');
const k2 = cleanKomisi({ tanggal: '2026-10-11', tipe: 'KOMISI', komisi: 'Pemuda', judul: 'P', status: 'ngawur' });
eq('status tak dikenal -> default', k2.status, 'TERJADWAL');
eq('status BATAL diterima', cleanKomisi({ tanggal: '2026-10-11', komisi: 'P', judul: 'x', status: 'BATAL' }).status, 'BATAL');
throws('tanggal wajib valid', () => cleanKomisi({ tanggal: 'bukan tanggal', komisi: 'P', judul: 'x' }), /tanggal tidak valid/i);
throws('komisi wajib', () => cleanKomisi({ tanggal: '2026-10-11', judul: 'x' }), /komisi wajib/i);
throws('judul wajib', () => cleanKomisi({ tanggal: '2026-10-11', komisi: 'P' }), /judul wajib/i);
throws('judul >200', () => cleanKomisi({ tanggal: '2026-10-11', komisi: 'P', judul: 'x'.repeat(201) }), /terlalu panjang/i);

// --- cleanMz ---
const m1 = cleanMz('2026-09-08', { judul: 'J', renungan: 'R', tema: '  T  ', bacaan: '-' });
eq('tema dipangkas', m1.tema, 'T');
eq("'-' jadi kosong", m1.bacaan, '');
throws('renungan wajib', () => cleanMz('2026-09-08', { judul: 'J' }), /renungan wajib/i);
throws('tanggal dari path dipakai', () => cleanMz('2026-13-99', { judul: 'J', renungan: 'R' }), /tanggal tidak valid/i);
throws('renungan >10000', () => cleanMz('2026-09-08', { judul: 'J', renungan: 'x'.repeat(10001) }), /terlalu panjang/i);

// --- cleanBerita (validasi URL foto + batas 12) ---
ok('https diterima', imgOK('https://a/b.png'));
ok('path internal diterima', imgOK('/gkkk.png'));
ok('skema data: ditolak', !imgOK('data:text/html,x'));
eq('foto tak sah dibuang', cleanBerita({ tanggal: '2026-10-04', judul: 'B', isi: 'I', gambar: 'https://a/1.png\njavascript:evil\ndata:x' }).gambar, 'https://a/1.png');
eq('foto duplikat dirapikan', cleanBerita({ tanggal: '2026-10-04', judul: 'B', isi: 'I', gambar: 'https://a/1.png\nhttps://a/1.png' }).gambar, 'https://a/1.png');
throws('maks 12 foto', () => cleanBerita({ tanggal: '2026-10-04', judul: 'B', isi: 'I', gambar: Array.from({ length: 13 }, (_, i) => 'https://a/' + i + '.png').join('\n') }), /maksimal 12 foto/i);
throws('isi wajib', () => cleanBerita({ tanggal: '2026-10-04', judul: 'B' }), /isi berita wajib/i);
throws('isi >20000', () => cleanBerita({ tanggal: '2026-10-04', judul: 'B', isi: 'x'.repeat(20001) }), /terlalu panjang/i);

// --- SPECS: kolom template harus cocok dengan yang dibutuhkan ---
eq('jadwal punya kolom tipe', SPECS.jadwal.cols.includes('tipe'), true);
eq('jadwal punya jenis_ibadah', SPECS.jadwal.cols.includes('jenis_ibadah'), true);
eq('jadwal wajib tanggal+judul', SPECS.jadwal.need.join(','), 'tanggal,judul');
eq('mezbah wajib tanggal+judul+renungan', SPECS.mezbah.need.join(','), 'tanggal,judul,renungan');
eq('onConflict jadwal', SPECS.jadwal.onConflict, 'tanggal,komisi');
eq('kunci jadwal komisi ikut', SPECS.jadwal.kunci({ tanggal: '2026-10-11', komisi: 'PW' }), '2026-10-11|PW');
eq('kunci mezbah tanggal saja', SPECS.mezbah.kunci({ tanggal: '2026-10-11', komisi: 'PW' }), '2026-10-11');

// dedupe kunci yang baru saya tambahkan: Postgres menolak dua baris dengan
// kunci alami sama dalam satu upsert.
const list = [1, 2, 3, 4].map((t) => ({ tanggal: '2026-10-1' + (t % 2), komisi: 'PW' }));
const unik = new Map(); list.forEach(r => unik.set(SPECS.jadwal.kunci(r), r));
eq('kunci kembar di-dedup jadi 2', unik.size, 2);

// teksShare: isi pesan WhatsApp. Yang wajib: tidak ada "undefined"/"null",
// field kosong tidak muncul, dan isi minimal (tanggal + judul) tetap utuh.
const mzPenuh = {
  tanggal: '2026-11-08', judul: 'Siap Berkarya', tema: 'Panggilan',
  bacaan: 'Matius 5:1-12', ayat: 'Matius 5:2', renungan: 'Tuhan memanggil.',
  pesan: 'Bertumbuh dalam kasih.', refleksi: 'Praktikkan hari ini.',
  doa_gkkk: 'Kesehatan Papa', doa_misi: 'Gereja bertumbuh', doa_penutup: 'Amein'
};
const sh = teksShare(mzPenuh);
ok('share tidak bocor undefined', !/undefined/.test(sh));
ok('share tidak bocor null', !/\bnull\b/.test(sh));
ok('share tak punya blankdoouble', !/\n\n\n/.test(sh));
ok('share berisi tanggal', sh.includes('2026') && sh.includes('November') || sh.includes('11'));
ok('share berisi judul', sh.includes('Siap Berkarya'));
ok('share berisi bacaan', sh.includes('Matius 5:1-12'));
ok('share berisi doa penutup', sh.includes('Amein'));
// entri minim: banyak field kosong, tidak boleh jadi baris "undefined"
const shTipis = teksShare({ tanggal: '2026-11-08', judul: '', renungan: 'R' });
ok('share entri minim bersih', shTipis.includes('R') && !/undefined|\bnull\b/.test(shTipis) && !/\n\n\n/.test(shTipis));
ok('share entri minim tak kosong', shTipis.trim().length > 0);

// alkitabURL: rujukan -> URL Alkitab SABDA.
const u1 = alkitabURL('Matius 4:18-22');
ok('single ref pakai bible.php', u1.startsWith('https://alkitab.sabda.org/bible.php?'));
ok('single ref bawa kitab', u1.includes('book=Matius'));
ok('single ref bawa pasal', u1.includes('chapter=4'));
ok('single ref bawa ayat', u1.includes('verse=18-22'));
// kitab bernomor: spasi harus ter-encode, tidak boleh bocor ke query string
const u2 = alkitabURL('1 Korintus 15:57-58');
ok('kitab bernomor ter-encode', u2.includes('book=1%20Korintus') || u2.includes('book=1+Korintus'));
ok('kitab bernomor tak bocor &', !/book=1 Korintus/.test(u2));
// tanda hubung panjang (–) dari Excel harus jadi '-' ASCII
ok('en-dash dinormalkan', alkitabURL('Yohanes 3:16–18').includes('verse=16-18'));
// rujukan majemuk -> search.php, karena SABDA cuma terima satu kitab per permintaan
const u3 = alkitabURL('Matius 5:38-48; Yakobus 1:19-20');
ok('multi ref pakai search.php', u3.includes('search.php?search='));
ok('multi ref isi kedua kitab', decodeURIComponent(u3).includes('Yakobus 1:19-20'));
// input rusak: jangan bikin URL ngawur
eq('rujukan kosong -> kosong', alkitabURL(''), '');
eq('bukan rujukan -> search', alkitabURL('Renungan hari ini').includes('search.php'), true);

// refHTML: teks tetap terbaca + XSS aman di atribut href
const h1 = refHTML('Matius 4:18-22');
ok('refHTML punya anchor', h1.startsWith('<a '));
ok('refHTML teks tetap tampil', h1.includes('Matius 4:18-22'));
ok('refHTML target blank', h1.includes('target="_blank"'));
ok('refHTML rel aman', h1.includes('rel="noopener noreferrer"'));
// Reflected XSS: crafted ref harus jadi entity, bukan quote mentah
const h2 = refHTML('Matius 4:18-22" onmouseover="alert(1)');
ok('XSS quote di-escape', !h2.includes('onmouseover="alert'));
ok('XSS quote jadi &quot;', h2.includes('&quot;'));
// nilai href harus ter-encode penuh: tidak ada quote/space mentahan yang
// bisa menutup atribut dan menyuntik handler baru.
const href = (h2.match(/href="([^"]*)"/) || [])[1] || '';
ok('href ter-encode penuh', !/["'<>]/.test(href) && !href.includes(' '));
ok('href tetap ke domain SABDA', href.startsWith('https://alkitab.sabda.org/'));

console.log('\n' + (bad ? 'GAGAL ' + bad + '/' : 'lulus ') + n + ' pemeriksaan');
process.exit(bad ? 1 : 0);