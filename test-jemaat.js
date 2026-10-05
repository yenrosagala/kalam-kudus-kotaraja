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
const probe = '\n;globalThis.__t={parseCSV,cleanJemaat,SPECS,renderJemaat,jmTgl,jmUsia,' +
  'setJM:(v,p)=>{JM=v;JMP=p},stat:()=>els.jmStat.innerHTML,list:()=>els.jmList.innerHTML,pend:()=>els.jmPending.innerHTML};';
vm.runInContext(src + probe, ctx, { filename: 'app.js' });

const { parseCSV, cleanJemaat, SPECS, renderJemaat, jmTgl, jmUsia } = ctx.__t;
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
ok('pending: tombol terima ada', pend.includes('data-terima="7"'));

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

console.log('\n' + (bad ? 'GAGAL ' + bad + '/' : 'lulus ') + n + ' pemeriksaan');
process.exit(bad ? 1 : 0);