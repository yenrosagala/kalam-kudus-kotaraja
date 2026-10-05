// jadwal.xlsx -> SQL untuk Supabase. Kolom UI ("Bahan", "Edit Terakhir",
// "Aksi") dibuang; baris "Teks: ..." digabung ke baris jadwal sebelumnya
// (masuk kolom teks, yang dirender app sebagai "Teks: <b>..</b>").
const fs = require('fs'), zlib = require('zlib'), path = require('path');

function unzip(buf) {
  const files = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('bukan file zip');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(start, start + csize);
    files[name] = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');

const XLSX = path.join(__dirname, '..', 'jadwal ibadah.xlsx');   // xlsx ada di root repo, bukan di tools/
const KELUAR = path.join(__dirname, '..', 'jadwal-import.sql');

const src = unzip(fs.readFileSync(XLSX));
const shared = [];
for (const si of (src['xl/sharedStrings.xml'] ? src['xl/sharedStrings.xml'].toString('utf8') : '').match(/<si>[\s\S]*?<\/si>/g) || [])
  shared.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => ent(m[1])).join(''));

const sheet = src['xl/worksheets/sheet1.xml'].toString('utf8');
const colNum = s => [...s].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0);
const rows = [];
for (const rowXml of sheet.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
  const cells = {};
  for (const c of rowXml.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
    const ref = (c.match(/\br="([A-Z]+)\d+"/) || [])[1];
    if (!ref) continue;
    const t = (c.match(/\bt="([^"]+)"/) || [])[1];
    let v = '';
    if (t === 'inlineStr') v = ent([...(c.match(/<is>[\s\S]*?<\/is>/) || [''])[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''));
    else { const vm = c.match(/<v>([\s\S]*?)<\/v>/); if (vm) v = t === 's' ? shared[+vm[1]] : vm[1]; }
    cells[ref] = ent(v);
  }
  rows.push(cells);
}
const grid = rows.map(c => {
  const max = Math.max(0, ...Object.keys(c).map(colNum));
  return Array.from({ length: max }, (_, i) => (c[String.fromCharCode(65 + i)] || '').replace(/\s+/g, ' ').trim());
}).slice(1); // buang header

// "Sel, 10 Feb 2026" -> 2026-02-10. Verifikasi hari terhadap tanggal asli.
const BULAN = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
const HARI = { sen: 1, sel: 2, rab: 3, kam: 4, jum: 5, sab: 6 };
function parseTanggal(s) {
  const m = s.match(/^(?:(Sen|Sel|Rab|Kam|Jum|Sab),?\s*)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!m) return null;
  const bln = BULAN[m[3].toLowerCase()];
  if (!bln) return null;
  const iso = `${m[4]}-${String(bln).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d) || d.toISOString().slice(0, 10) !== iso) return null;
  if (m[1] && HARI[m[1].toLowerCase()] !== d.getUTCDay()) return { iso, salahHari: m[1] };
  return { iso };
}
const bersih = v => { const t = (v || '').trim(); return !t || t === '-' || t === '—' ? '' : t; };
const potong = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const q = s => "'" + String(s).replace(/'/g, "''") + "'";

const hasil = [], catatan = [];
for (const r of grid) {
  const [tanggal, komisi, tuanRumah, liturgis, firman, judul, tujuan] = r;
  if (!tanggal) continue;
  // Baris lanjutan "Teks: ..." milik baris jadwal sebelumnya.
  const t = tanggal.match(/^Teks:\s*(.+)$/i);
  if (t) {
    if (!hasil.length) { catatan.push('baris "Teks:" tanpa jadwal induk, dilewati: ' + tanggal); continue; }
    const induk = hasil[hasil.length - 1];
    induk.teks = induk.teks ? induk.teks + ' ' + bersih(t[1]) : bersih(t[1]);
    continue;
  }
  const d = parseTanggal(tanggal);
  if (!d) { catatan.push('tanggal tak terbaca, dilewati: ' + tanggal); continue; }
  if (d.salahHari) catatan.push(`${tanggal} -> ${d.iso}: hari di sheet "${d.salahHari}", Actually ${new Date(d.iso + 'T00:00:00Z').getUTCDay()}`);
  hasil.push({ tanggal: d.iso, komisi: bersih(komisi), judul: bersih(judul), teks: '', nats_pembimbing: '', pelayan_firman: bersih(firman), liturgis: bersih(liturgis), tuan_rumah: bersih(tuanRumah), tujuan: potong(bersih(tujuan), 3000) });
}

// Validasi panjang kolom terhadap KFLEN di app.js + cek unik (tanggal, komisi)
const LEN = { komisi: 40, tuan_rumah: 120, liturgis: 120, pelayan_firman: 120, judul: 200, teks: 200, tujuan: 3000 };
const kode = r => r.tanggal + '|' + r.komisi;
const seen = new Set();
for (const r of hasil) {
  for (const [k, max] of Object.entries(LEN)) {
    const v = String(r[k] || '');
    if (v.length > max) { catatan.push(`${k} dipotong ${v.length}->${max} (${r.tanggal} ${r.komisi})`); r[k] = v.slice(0, max - 1) + '…'; }
  }
  if (seen.has(kode(r))) catatan.push(`DUPLIKAT natural key (tanggal,komisi): ${r.tanggal} ${r.komisi}`);
  seen.add(kode(r));
}
if (!hasil.length) throw new Error('tidak ada baris jadwal terbaca');

const sql = `-- Import jadwal ibadah dari "jadwal ibadah.xlsx" (${hasil.length} baris)
-- Dibuat oleh tools/xlsx-ke-sql.js. Jalankan di Supabase SQL Editor.
-- Upsert pada (tanggal, komisi): aman dijalankan berulang.
BEGIN;

INSERT INTO public.jadwal_komisi
  (tanggal, tipe, komisi, jenis_ibadah, judul, teks, nats_pembimbing,
   pelayan_firman, liturgis, tuan_rumah, tujuan, status)
VALUES
${hasil.map(r => `  (${q(r.tanggal)}, 'KOMISI', ${q(r.komisi)}, '', ${q(r.judul)}, ${q(r.teks)}, ${q(r.nats_pembimbing)}, ${q(r.pelayan_firman)}, ${q(r.liturgis)}, ${q(r.tuan_rumah)}, ${q(r.tujuan)}, 'TERJADWAL')`).join(',\n')}
ON CONFLICT (tanggal, komisi) DO UPDATE SET
  judul          = EXCLUDED.judul,
  teks           = EXCLUDED.teks,
  nats_pembimbing= EXCLUDED.nats_pembimbing,
  pelayan_firman = EXCLUDED.pelayan_firman,
  liturgis       = EXCLUDED.liturgis,
  tuan_rumah     = EXCLUDED.tuan_rumah,
  tujuan         = EXCLUDED.tujuan;

COMMIT;

-- ringkasan
SELECT tanggal, komisi, judul, teks
FROM public.jadwal_komisi
WHERE tanggal >= '2026-02-01'
ORDER BY tanggal, komisi;
`;

fs.writeFileSync(KELUAR, sql, 'utf8');
console.log('baris jadwal   : ' + hasil.length);
console.log('rentang tanggal : ' + hasil[0].tanggal + ' s.d. ' + hasil[hasil.length - 1].tanggal);
console.log('dengan teks     : ' + hasil.filter(r => r.teks).length);
console.log('tanpa judul    : ' + hasil.filter(r => !r.judul).length);
console.log('komisi dipakai  : ' + [...new Set(hasil.map(r => r.komisi))].join(', '));
console.log('catatan        : ' + (catatan.length ? '\n  - ' + catatan.join('\n  - ') : 'tidak ada'));
console.log('tulis ke       : jadwal-import.sql');