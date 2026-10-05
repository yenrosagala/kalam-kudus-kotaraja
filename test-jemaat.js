// Cek logika data Jemaat: validator, spec impor Excel, dan render dashboard.
// Harness sama seperti test-port.js: app.js dimuat lewat vm dengan stub DOM.
const fs = require('fs'), vm = require('vm'), path = require('path');

const els = {};
const getEl = (id) => els[id] || (els[id] = new Proxy({}, { get: (t, k) => {
  if (k === 'value') return '';
  if (k === 'checked' || k === 'hidden') return false;
  if (k === 'innerHTML' || k === 'textContent') return t[k] || '';
  return typeof k === 'string' ? (...a) => getEl(id) : undefined;
}, set: (t, k, v) => { t[k] = v; return true; } }));
const stub = () => getEl('anon');

const ctx = vm.createContext({
  console, Intl, Date, JSON, Map, Set, Object, Array, String, Number, Blob: class {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
  window: {}, document: {
    getElementById: getEl, querySelectorAll: () => [], createElement: stub,
    addEventListener() {}, title: '', hidden: false
  },
  location: { hash: '' }, history: { replaceState() {} },
  addEventListener() {}, setInterval: () => 0, setTimeout: () => 0,
  confirm: () => true, alert: () => {}
});
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
ctx.window.scrollTo = () => {};
ctx.els = els;

const src = fs.readFileSync(path.join(__dirname, 'root', 'app.js'), 'utf8');
const probe = '\n;globalThis.__t={parseCSV,cleanJemaat,SPECS,renderJemaat,jmTgl,jmUsia,csvJemaat,JC,rowsJemaat,' +
  'setJM:(v,p)=>{JM=v;JMP=p},stat:()=>els.jmStat.innerHTML,list:()=>els.jmList.innerHTML,pend:()=>els.jmPending.innerHTML};';
vm.runInContext(src + probe, ctx, { filename: 'app.js' });

const { parseCSV, cleanJemaat, SPECS, renderJemaat, jmTgl, jmUsia, csvJemaat, JC } = ctx.__t;
let n = 0, bad = 0;
const ok = (name, cond) => { n++; if (!cond) { bad++; console.log('  GAGAL: ' + name); } };
const eq = (name, got, want) => ok(name + ' (dapat ' + JSON.stringify(got) + ', harus ' + JSON.stringify(want) + ')', JSON.stringify(got) === JSON.stringify(want));
const throws = (name, fn, re) => {
  n++;
  try { fn(); bad++; console.log('  GAGAL: ' + name + ' (tidak melempar error)'); }
  catch (e) { if (re && !re.test(e.message)) { bad++; console.log('  GAGAL: ' + name + ' (pesan "' + e.message + '" tidak cocok /' + re.source + '/)'); } }
};

// ---- validator --------------------------------------------------------
const r = cleanJemaat({ nama: '  Yenro Sagala  ', nama_keluarga: ' Sagala ', jk: 'l', lahir: '1990-01-31', hp: '081234567890', daerah: 'Samosir', alamat: 'Kotaraja', kepala: 'Bapak Sagala', no_keluarga: '1' });
eq('nama dipangkas spasi', r.nama, 'Yenro Sagala');
eq('jk dinormalkan jadi huruf besar', r.jk, 'L');
eq('no_keluarga ikut diambil (impor Excel)', r.no_keluarga, '1');
eq('tanggal lahir disimpan', r.lahir, '1990-01-31');

eq('lahir kosong jadi null (bukan string kosong)', cleanJemaat({ nama: 'X Y' }).lahir, null);
eq('no_keluarga kosong jadi string kosong', cleanJemaat({ nama: 'X Y' }).no_keluarga, '');
throws('nama wajib diisi', () => cleanJemaat({ nama: '   ' }), /nama wajib/i);
throws('jk ngawur ditolak (CHECK di DB juga)', () => cleanJemaat({ nama: 'X Y', jk: 'X' }), /L atau P/i);
throws('lahir ngawur ditolak', () => cleanJemaat({ nama: 'X Y', lahir: '31-01-1990' }), /tanggal lahir/i);
throws('nama kepanjangan ditolak', () => cleanJemaat({ nama: 'a'.repeat(121) }), /terlalu panjang/i);

// ---- spec impor Excel --------------------------------------------------
const S = SPECS.jemaat;
ok('spec Faster: ada', !!S);
ok('spec: nama kolom = kolom tabel jemaat', S.cols.includes('no_keluarga') && S.cols.includes('lahir') && S.cols.includes('hp'));
eq('spec: kunci upsert', S.onConflict, 'no_keluarga,nama');
eq('spec: kolom wajib hanya nama', S.need, ['nama']);
ok('spec: contoh punya isi tiap kolom', S.cols.every(c => S.contoh[c] !== undefined));
eq('spec: kunci alami konsisten', S.kunci({ no_keluarga: '1', nama: 'A' }), S.kunci({ no_keluarga: '1', nama: 'A' }));
ok('spec: kunci alami bedakan keluarga', S.kunci({ no_keluarga: '1', nama: 'A' }) !== S.kunci({ no_keluarga: '2', nama: 'A' }));

// template harus bisa di-parse balik jadi baris yang lolos validator
const hdr = S.cols.join(','), val = S.cols.map(c => S.contoh[c]).join(',');
const back = parseCSV(hdr + '\r\n' + val);
eq('template: 2 baris terbaca', back.length, 2);
eq('template: judul kolom urut', back[0], S.cols);
ok('template: baris contoh lolos validator', (() => { try { cleanJemaat(Object.fromEntries(S.cols.map((c, i) => [c, back[1][i]]))); return true; } catch { return false; } })());

// ---- format tanggal / usia --------------------------------------------
eq('tanggal lahir diformat', jmTgl('1990-01-31'), '31 Jan 1990');
eq('tanggal kosong jadi strip', jmTgl(null), '-');
ok('usia dihitung dari tahun lahir', /th$/.test(jmUsia('1990-01-31')));
eq('usia kosong jadi string kosong', jmUsia(''), '');

// ---- dashboard ---------------------------------------------------------
const AG = [
  { no_keluarga: '1', nama_keluarga: 'Sagala', nama: 'Yenro Sagala', jk: 'L', lahir: '1990-01-31', hp: '0812' },
  { no_keluarga: '1', nama_keluarga: 'Sagala', nama: 'Jolief Sagala', jk: 'P', lahir: '2015-05-02', hp: '' },
  { no_keluarga: '2', nama_keluarga: 'Simbolon', nama: 'Juniarty Simbolong', jk: 'P', lahir: '1992-08-09', hp: '0813' }
];
ctx.__t.setJM(AG, [{ id: 7, nama: 'Calon Jemaat', nama_keluarga: 'Baru', jk: 'L', lahir: '2000-01-01', daerah: 'Merauke', hp: '0899' }]);
renderJemaat();
const stat = ctx.__t.stat(), list = ctx.__t.list(), pend = ctx.__t.pend();
ok('stat: 3 jiwa', stat.includes('<b>3</b>'));
ok('stat: 2 keluarga', stat.includes('<b>2</b>'));
ok('stat: 1 laki-laki', stat.includes('<b>1</b>'));
ok('stat: 1 menunggu', stat.includes('<b>1</b>'));
ok('daftar: semua nama masuk', ['Yenro Sagala', 'Jolief Sagala', 'Juniarty Simbolong'].every(x => list.includes(x)));
ok('daftar: kolom usia terisi', /\d+ th<\/td>/.test(list));
ok('pending: pendaftar tampil', pend.includes('Calon Jemaat'));
// Baris tanpa keluarga_ref (pendaftaran lama) tetap satu per satu lewat id.
ok('pending: tombol terima pakai id untuk baris lama', pend.includes('data-terima="id7"'));
ok('pending: jumlah orang disebut', pend.includes('1 orang'));

// ---- pendaftaran sebagai satu keluarga ---------------------------------
// Tiga orang dikirim bersama: kepala + 2 anggota. Semua harus dapat satu
// keluarga_ref yang sama, dan hanya kepala yang membawa alamat/HP.
ctx.__t.setJM([], [
  { id: 1, nama: 'Ayah S', nama_keluarga: 'S', kepala: 'Ayah S', jk: 'L', lahir: '1985-02-02', daerah: 'Merauke', alamat: 'Jl. M', hp: '0812', keluarga_ref: 'abc' },
  { id: 2, nama: 'Ibu S', nama_keluarga: 'S', kepala: 'Ayah S', jk: 'P', lahir: '1988-03-03', daerah: '', alamat: '', hp: '', keluarga_ref: 'abc' },
  { id: 3, nama: 'Anak S', nama_keluarga: 'S', kepala: 'Ayah S', jk: 'P', lahir: '2016-04-04', daerah: '', alamat: '', hp: '', keluarga_ref: 'abc' },
  { id: 4, nama: 'Sendiri', nama_keluarga: 'T', kepala: '', jk: 'L', lahir: '1995-05-05', daerah: '', alamat: '', hp: '', keluarga_ref: 'xyz' }
]);
renderJemaat();
const pendK = ctx.__t.pend();
ok('keluarga: 3 orang jadi satu kartu', pendK.includes('3 orang'));
ok('keluarga: anggota lain disebut', pendK.includes('Anak S') && pendK.includes('Ibu S'));
ok('keluarga: satu kartu per keluarga', (pendK.match(/data-terima=/g) || []).length === 2);
ok('keluarga: ref jadi tombol terima', pendK.includes('data-terima="abc"') && pendK.includes('data-terima="xyz"'));
ok('keluarga: 4 orang menunggu di 2 kartu', ctx.__t.stat().includes('<b>4</b>') && pendK.match(/data-terima=/g).length === 2);

// Nama keluarga dari antrean harus ter-escape juga (XSS bisa datang dari mana saja)
ctx.__t.setJM([], [{ id: 9, nama: '<script>alert(3)</script>', nama_keluarga: 'X', jk: 'L', lahir: null, hp: '', keluarga_ref: 'z' }]);
renderJemaat();
ok('XSS: nama di antrean di-escape', !ctx.__t.pend().includes('<script>alert(3)'));

// nama dari Excel/DB harus ter-escape, bukan jadi HTML.
ctx.__t.setJM([{ no_keluarga: '1', nama_keluarga: '<img src=x onerror=alert(1)>', nama: '<script>alert(2)</script>', jk: 'L', lahir: null, hp: '' }], []);
renderJemaat();
const listX = ctx.__t.list();
// esc() menutup '<' dan '"' (yang '>' tidak perlu: tanpa '<' tidak bisa
// membuka tag sama sekali), jadi ini cukup untuk:name('<script>') -> &lt;script>
ok('XSS: <script> di nama di-escape', !listX.includes('<script>') && listX.includes('&lt;script>alert(2)'));
ok('XSS: onerror di nama keluarga di-escape', !listX.includes('<img'));

// daftar kosong harus memberi petunjuk, bukan tabel kosong.
ctx.__t.setJM([], []);
renderJemaat();
ok('daftar kosong: ada petunjuk', ctx.__t.list().includes('Belum ada data'));
ok('pending kosong: ada(induk pending)', ctx.__t.pend().includes('Belum ada pendaftaran'));

// stub DOM di atas membuat getElementById selalu mengembalikan objek, jadi
// salah ketik id ($('jmStatt')) tidak akan gagal di sini -- hanya di browser.
// Karena itu id yang dipanggil app.js dicek langsung terhadap index.html.
// Id yang dibuat app.js saat runtime (mis. carousel berita: id="bCarImg")
// ikut dihitung, jadi pola literal dan interpolasi dua-duanya diambil.
const html = fs.readFileSync(path.join(__dirname, 'root', 'index.html'), 'utf8');
const ids = new Set([
  ...[...html.matchAll(/\sid="([^"$\s{]+)"/g)].map(m => m[1]),
  ...[...src.matchAll(/\sid="([^"$\s{]+)"/g)].map(m => m[1])
]);
const dipakai = [...src.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
const hilang = [...new Set(dipakai.filter(x => !ids.has(x)))];
ok('semua id yang dipanggil app.js ada di index.html atau dibuat saat runtime', hilang.length === 0);
if (hilang.length) console.log('    id hilang: ' + hilang.join(', '));
//.id yang ditambahkan fitur ini harus benar-benar ada
['btnDaftar', 'btnJemaatImp', 'fJemaat', 'jmDash', 'jmStat', 'jmPending', 'jmList', 'jmKlg', 'jmCari', 'jmTpl', 'jmImp']
  .forEach(id => ok('id baru ada: ' + id, ids.has(id)));

// Cek struktur, bukan cuma keberadaan id. .page{display:none} di style.css, dan
// route() di app.js menyalakan tepat satu .page lewat kelas .on. Kalau ada satu
// .page-nya tidak tertutup div di dalam .page lain, halaman setelahnya ikut hilang:
// display:none pada leluhur menyembunyikan seluruh turunannya, walau .page
// yang nyala itu sendiri display:block. Gejalanya menyesatkan: data masih
// utuh di database tapi halamannya kosong.
const depths = [];
let d = 0;
for (const baris of html.split('\n')) {
  const sebelum = d;
  d += (baris.match(/<div\b/g) || []).length - (baris.match(/<\/div>/g) || []).length;
  const m = baris.match(/<div class="page" id="(\w+)"/);
  if (m) depths.push([m[1], sebelum]);
}
ok('se semua tag <div> tertutup seimbang', d === 0);
ok('tidak ada <div>.pagesatu <div class="page"', depths.length > 0);
ok('setiap .page adalah anak langsung (depth 0)',
  depths.every(([, dd]) => dd === 0));
if (depths.some(([, dd]) => dd !== 0)) {
  console.log('    page terdalam: ' + depths.filter(([, dd]) => dd !== 0).map(([n2, dd]) => n2 + '@' + dd).join(', '));
}

// ---- tombol Ubah + unduh CSV ------------------------------------------
ctx.__t.setJM([{ id: 42, no_keluarga: '7', nama: 'Yenro Sagala', nama_keluarga: 'Sagala', jk: 'L', lahir: '1990-01-31', hp: '0812', daerah: 'Samosir', alamat: 'Kotaraja', kepala: 'Bapak Sagala' }], []);
renderJemaat();
ok('edit: tiap baris punya tombol Ubah', ctx.__t.list().includes('data-ubah="42"'));
// id harus masuk sebagai atribut data, bukan HTML mentah
ctx.__t.setJM([{ id: 43, no_keluarga: '8', nama: 'x" onmouseover="alert(1)', nama_keluarga: '', jk: '', lahir: null, hp: '', daerah: '', alamat: '', kepala: '' }], []);
renderJemaat();
ok('edit: id di-escape di atribut', !ctx.__t.list().includes('onmouseover="alert(1)"'));

eq('csv: header = no_keluarga + kolom JF', JC.join(','), 'no_keluarga,nama,nama_keluarga,kepala,jk,lahir,daerah,alamat,hp');
const satu = [{ id: 1, no_keluarga: '7', nama: 'Yenro Sagala', nama_keluarga: 'Sagala', kepala: 'Bapak Sagala', jk: 'L', lahir: '1990-01-31', daerah: 'Samosir', alamat: 'Kotaraja', hp: '0812' }];
const txt = csvJemaat(satu);
const baris = parseCSV(txt);
eq('csv: 1 header + 1 data', baris.length, 2);
eq('csv: isi baris data', baris[1][0] + '|' + baris[1][1] + '|' + baris[1][5], '7|Yenro Sagala|1990-01-31');
ok('csv: ada BOM buat Excel', txt.charCodeAt(0) === 0xFEFF);
// Nilai yang diawali = + - @ akan dieksekusi Excel sebagai rumus. Ini kunci
// keamanan, bukan tampilan: tanpa ini, satu nama bisa jadi formula injection.
for (const [bahaya, sah] of [['=1+1', "'=1+1"], ['+CMD', "'+CMD"], ['@SUM(A1)', "'@SUM(A1)"], ['-2+3', "'-2+3"]]) {
  ok('csv: rumus dikunci (' + bahaya + ')', csvJemaat([{ nama: bahaya }]).includes(sah));
}
ok('csv: nama normal tidak diubah', csvJemaat([{ nama: 'Yenro Sagala' }]).includes(',Yenro Sagala,'));
ok('csv: koma di nilai tetap aman', csvJemaat([{ nama: 'a,b' }]).includes('"a,b"'));
ok('csv: null jadi kolom kosong', csvJemaat([{ nama: null }]).split('\r\n')[1].replace(/,\$/, '').split(',').length === JC.length);

console.log('\n' + (bad ? 'GAGAL ' + bad + '/' : 'lulus ') + n + ' pemeriksaan');
process.exit(bad ? 1 : 0);