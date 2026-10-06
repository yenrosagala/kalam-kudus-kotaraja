const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/* ---- Lapisan data: Supabase, dipanggil langsung dari browser ----
   Dulu semua lewat Express (server.js). Sekarang halaman statis ini
   bicara langsung ke Postgres Supabase lewat PostgREST.
   Anon key aman untuk dipublikasikan; yang melindungi data adalah RLS
   di supabase-migration.sql. JANGAN pernah menaruh password postgres
   atau service_role key di sini. */
const SB = window.SUPABASE_READY
  ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;
const db = (t) => {
  if (!SB) throw new Error('Konfigurasi Supabase belum diisi (root/supabase-config.js).');
  return SB.from(t);
};
// supabase-js tidak melempar error; selalu mengembalikan {data, error}
const sb = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const todayWIT = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jayapura' }).format(new Date());

// Semua helper query sengaja async: kalau Supabase belum dikonfigurasi, db()
// melempar error, dan async mengubahnya jadi rejection yang bisa ditangkap
// .catch() di bawah. Kalau tidak, error itu lolos sebagai exception.
const qKomisi = async () => sb(db('jadwal_komisi').select('*').order('tanggal', { ascending: false }).order('komisi', { ascending: true }));
const qMzDaftar = async () => sb(db('mezbah').select('tanggal,judul,tema,bacaan,ayat').order('tanggal', { ascending: false }).limit(400));
const qMzSatu = async (t) => sb(db('mezbah').select('*').eq('tanggal', t).maybeSingle());
const qBeritaList = async () => sb(db('berita').select('id,tanggal,judul,ringkasan,gambar').order('tanggal', { ascending: false }).order('id', { ascending: false }));
const qBerita = async (id) => sb(db('berita').select('*').eq('id', id).maybeSingle());
// Hanya admin boleh membaca (RLS menolak anon), jadi selalu dipanggil dari syncAdmin.
const qJemaat = async () => sb(db('jemaat').select('*').order('no_keluarga').order('nama'));
const qPending = async () => sb(db('jemaat_daftar').select('*').order('dibuat', { ascending: false }));
// "renungan hari ini" bertingkat tiga, persis seperti server.js:148-154
const qMzHariIni = async () => await qMzSatu(todayWIT())
  || await sb(db('mezbah').select('*').lte('tanggal', todayWIT()).order('tanggal', { ascending: false }).limit(1).maybeSingle())
  || await sb(db('mezbah').select('*').order('tanggal', { ascending: false }).limit(1).maybeSingle());

const PAGES = { beranda: '', tentang: 'Tentang', jadwal: 'Jadwal Ibadah', mezbah: 'Mezbah Keluarga', berita: 'Berita', beritaIsi: 'Berita', kontak: 'Kontak' };

let ROWS = [], FK = '', FB = '', MZL = [], MZB = '';
let EDIT = { id: null, tgl: null };
const KNAMA = { KU: 'Kebaktian Umum', PW: 'Persekutuan Wanita', PKP: 'Persekutuan Kaum Pria' };
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tgl = (t) => { const [y, m, d] = t.split('-'); return { y: +y, m: +m - 1, d: +d, wd: new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'UTC' }).format(new Date(t + 'T00:00:00Z')) }; };
// 'YYYYMMDDhhmm' in WIT (Asia/Jayapura) - date-only compare misses same-day services already past
const nowWIT = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jayapura', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
  const g = Object.fromEntries(p.map(x => [x.type, x.value]));
  return g.year + g.month + g.day + g.hour + g.minute;
};
// ponytail: waktu is free-text (admin default '09.30 WIT'); unparseable => sort last within its day
const waktuKey = (w) => { const m = /^(\d{1,2})[:.](\d{2})/.exec(w || ''); return m ? m[1].padStart(2, '0') + m[2] : '9999'; };
const sortKey = (r) => r.tanggal.replace(/-/g, '') + waktuKey(r.waktu);
const nextRow = (list = ROWS) => {
  const now = nowWIT();
  return list.filter(r => r.status !== 'BATAL' && sortKey(r) >= now).sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1)[0];
};
const renderNext = () => {
  const nx = nextRow();
  $('next').innerHTML = nx ? `<b>${esc(nx.judul)}</b><br>${esc(nx.komisi)}, ${tgl(nx.tanggal).wd} ${tgl(nx.tanggal).d} ${BULAN[tgl(nx.tanggal).m]}. <a href="#/jadwal"><b>Semua jadwal</b></a>` : '<a href="#/jadwal"><b>Lihat jadwal lengkap</b></a>';
};

function renderKomisi() {
  const q = ($('kCari').value || '').toLowerCase();
  const kom = [...new Set(['Kebaktian Umum', 'Pemuda', 'Remaja', 'PW', 'PKP', ...ROWS.map(r => r.komisi)])];
  $('kchips').innerHTML = [['', 'Semua']].concat(kom.map(k => [k, k])).map(([v, l]) =>
    `<button aria-pressed="${FK === v}" data-k="${esc(v)}" title="${esc(KNAMA[v] || v)}">${esc(l)}</button>`).join('');
  const months = [...new Set(ROWS.map(r => r.tanggal.slice(0, 7)))].sort();
  $('kBulan').innerHTML = '<option value="">Semua bulan</option>' + months.map(m => { const [y, mm] = m.split('-'); return `<option value="${m}"${FB === m ? ' selected' : ''}>${BULAN[+mm - 1]} ${y}</option>`; }).join('');
  const list = ROWS.filter(r => (!FK || r.komisi === FK) && (!FB || r.tanggal.startsWith(FB)) &&
    (!q || [r.judul, r.teks, r.pelayan_firman, r.liturgis, r.tuan_rumah, r.tujuan].join(' ').toLowerCase().includes(q)));
  const nextId = (nextRow(list) || {}).id;
  $('kInfo').textContent = list.length + ' jadwal' + (FK ? ' untuk komisi ' + (KNAMA[FK] || FK) : '') + '.';
  let out = '', cur = '';
  list.forEach(r => {
    const t = tgl(r.tanggal), key = r.tanggal.slice(0, 7);
    if (key !== cur) { cur = key; out += `<h2 class="kmon">${BULAN[t.m]} ${t.y}</h2>`; }
    const meta = [['Pelayan Firman', r.pelayan_firman], ['Liturgis', r.liturgis], ['Tuan Rumah', r.tuan_rumah], ['Tempat', [r.tempat, r.waktu].filter(Boolean).join(', ')]]
      .filter(x => x[1]).map(x => `<div>${x[0]}: <b>${esc(x[1])}</b></div>`).join('');
    out += `<article class="kitem${r.id === nextId ? ' next' : ''}${r.status === 'SELESAI' ? ' done' : ''}">
      <div class="kdate"><b>${t.d}</b><span>${t.wd}</span></div>
      <div><span class="badge">${esc(r.komisi)}</span>${r.status === 'BATAL' ? '<span class="badge x">Batal</span>' : ''}${r.id === nextId ? '<span class="tag">Berikutnya</span>' : ''}
      <h3>${esc(r.judul)}</h3>${r.teks ? `<div>Teks: <b>${refHTML(r.teks)}</b></div>` : ''}${r.nats_pembimbing ? `<div>Nats Pembimbing: ${esc(r.nats_pembimbing)}</div>` : ''}
      ${r.tujuan ? `<p class="pre">${esc(r.tujuan)}</p>` : ''}${meta ? `<div class="kmeta">${meta}</div>` : ''}
      ${ADMIN ? `<div class="dact"><button class="sm" type="button" data-ubah="${r.id}">Ubah jadwal</button></div>` : ''}</div></article>`;
  });
  $('klist').innerHTML = out || '<p class="note">Tidak ada jadwal yang cocok.</p>';

  renderNext();
}

function route() {
  const seg = location.hash.replace('#/', '').split('/');
  let p = seg[0] || 'beranda';
  // '#/berita/3' = rincian satu berita, '#/berita' = daftar; keduanya satu grup nav
  if (p === 'berita' && seg[1] !== undefined) p = 'beritaIsi';
  if (!(p in PAGES)) p = 'beranda';
  const nav = p === 'beritaIsi' ? 'berita' : p;
  document.querySelectorAll('.page').forEach(e => e.classList.toggle('on', e.id === p));
  document.querySelectorAll('#nav a').forEach(a => a.dataset.p === nav ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  document.title = (PAGES[p] ? PAGES[p] + ' | ' : '') + 'GK Kalam Kudus Kotaraja';
  window.scrollTo(0, 0);
  if (p === 'beranda') { loadToday(); loadBeritaMini(); }
  if (p === 'mezbah') loadMezbah(seg[1]);
  if (p === 'berita') loadBerita();
  if (p === 'beritaIsi') bukaBerita(seg[1]);
  if (p === 'jadwal' && seg[1] !== undefined) { FK = decodeURIComponent(seg[1]); if (ROWS.length) renderKomisi(); }
  // Kontak ikut memakai data-tek yang sama: alamat/telepon/sosmed disunting di tempat.
    if (p === 'tentang' || p === 'kontak') loadTentang();
}


// ---- Mezbah Keluarga (dari database) ----
const fmtTgl = (t) => new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(t + 'T00:00:00Z'));
const block = (label, v) => v ? `<h3 class="lbl">${label}</h3><p class="pre">${esc(v)}</p>` : '';

// Rujukan "Matius 4:18-22" -> link Alkitab SABDA (Terjemahan Baru).
// Satu rujukan pakai bible.php (tepat ke ayat). Rujukan majemuk
// "Matius 5:38-48; Yakobus 1:19-20" pakai search.php karena SABDA
// hanya menerima satu kitab/pasal per permintaan.
const SABDA = 'https://alkitab.sabda.org/';
// Terjemahan Baru Sadarini (TBS). Eksplisit agar tidak ikut berubah kalau
// SABDA ganti terjemahan default.
const VER = '&version=TBS';
function alkitabURL(ref) {
  const parts = String(ref || '').split(';').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  // Nama kitab tidak boleh mengandung ":" — tanpa itu "1 Tesalonika 4:3-8,
  // 1 Korintus 6:20" ditelan jadi book="...1 Korintus", chapter=6 (salah).
  const refs = parts.map(s => s.match(/^([^:]+?)\s+(\d+):([\d\s,\-–]+)$/));
  if (refs.some(r => !r)) return SABDA + 'search.php?search=' + encodeURIComponent(String(ref).trim()) + VER;
  if (refs.length === 1) {
    const [, kitab, pasal, ayat] = refs[0];
    return SABDA + 'bible.php?book=' + encodeURIComponent(kitab) +
      '&chapter=' + pasal + '&verse=' + encodeURIComponent(ayat.replace(/\s*[–—]\s*/g, '-')) + VER;
  }
  return SABDA + 'search.php?search=' + encodeURIComponent(parts.join('; ')) + VER;
}
// Tautan bacaan: tiap bacaan yang pisah ";" jadi link sendiri, bukan satu
// search.php gabungan — jadi "Amsal 4:20-27; Amsal 4:23" bisa diklik per ayat.
// Teks tetap tampil, jadi riwayat tetap terbaca walau link mati.
const refHTML = (ref) => {
  const parts = String(ref || '').split(';').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return esc(ref);
  return parts.map(p => {
    const u = alkitabURL(p);
    return u ? `<a class="ref" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(p)}</a>` : esc(p);
  }).join(' ');
};

// Teks share: field yang sama dengan isi dialog, urutan sama. Dipakai
// bukaBaca() untuk isi tombol WhatsApp.
function teksShare(m) {
  const bagian = [
    '*Renungan ' + fmtTgl(m.tanggal) + '*',
    m.judul || '',
    m.tema ? 'Tema: ' + m.tema : '',
    m.bacaan ? 'Bacaan: ' + m.bacaan : '',
    m.ayat ? 'Ayat kunci: ' + m.ayat : '',
    m.renungan ? 'Renungan:\n' + m.renungan : '',
    m.pesan ? 'Pesan hari ini:\n' + m.pesan : '',
    m.refleksi ? 'Refleksi:\n' + m.refleksi : '',
    m.doa_gkkk ? 'Pokok doa - Keluarga Besar GKKK:\n' + m.doa_gkkk : '',
    m.doa_misi ? 'Pokok doa - Misi:\n' + m.doa_misi : '',
    m.doa_penutup ? m.doa_penutup : '',
  ];
  return bagian.filter(s => s && s.trim()).join('\n\n');
}

let MZBACA = null; // entri yang lagi dibuka di dBaca; dipakai tombol share

function bukaBaca(src) {
  const got = typeof src === 'string'
    ? qMzSatu(src).catch(() => null)
    : Promise.resolve(src);
  got.then(m => {
    if (!m) return;
    MZBACA = m; // buat tombol share di dBaca
    $('bTgl').textContent = fmtTgl(m.tanggal);
    $('bJudul').textContent = m.judul || '-';
    $('bTema').textContent = m.tema ? 'Tema Mingguan: ' + m.tema : '';
    $('bIsi').innerHTML =
      (m.bacaan || m.ayat ? `<div class="two">${m.bacaan ? `<div class="card"><h3>Bacaan Alkitab</h3><p>${refHTML(m.bacaan)}</p></div>` : ''}${m.ayat ? `<div class="card"><h3>Ayat Kunci</h3><p>${refHTML(m.ayat)}</p></div>` : ''}</div>` : '') +
      block('Renungan', m.renungan) + block('Pesan Hari Ini', m.pesan) + block('Refleksi Keluarga', m.refleksi) +
      ((m.doa_gkkk || m.doa_misi) ? `<h3 class="lbl">Pokok Doa</h3>${m.doa_gkkk ? `<p class="sub">Keluarga Besar GKKK</p><p class="pre">${esc(m.doa_gkkk)}</p>` : ''}${m.doa_misi ? `<p class="sub">Misi</p><p class="pre">${esc(m.doa_misi)}</p>` : ''}` : '') +
      block('Doa Penutup', m.doa_penutup);
    panel('dBaca');
    $('dlg').setAttribute('aria-label', 'Renungan Mezbah Keluarga');
    $('dlg').showModal();
  });
}
$('mz').addEventListener('click', e => {
  if (e.target.dataset.ubah) return editMz(e.target.dataset.ubah);
  const t = e.target.dataset.mz; if (t) bukaBaca(t);
});
// wa.me dipakai, bukan api.whatsapp.com: itu host resmi, tanpa endpoint
// API, dan menerima teks yang sama lewat ?text=. Nomor tujuan tidak diisi, jadi
// pengguna sendiri yang memilih kontak di WhatsApp.
// jadi pengguna yang memilih kontak di WhatsApp.
$('waShare').addEventListener('click', () => {
  if (!MZBACA) return;
  window.open('https://wa.me/?text=' + encodeURIComponent(teksShare(MZBACA)), '_blank', 'noopener');
});
$('klist').addEventListener('click', e => { const id = e.target.dataset.ubah; if (id) editK(id); });

let MZTODAY = null;
async function loadToday() {
  const c = $('mzToday');
  try {
    const m = await qMzHariIni();
    if (!m) throw 0;
    MZTODAY = m;
    c.innerHTML = `<p class="rdate">${fmtTgl(m.tanggal)}</p><p class="tjudul">${esc(m.judul || 'Renungan')}</p>` +
      (m.tema ? `<p class="theme">Tema Mingguan: ${esc(m.tema)}</p>` : '') +
      (m.bacaan ? `<p class="note">Bacaan: ${refHTML(m.bacaan)}</p>` : '') +
      `<p style="margin:10px 0 0"><button class="sm" type="button" id="btnToday">Lihat renungan</button></p>`;
  } catch { c.innerHTML = '<p class="note">Belum ada renungan. <a href="#/mezbah"><b>Mulai di sini</b></a></p>'; }
}
$('mzToday').addEventListener('click', e => { if (e.target.id === 'btnToday' && MZTODAY) bukaBaca(MZTODAY); });

async function loadMezbah(buka) {
  try {
    MZL = await qMzDaftar();
    renderMezbah();
    if (buka) bukaBaca(buka);
  } catch { $('mz').innerHTML = '<p class="note">Renungan belum dapat dimuat.</p>'; }
}

// Sama dengan renderKomisi: penyaring bulan + cari, lalu kelompokkan per bulan.
function renderMezbah() {
  const q = ($('mzCari').value || '').toLowerCase();
  const months = [...new Set(MZL.map(r => r.tanggal.slice(0, 7)))].sort();
  $('mzBulan').innerHTML = '<option value="">Semua bulan</option>' + months.map(m => { const [y, mm] = m.split('-'); return `<option value="${m}"${MZB === m ? ' selected' : ''}>${BULAN[+mm - 1]} ${y}</option>`; }).join('');
  const list = MZL.filter(r => (!MZB || r.tanggal.startsWith(MZB)) &&
    (!q || [r.judul, r.tema, r.bacaan, r.ayat].join(' ').toLowerCase().includes(q)));
  $('mzInfo').textContent = list.length + ' renungan'
    + (MZB ? ' bulan ' + BULAN[+MZB.slice(5) - 1] + ' ' + MZB.slice(0, 4) : '')
    + (q ? ' untuk "' + q + '"' : '') + '.';
  let out = '', cur = '';
  list.forEach(x => {
    const t = tgl(x.tanggal), key = x.tanggal.slice(0, 7);
    if (key !== cur) { cur = key; out += `<h2 class="kmon">${BULAN[t.m]} ${t.y}</h2>`; }
    out += `<article class="mzi"><div class="mzb">
<p class="rdate">${fmtTgl(x.tanggal)}</p>
<h3>${esc(x.judul || 'Renungan')}</h3>
${x.tema ? `<p class="theme">Tema Mingguan: ${esc(x.tema)}</p>` : ''}
${(x.bacaan || x.ayat) ? `<div class="mmeta">${x.bacaan ? `<p><b>Bacaan Alkitab</b>${refHTML(x.bacaan)}</p>` : ''}${x.ayat ? `<p><b>Ayat Kunci</b>${refHTML(x.ayat)}</p>` : ''}</div>` : ''}
</div><div class="dact">${ADMIN ? `<button class="sm" type="button" data-ubah="${esc(x.tanggal)}">Ubah renungan</button>` : ''}<button class="sm" type="button" data-mz="${esc(x.tanggal)}">Lihat Renungan</button></div></article>`;
  });
  $('mz').innerHTML = out || '<p class="note">Tidak ada renungan yang cocok.</p>';
}

// ---- Berita / newsletter ----
let BRS = [];
const foto = (b) => String(b || '').split('\n').map(s => s.trim()).filter(Boolean);
const ringkas = (b) => b.ringkasan || String(b.isi || '').replace(/\s+/g, ' ').slice(0, 160);

const renderBerita = () => {
  $('blist').innerHTML = BRS.length ? BRS.map(b => {
    const f = foto(b.gambar)[0];
    return `<article class="bcard">
<a class="bthumb" href="#/berita/${b.id}" aria-label="Baca: ${esc(b.judul)}">${f
      ? `<img src="${esc(f)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'nofoto2', ariaHidden: 'true' }))">`
      : '<span class="nofoto2" aria-hidden="true"></span>'}</a>
<div class="bbody">
<p class="rdate">${esc(fmtTgl(b.tanggal))}</p>
<h3><a href="#/berita/${b.id}">${esc(b.judul)}</a></h3>
<p class="bringkas">${esc(ringkas(b))}${b.ringkasan ? '' : (String(b.isi).length > 160 ? '&hellip;' : '')}</p>
<div class="bact"><a class="sm alink" href="#/berita/${b.id}">Selengkapnya</a>${ADMIN ? `<button class="sm" type="button" data-ub="${b.id}">Ubah</button>` : ''}</div>
</div></article>`;
  }).join('') : '<p class="note">Belum ada berita.</p>';
  $('bInfo').textContent = BRS.length ? BRS.length + ' berita' : '';
};

async function loadBerita() {
  if (!BRS.length) {
    try { BRS = await qBeritaList(); }
    catch { $('blist').innerHTML = '<p class="note">Berita belum dapat dimuat. Muat ulang halaman.</p>'; return; }
  }
  renderBerita();
}

const loadBeritaMini = async () => {
  const el = $('bMini');
  if (!el) return;
  try {
    const d = await qBeritaList();
    const lima = d.slice(0, 5);
    el.innerHTML = lima.length ? lima.map(b => {
      const f = foto(b.gambar)[0];
      return `<article class="bmini">
<a href="#/berita/${b.id}" class="bmthumb" aria-hidden="true" tabindex="-1">${f ? `<img src="${esc(f)}" alt="" loading="lazy">` : '<span class="nofoto2"></span>'}</a>
<div><p class="rdate">${esc(fmtTgl(b.tanggal))}</p><h3><a href="#/berita/${b.id}">${esc(b.judul)}</a></h3></div>
</article>`;
    }).join('') : '<p class="note">Belum ada berita.</p>';
    $('bMiniLihat').hidden = !lima.length;
  } catch { el.innerHTML = '<p class="note">Berita belum dapat dimuat.</p>'; }
};

async function bukaBerita(id) {
  const host = $('d-Berita');
  host.innerHTML = '<p class="note">Memuat berita...</p>';
  const b = await qBerita(id).catch(() => null);
  if (!b) { host.innerHTML = '<p class="note">Berita tidak ditemukan.</p>'; return; }
  const f = foto(b.gambar);
  const paras = String(b.isi || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p class="pre">${esc(p)}</p>`).join('');
  host.innerHTML = `<article class="bisi">
<p class="rdate">${esc(fmtTgl(b.tanggal))}</p>
<h1>${esc(b.judul)}</h1>
${b.ringkasan ? `<p class="lead">${esc(b.ringkasan)}</p>` : ''}
${f.length ? `<div class="car" aria-roledescription="carousel" aria-label="Foto berita"><div class="carT"><img id="bCarImg" src="${esc(f[0])}" alt="Foto 1 dari ${f.length}"></div>
<div class="carN"><button class="sm" type="button" id="bCarPrev" aria-label="Foto sebelumnya" ${f.length < 2 ? 'disabled' : ''}>&larr;</button><span id="bCarCount" aria-live="polite">1 / ${f.length}</span><button class="sm" type="button" id="bCarNext" aria-label="Foto berikutnya" ${f.length < 2 ? 'disabled' : ''}>&rarr;</button></div></div>` : ''}
${paras}
${ADMIN ? `<div class="bact"><button class="sm" type="button" data-ub="${b.id}">Ubah berita ini</button></div>` : ''}
</article>`;
  if (f.length > 1) {
    let i = 0;
    const img = $('bCarImg'), cnt = $('bCarCount');
    const geser = (d) => {
      i = (i + d + f.length) % f.length;
      img.src = f[i];
      img.alt = `Foto ${i + 1} dari ${f.length}`;
      cnt.textContent = (i + 1) + ' / ' + f.length;
    };
    $('bCarPrev').onclick = () => geser(-1);
    $('bCarNext').onclick = () => geser(1);
  }
  if (ADMIN) host.querySelector('[data-ub]').onclick = () => editBerita(b.id);
  window.scrollTo(0, 0);
}

$('blist').addEventListener('click', e => { const id = e.target.dataset.ub; if (id) editBerita(id); });

// ---- Berita: tambah / ubah / hapus (server tetap mewajibkan admin) ----
const BFIELDS = ['tanggal', 'judul', 'ringkasan', 'gambar', 'isi'];
const bReset = () => {
  BFIELDS.forEach(k => { $('b_' + k).value = ''; });
  EDIT.id = null;
  $('bTitle2').textContent = 'Tambah berita';
  $('b_del').hidden = true;
  $('bmsg').textContent = '';
};
async function editBerita(id) {
  bReset();
  const b = await qBerita(id).catch(() => null);
  if (!b) return;
  BFIELDS.forEach(k => { $('b_' + k).value = b[k] ?? ''; });
  EDIT.id = b.id;
  $('bTitle2').textContent = 'Ubah berita';
  $('b_del').hidden = false;
  bukaDlg('fBerita', 'Berita');
}

$('kchips').addEventListener('click', e => { const k = e.target.dataset.k; if (k !== undefined) { FK = k; history.replaceState(null, '', '#/jadwal' + (k ? '/' + encodeURIComponent(k) : '')); renderKomisi(); } });
$('kBulan').addEventListener('change', e => { FB = e.target.value; renderKomisi(); });
$('kCari').addEventListener('input', renderKomisi);
$('mzBulan').addEventListener('change', e => { MZB = e.target.value; renderMezbah(); });
$('mzCari').addEventListener('input', renderMezbah);
window.addEventListener('hashchange', route);
qKomisi().then(d => { ROWS = d; renderKomisi(); })
  .catch(er => { $('klist').innerHTML = '<p class="note">Jadwal belum dapat dimuat: ' + esc(er.message) + '</p>'; });

/* ---- Tambah jadwal: dialog di tab Jadwal Ibadah (server tetap mewajibkan admin) ---- */
const NFIELDS = ['tipe', 'tanggal', 'komisi', 'judul', 'teks', 'nats_pembimbing', 'pelayan_firman', 'liturgis', 'tuan_rumah', 'tempat', 'waktu', 'status', 'tujuan'];
const NDEF = { tipe: 'KU', status: 'TERJADWAL', tempat: 'GKKK Kotaraja', waktu: '09.30 WIT' };
let ADMIN = false;
const panel = (id) => {
  ['fLogin', 'dNew', 'dMz', 'fImp', 'fBerita', 'fJemaat', 'dJm', 'dBaca'].forEach(p => { $(p).hidden = p !== id; });
  $('dlg').className = { fLogin: 'login', dNew: 'form', dMz: 'form', fImp: 'form', fBerita: 'form', fJemaat: 'form', dJm: 'form', dBaca: 'wide' }[id];
};
const Segarkan = async () => {
  ROWS = await qKomisi();
  MZL = await qMzDaftar();
};
// sesi Supabase Auth menentukan apa yang terlihat: tombol tambah, dan
// tombol ubah di tiap entri
const syncAdmin = async () => {
  const { data } = await SB.auth.getSession();
  ADMIN = !!data.session;
  $('btnLogin').textContent = ADMIN ? 'Keluar' : 'Login';
  $('btnLogin').title = ADMIN ? 'Keluar dari sesi admin' : 'Masuk sebagai admin';
  $('btnTambah').hidden = !ADMIN;
  $('btnMz').hidden = !ADMIN;
  $('btnBerita').hidden = !ADMIN;
  $('btnJemaatImp').hidden = !ADMIN;
  $('jmDash').hidden = !ADMIN;
  if (ADMIN) { await Segarkan(); await loadJemaat(); }
  // Login/logout mengubah siapa yang boleh menyunting: jalankan ulang supaya
  // atribut contenteditable ikut dipasang atau dilepas.
  loadTentang();
  renderKomisi();
  await loadMezbah();
  if (BRS.length) renderBerita();
};
let IMP_HOST = 'dNew', IMP_LABEL = 'Tambah jadwal';
const mode = (host, jenis, label) => {
  IMP_HOST = host; IMP_LABEL = label;
  $('imp_jenis').value = jenis;
  $('imp_out').textContent = '';
  $('impKembali').hidden = true;
};
$('impKembali').onclick = () => bukaDlg(IMP_HOST, IMP_LABEL);

const nTipe = () => $('dlg').querySelectorAll('[data-nkom]').forEach(e => { e.hidden = $('n_tipe').value !== 'KOMISI'; });
const nReset = () => {
  NFIELDS.forEach(k => { $('n_' + k).value = NDEF[k] ?? ''; });
  EDIT.id = null; $('nTitle').textContent = 'Tambah jadwal';
  $('nmsg').textContent = ''; $('nmsg2').textContent = '';
  nTipe();
};
$('n_del').onclick = async () => {
  const r = ROWS.find(x => x.id === EDIT.id);
  if (!r) return $('nmsg2').textContent = 'Tombol ini hanya untuk entri yang dibuka lewat "Ubah jadwal".';
  if (!confirm('Hapus jadwal "' + r.judul + '" tanggal ' + r.tanggal + '?')) return;
  $('nmsg2').textContent = 'Menghapus...';
  try {
    await hapusJadwal(EDIT.id);
    $('dlg').close(); EDIT.id = null;
    await Segarkan(); renderKomisi();
    $('kInfo').textContent = 'Jadwal dihapus: ' + r.tanggal + ' - ' + r.judul;
  } catch (er) { $('nmsg2').textContent = er.message; }
};
$('n_tipe').onchange = () => { if ($('n_tipe').value === 'KOMISI' && !$('n_judul').value) $('n_waktu').value = ''; nTipe(); };
$('btnTambah').onclick = async () => {
  await Segarkan(); nReset(); mode('dNew', 'jadwal', 'Tambah jadwal');
  bukaDlg('dNew', 'Tambah jadwal');
  $('n_tanggal').focus();
};
const MFIELDS = ['tanggal', 'judul', 'tema', 'bacaan', 'ayat', 'renungan', 'pesan', 'refleksi', 'doa_gkkk', 'doa_misi', 'doa_penutup'];
const mReset = () => {
  MFIELDS.forEach(k => { $('mz_' + k).value = ''; });
  $('mz_tanggal').value = new Date().toISOString().slice(0, 10);
  EDIT.tgl = null; $('mzTitle').textContent = 'Tambah renungan';
  $('mzm').textContent = '';
};
$('mz_del').onclick = async () => {
  if (!EDIT.tgl) return $('mzm').textContent = 'Tombol ini hanya untuk entri yang dibuka lewat "Ubah renungan".';
  const t = EDIT.tgl;
  if (!confirm('Hapus renungan tanggal ' + fmtTgl(t) + '?')) return;
  $('mzm').textContent = 'Menghapus...';
  try {
    await hapusMz(t);
    $('dlg').close(); EDIT.tgl = null;
    await Segarkan(); await loadMezbah();
    $('mzInfo').textContent = 'Renungan ' + fmtTgl(t) + ' dihapus.';
  } catch (er) { $('mzm').textContent = er.message; }
};
$('btnMz').onclick = async () => {
  await Segarkan(); mReset(); mode('dMz', 'mezbah', 'Tambah renungan');
  bukaDlg('dMz', 'Tambah renungan');
  $('mz_tanggal').focus();
};
$('dlg').addEventListener('click', e => { if (e.target === $('dlg')) $('dlg').close(); });
$('dlg').querySelectorAll('[data-x]').forEach(b => b.onclick = () => $('dlg').close());

/* ---- Validasi + tulis. Dulu ada di server.js (KF/FIELDS/BF); sekarang
   tidak ada server, jadi aturan yang sama pindah ke sini agar pesan
   errornya ramah. Batas panjang kolom tetap dijaga CHECK constraint
   di database sebagai jaring pengaman kedua. ---- */
// isNaN wajib: new Date('2026-13-01T00:00:00Z') adalah Invalid Date, dan
// .toISOString() di situ melempar RangeError, bukan mengembalikan false.
const validDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};
const MFLEN = { judul: 200, tema: 200, bacaan: 200, ayat: 200, renungan: 10000, pesan: 3000, refleksi: 3000, doa_gkkk: 10000, doa_misi: 5000, doa_penutup: 3000 };
function cleanMz(tanggal, b) {
  if (!validDate(tanggal)) throw new Error('Tanggal tidak valid (format YYYY-MM-DD).');
  const r = { tanggal };
  for (const [k, max] of Object.entries(MFLEN)) {
    let v = String(b[k] ?? '').replace(/\r\n/g, '\n').trim();
    if (v === '-') v = '';
    if (v.length > max) throw new Error(`Kolom ${k} terlalu panjang (maks. ${max} karakter).`);
    r[k] = v;
  }
  if (!r.judul) throw new Error('Judul wajib diisi.');
  if (!r.renungan) throw new Error('Renungan wajib diisi.');
  return r;
}
const BFLEN = { judul: 200, ringkasan: 600, isi: 20000, gambar: 4000 };
// foto berita: satu URL per baris. Hanya http(s) atau path internal yang
// diterima supaya admin tidak bisa menyisipkan skema lain (mis. data:).
const imgOK = (u) => /^(https?:\/\/|\/)/.test(u);
function cleanBerita(b) {
  const tanggal = String(b.tanggal || '').trim();
  if (!validDate(tanggal)) throw new Error('Tanggal tidak valid (format YYYY-MM-DD).');
  const r = { tanggal };
  for (const [k, max] of Object.entries(BFLEN)) {
    const v = String(b[k] ?? '').replace(/\r\n/g, '\n').trim();
    if (v.length > max) throw new Error(`Kolom ${k} terlalu panjang (maks. ${max} karakter).`);
    r[k] = v;
  }
  if (!r.judul) throw new Error('Judul wajib diisi.');
  if (!r.isi) throw new Error('Isi berita wajib diisi.');
  const imgs = [...new Set(r.gambar.split('\n').map(s => s.trim()).filter(imgOK))];
  if (imgs.length > 12) throw new Error('Maksimal 12 foto per berita.');
  r.gambar = imgs.join('\n');
  return r;
}
const KFLEN = { komisi: 40, jenis_ibadah: 80, tuan_rumah: 120, liturgis: 120, pelayan_firman: 120, judul: 200, teks: 200, nats_pembimbing: 200, tujuan: 3000, tempat: 120, waktu: 40 };
function cleanKomisi(b) {
  const tanggal = String(b.tanggal || '').trim();
  if (!validDate(tanggal)) throw new Error('Tanggal tidak valid (format YYYY-MM-DD).');
  const r = { tanggal };
  for (const [k, max] of Object.entries(KFLEN)) {
    const v = String(b[k] ?? '').trim();
    if (v.length > max) throw new Error(`Kolom ${k} terlalu panjang (maks. ${max} karakter).`);
    r[k] = v;
  }
  r.tipe = b.tipe === 'KU' ? 'KU' : 'KOMISI';
  if (r.tipe === 'KU') { r.komisi = 'Kebaktian Umum'; r.tuan_rumah = ''; if (!r.jenis_ibadah) r.jenis_ibadah = 'Kebaktian Umum'; }
  if (!r.komisi) throw new Error('Komisi wajib diisi.');
  if (!r.judul) throw new Error('Judul wajib diisi.');
  r.status = ['TERJADWAL', 'SELESAI', 'BATAL'].includes(b.status) ? b.status : 'TERJADWAL';
  return r;
}
const JFLEN = { no_keluarga: 20, nama_keluarga: 80, nama: 120, kepala: 120, pelayanan: 120, daerah: 120, alamat: 400, hp: 40 };
// Satu validator dipakai dua tempat: impor Excel oleh admin, dan form
// publik. Batas panjang di sini sama dengan CHECK di database.
function cleanJemaat(b) {
  const r = {};
  for (const [k, max] of Object.entries(JFLEN)) {
    const v = String(b[k] ?? '').trim();
    if (v.length > max) throw new Error(`Kolom ${k} terlalu panjang (maks. ${max} karakter).`);
    r[k] = v;
  }
  if (!r.nama) throw new Error('Nama wajib diisi.');
  r.jk = String(b.jk ?? '').trim().toUpperCase();
  if (!['', 'L', 'P'].includes(r.jk)) throw new Error('Jenis kelamin harus L atau P.');
  const l = String(b.lahir ?? '').trim();
  r.lahir = l ? l : null;
  if (l && !validDate(l)) throw new Error('Tanggal lahir tidak valid (format YYYY-MM-DD).');
  return r;
}
// RLS yang benar-benar menolak tulis tanpa login; cek di sini cuma
// supaya pesan errornya ramah, bukan pengaman keamanan.
const butuhAdmin = () => { if (!ADMIN) throw new Error('Belum login sebagai admin.'); };
const hapusJadwal = (id) => { butuhAdmin(); return sb(db('jadwal_komisi').delete().eq('id', id)); };
const simpanJadwal = (r, id) => {
  butuhAdmin();
  return id ? sb(db('jadwal_komisi').update(r).eq('id', id).select().single())
            : sb(db('jadwal_komisi').insert(r).select().single());
};
const hapusMz = (t) => { butuhAdmin(); return sb(db('mezbah').delete().eq('tanggal', t)); };
// tanggal sudah PRIMARY KEY, jadi cukup upsert
const simpanMz = (r) => { butuhAdmin(); return sb(db('mezbah').upsert(r, { onConflict: 'tanggal' }).select().single()); };
const hapusBerita = (id) => { butuhAdmin(); return sb(db('berita').delete().eq('id', id)); };
const simpanBerita = (r, id) => {
  butuhAdmin();
  return id ? sb(db('berita').update(r).eq('id', id).select().single())
            : sb(db('berita').insert(r).select().single());
};
$('fLogin').onsubmit = async e => {
  e.preventDefault();
  if (!SB) return $('nmsg').textContent = 'Konfigurasi Supabase belum diisi.';
  $('nmsg').textContent = 'Memeriksa akun...';
  try {
    // Supabase Auth juga tidak melempar error: selalu periksa .error
    const { error } = await SB.auth.signInWithPassword({ email: $('nemail').value.trim(), password: $('npw').value });
    if (error) throw new Error(/invalid login credentials/i.test(error.message) ? 'Email atau kata sandi salah.' : error.message);
    $('npw').value = ''; $('dlg').close();
    await syncAdmin();
  } catch (er) { $('nmsg').textContent = er.message; $('npw').select(); }
};
$('fNew').onsubmit = async e => {
  e.preventDefault();
  const body = {}; NFIELDS.forEach(k => { body[k] = $('n_' + k).value; });
  $('nmsg2').textContent = 'Menyimpan...';
  try {
    const r = await simpanJadwal(cleanKomisi(body), EDIT.id);
    $('dlg').close(); EDIT.id = null;
    ROWS = await qKomisi();
    renderKomisi();
    $('kInfo').textContent = 'Jadwal baru tersimpan: ' + r.tanggal + ' - ' + r.judul;
  } catch (er) { $('nmsg2').textContent = er.message; }
};
$('fMz').onsubmit = async e => {
  e.preventDefault();
  const body = {}; MFIELDS.forEach(k => { body[k] = $('mz_' + k).value; });
  $('mzm').textContent = 'Menyimpan...';
  try {
    const r = await simpanMz(cleanMz(body.tanggal, body));
    $('dlg').close();
    $('mzInfo').textContent = 'Renungan ' + fmtTgl(r.tanggal) + ' tersimpan.';
    await loadMezbah();
  } catch (er) { $('mzm').textContent = er.message; }
};
/* ---- Sesi admin: tombol di menu bar, "Ubah" per entri, impor dari tiap dialog tambah ---- */
const bukaDlg = (id, label) => {
  panel(id);
  $('dlg').setAttribute('aria-label', label);
  $('dlg').showModal();
};
$('btnLogin').onclick = async () => {
  if (ADMIN) {
    await SB.auth.signOut().catch(() => {});
    await syncAdmin();
    return;
  }
  $('nmsg').textContent = '';
  bukaDlg('fLogin', 'Masuk sebagai admin');
  $('nemail').focus();
};
// "Ubah" di tiap entri jadwal: buka dialog yang sama dalam mode edit
const editK = async id => {
  const r = ROWS.find(x => String(x.id) === String(id));
  if (!r) return;
  nReset();
  NFIELDS.forEach(k => { $('n_' + k).value = r[k] ?? ''; });
  EDIT.id = r.id; nTipe();
  $('nTitle').textContent = 'Ubah jadwal';
  $('nmsg2').textContent = '"Simpan jadwal" menimpa entri ' + r.tanggal + '.';
  mode('dNew', 'jadwal', 'Ubah jadwal');
  bukaDlg('dNew', 'Ubah jadwal');
  $('n_judul').focus();
};
const editMz = async t => {
  const r = await qMzSatu(t).catch(() => null);
  if (!r) return alert('Entri itu tidak bisa dimuat.');
  mReset();
  MFIELDS.forEach(k => { $('mz_' + k).value = r[k] ?? ''; });
  EDIT.tgl = t;
  $('mzTitle').textContent = 'Ubah renungan';
  $('mzm').textContent = '"Simpan renungan" menimpa entri ' + fmtTgl(t) + '.';
  mode('dMz', 'mezbah', 'Ubah renungan');
  bukaDlg('dMz', 'Ubah renungan');
  $('mz_judul').focus();
};
$('dlg').querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
  if (b.dataset.mode !== 'import') return;
  $('imp_out').textContent = '';
  $('impKembali').hidden = false;
  bukaDlg('fImp', 'Impor dari Excel');
});
/* ---- impor massal dari CSV ----
   .xlsx asli itu zip berisi XML dan butuh pustaka; CSV tetap bisa
   dibuka/diedit di Excel tanpa dependensi baru. Seluruh logika ini
   dipindah dari server.js supaya tetap jalan tanpa server. */
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
    clean: cleanKomisi, tab: 'jadwal_komisi', onConflict: 'tanggal,komisi', kunci: (r) => r.tanggal + '|' + r.komisi
  },
  mezbah: {
    cols: M_COLS, need: ['tanggal', 'judul', 'renungan'], file: 'template-renungan.csv',
    contoh: { tanggal: '2026-11-08', judul: 'Judul renungan', tema: 'Tema minggu ini', bacaan: 'Lukas 10:21-24', ayat: 'Lukas 10:24', renungan: 'Tulis isi renungan di sini.', pesan: 'Pesan singkat hari ini.', refleksi: 'Pertanyaan untuk keluarga.', doa_gkkk: 'Pokok doa keluarga besar GKKK.', doa_misi: 'Pokok doa misi.', doa_penutup: '' },
    clean: (b) => cleanMz(b.tanggal, b), tab: 'mezbah', onConflict: 'tanggal', kunci: (r) => r.tanggal
  },
  jemaat: {
    cols: ['no_keluarga', 'nama_keluarga', 'nama', 'kepala', 'jk', 'lahir', 'pelayanan', 'daerah', 'alamat', 'hp'], need: ['nama'], file: 'template-jemaat.csv',
    contoh: { no_keluarga: '1', nama_keluarga: 'Sagala', nama: 'Yenro Sagala', kepala: 'Bapak Sagala / Ibu Simbolon', jk: 'L', lahir: '1990-01-31', pelayanan: 'Liturgos', daerah: 'Samosir, Sumatera Utara', alamat: 'Kotaraja, Jayapura', hp: '081234567890' },
    clean: cleanJemaat, tab: 'jemaat', onConflict: 'no_keluarga,nama', kunci: (r) => r.no_keluarga + '|' + r.nama
  }
};

// template dulu diambil dari /api/template/:jenis; sekarang dibuat di browser
$('imp_tpl').onclick = (e) => {
  e.preventDefault();
  const s = SPECS[$('imp_jenis').value];
  if (!s) return;
  const txt = BOM + [csvRow(s.cols), csvRow(s.cols.map(c => s.contoh[c] ?? ''))].join('\r\n');
  const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = s.file; a.click();
  URL.revokeObjectURL(url);
};
$('imp_jenis').onchange = () => { $('imp_out').textContent = ''; };

/* ---- Data Jemaat: dashboard di Tentang, pendaftaran di Kontak ---- */
let JM = [], JMP = [];
const JF = ['nama', 'nama_keluarga', 'kepala', 'jk', 'lahir', 'pelayanan', 'daerah', 'alamat', 'hp'];
const jmTgl = (l) => { if (!l) return '-'; const t = tgl(l); return t.d + ' ' + BULAN[t.m].slice(0, 3) + ' ' + t.y; };
const jmUsia = (l) => { if (!l) return ''; const u = new Date().getFullYear() - +l.slice(0, 4); return u >= 0 && u < 130 ? u + ' th' : ''; };
// Satu pendaftaran keluarga = beberapa baris yang berbagi keluarga_ref.
// Baris lama yang belum punya ref diperlakukan satu per satu lewat id, jadi
// tidak pernah ikut tertimpa saat ada keluarga baru masuk.
const refDaftar = (p) => p.keluarga_ref || 'id' + p.id;
const grupDaftar = () => {
  const g = new Map();
  for (const p of JMP) { const k = refDaftar(p); if (!g.has(k)) g.set(k, []); g.get(k).push(p); }
  return [...g.values()];
};
// Baris yang sedang tampil, ikut saringan keluarga + pencarian. Dipakai dua
// kali: untuk tabel dan untuk berkas unduhan, jadi yang diunduh selalu sama
// dengan yang terlihat di layar.
const rowsJemaat = () => {
  const cari = $('jmCari').value.trim().toLowerCase(), pil = $('jmKlg').value;
  return JM.filter(r => (pil === '' || (r.no_keluarga || r.nama_keluarga) === pil)
    && (!cari || (r.nama + ' ' + r.nama_keluarga).toLowerCase().includes(cari)));
};
const renderJemaat = () => {
  const kls = JM.map(r => r.no_keluarga || r.nama_keluarga).filter(Boolean);
  $('jmStat').innerHTML = [['Keluarga', new Set(kls).size], ['Jiwa', JM.length],
    ['Laki-laki', JM.filter(r => r.jk === 'L').length], ['Perempuan', JM.filter(r => r.jk === 'P').length],
    ['Menunggu', JMP.length]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
  $('jmPending').innerHTML = JMP.length
    ? grupDaftar().map(grp => {
        const s = grp[0];
        return `<div class="jmrow"><div><b>${esc(s.nama)}</b> &middot; ${esc(s.jk || '-')} &middot; ${esc(s.nama_keluarga || 'tanpa nama keluarga')}`
          + `<br><span>${esc(jmTgl(s.lahir))}${s.pelayanan ? ' &middot; ' + esc(s.pelayanan) : ''}${s.daerah ? ' &middot; ' + esc(s.daerah) : ''}${s.hp ? ' &middot; ' + esc(s.hp) : ''}</span>`
          + (grp.length > 1 ? `<br><span>Anggota lain: ${grp.slice(1).map(p => esc(p.nama)).join(', ')}</span>` : '')
          + `<br><span>${grp.length} orang</span></div>`
          + `<button class="sm" type="button" data-terima="${esc(refDaftar(grp[0]))}">Terima</button></div>`;
      }).join('')
    : '<p class="note" style="margin:0">Belum ada pendaftaran baru.</p>';
  const list = rowsJemaat();
  $('jmList').innerHTML = list.length
    ? '<table class="jmtab"><thead><tr><th>No</th><th>Nama</th><th>L/P</th><th>Lahir</th><th>Usia</th><th>Keluarga</th><th>Kerinduan Pelayanan</th><th>HP</th><th></th></tr></thead><tbody>'
      + list.map(r => `<tr><td>${esc(r.no_keluarga)}</td><td>${esc(r.nama)}</td><td>${esc(r.jk || '-')}</td>`
        + `<td>${esc(jmTgl(r.lahir))}</td><td>${esc(jmUsia(r.lahir))}</td><td>${esc(r.nama_keluarga)}</td>`
        + `<td>${esc(r.pelayanan || '-')}</td><td>${esc(r.hp)}</td>`
        + `<td><button class="sm" type="button" data-ubah="${esc(r.id)}">Ubah</button></td></tr>`).join('')
      + '</tbody></table>'
    : '<p class="note" style="margin:0">Belum ada data. Unduh template Excel lalu impor, atau pakai tombol Impor di halaman Kontak.</p>';
};
$('jmList').onclick = e => {
  const b = e.target.closest('[data-ubah]');
  if (b) editJm(b.dataset.ubah);
};
// ponytail: seluruh daftar dimuat ke memori (untuk statistik, filter, dan nomor
// keluarga otomatis). Cukup untuk ribuan jiwa; kalau tabel tumbuh sampai itu,
// ganti dengan RPC COUNT dan penomoran di database.
const loadJemaat = async () => {
  if (!ADMIN) return;
  [JM, JMP] = await Promise.all([qJemaat(), qPending()]);
  const kls = [...new Set(JM.map(r => r.no_keluarga || r.nama_keluarga).filter(Boolean))].sort();
  $('jmKlg').innerHTML = '<option value="">Semua keluarga</option>' + kls.map(k => `<option>${esc(k)}</option>`).join('');
  renderJemaat();
  loadStatJemaat();
};
// Statistik publik di Tentang. Datanya dari view jemaat_ringkasan yang hanya
// mengembalikan hitungan, jadi RLS public.jemaat tidak perlu dibuka dan
// nama/alamat/HP tetap tidak bisa dibaca pengunjung.
// ponytail: satu query, satu baris, lalu digambar jadi batang CSS. Kalau nanti
// butuh grafik wielapis, ganti isi view-nya - jangan bawa pustaka grafik.
const renderStat = (s) => {
  const maks = Math.max(1, ...Object.values(s));
  const bar = (label, n) => `<div class="jbar"><span>${label}</span><i style="width:${Math.round(n / maks * 100)}%"></i><b>${n}</b></div>`;
  $('jStat').innerHTML = bar('Jiwa', s.jiwa) + bar('Keluarga', s.keluarga)
    + bar('Laki-laki', s.laki) + bar('Perempuan', s.perempuan)
    + bar('Anak (&lt;12)', s.anak) + bar('Remaja 13-17', s.remaja)
    + bar('Dewasa 18-59', s.dewasa) + bar('Lansia 60+', s.lansia);
  $('jStatKosong').hidden = s.jiwa > 0;
};
const loadStatJemaat = async () => {
  const kosong = $('jStatKosong');
  try {
    const { data } = await sb(db('jemaat_ringkasan').select('*').limit(1));
    if (data && data[0]) return renderStat(data[0]);
    kosong.textContent = 'Belum ada data resmi untuk ditampilkan.';
  } catch (er) {
    // View-nya belum ada / belum dijalankan, bukan emptiness data.
    kosong.textContent = 'Statistik belum siap diproses. Silakan hubungi pengelola.';
  }
  kosong.hidden = false;
};
// ---- Kalimat statis di Tentang yang bisa disunting admin di tempat ----
// Satu baris per kunci di tabel teks_tentang (lihat supabase-migration.sql).
// Menambah kalimat yang bisa disunting = tambah atribut data-tek="..." di
// index.html saja; tidak ada kolom, endpoint, atau kode baru per kalimat.
const TEK_MAKS = 800;

// Dua aturan yang tidak boleh dilanggar di bagian ini:
//  1) Teks dari database SELALU dipasang lewat textContent, tidak pernah
//     innerHTML. Kalau sekali saja pakai innerHTML, satu `<img onerror>`
//     yang tersimpan akan dieksekusi untuk setiap pengunjung.
//  2) onpaste memaksa teks polos, jadi HTML dari clipboard tidak pernah masuk
//     ke DOM walau peramban tidak mendukung plaintext-only.
//
// `pasangTentang` sengaja dipisah dari `loadTentang`: semua keputusan soal
// hak akses, sanitasi, dan batas panjang ada di satu fungsi pure, jadi bisa
// diperiksa tanpa browser dan tanpa menyentuh jaringan.
const pasangTentang = (nodes, isi, admin, simpan) => {
  for (const el of nodes) {
    const k = el.dataset.tek;
    if (typeof isi[k] === 'string') el.textContent = isi[k];
    if (!admin) { el.removeAttribute('contenteditable'); el.onblur = null; el.onpaste = null; continue; }
    el.setAttribute('contenteditable', 'plaintext-only');
    el.title = 'Klik lalu ketik untuk mengubah. Teks tersimpan sendiri.';
    // onblur/onpaste (bukan addEventListener) supaya panggilan berulang
    // menimpa handler, bukan menumpuknya.
    el.onpaste = (ev) => {
      ev.preventDefault();
      const t = (ev.clipboardData || window.clipboardData || {}).getData('text/plain') || '';
      document.execCommand('insertText', false, t.replace(/\s+/g, ' '));
    };
    el.onblur = () => {
      const v = el.textContent.replace(/\s+/g, ' ').trim().slice(0, TEK_MAKS);
      el.textContent = v; // trim + batas panjang terlihat sama dengan yang tersimpan
      simpan(k, v);
    };
  }
};

const loadTentang = async () => {
  let isi = {};
  try { isi = Object.fromEntries((await sb(db('teks_tentang').select('kunci,isi'))).map(r => [r.kunci, r.isi])); }
  catch (er) {
    // Tabel belum ada / offline / RLS belum dijalankan: pakai teks yang
    // sudah tertanam di index.html supaya halaman tidak pernah kosong.
  }
  pasangTentang(document.querySelectorAll('[data-tek]'), isi, ADMIN, async (kunci, isiBaru) => {
    butuhAdmin();
    try {
      await sb(db('teks_tentang').upsert({ kunci, isi: isiBaru, diubah: new Date().toISOString() }, { onConflict: 'kunci' }));
    } catch (er) { alert('Gagal menyimpan teks: ' + er.message); }
  });
};

// ---- Ubah data resmi + unduh CSV ---------------------------------------
// RLS sudah mengizinkan UPDATE untuk yang login (lihat supabase-migration.sql),
// jadi ini murni UI: tidak ada tabel, kolom, atau migration baru.
const simpanJemaat = (r, id) => {
  butuhAdmin();
  return id ? sb(db('jemaat').update(r).eq('id', id).select().single())
            : sb(db('jemaat').insert(r).select().single());
};
const editJm = (id) => {
  const r = JM.find(x => String(x.id) === String(id));
  if (!r) return;
  JF.forEach(k => { $('ju_' + k).value = r[k] ?? ''; });
  EDIT.id = r.id;
  $('jumsg').textContent = 'Keluarga ' + (r.no_keluarga || '-') + ' - ' + r.nama;
  bukaDlg('dJm', 'Ubah data jemaat');
  $('ju_nama').focus();
};
$('dJm').onsubmit = async e => {
  e.preventDefault();
  const body = {};
  JF.forEach(k => { body[k] = $('ju_' + k).value; });
  $('jumsg').textContent = 'Menyimpan...';
  try {
    // no_keluarga dibuang supaya nomor keluarga tidak berubah tidak sengaja.
    // Kolom diubah diisi di sisi ini, jadi tidak perlu trigger di database.
    const { no_keluarga, ...row } = cleanJemaat(body);
    if (row.hp && !/^[0-9+()\s.-]{6,}$/.test(row.hp)) throw new Error('Nomor HP hanya boleh berisi angka, spasi, dan tanda + - ( ).');
    await simpanJemaat({ ...row, diubah: new Date().toISOString() }, EDIT.id);
    $('dlg').close(); EDIT.id = null;
    await loadJemaat();
  } catch (er) { $('jumsg').textContent = er.message; }
};
// Unduh data resmi. Memakai saringan yang sedang aktif, jadi "Semua keluarga"
// berarti seluruh database dan memilih satu keluarga hanya berarti keluarga itu.
const JC = ['no_keluarga', ...JF];
const csvJemaat = (list) => BOM + [csvRow(JC), ...list.map(r => csvRow(JC.map(c => {
  const v = String(r[c] ?? '');
  // Excel menjalankan nilai yang diawali = + - @ sebagai rumus, jadi dikunci
  // dengan tanda kutip tunggal. ponytail: tanda kutip itu ikut tersimpan kalau
  // nama mirip-rumus lalu berkas ini diimpor lagi - jarang, dan lebih baik
  // daripada membuka rumus dari data yang tidak dipercaya.
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
})))].join('\r\n');
$('jmCsv').onclick = () => {
  const list = rowsJemaat();
  if (!list.length) return alert('Tidak ada data yang cocok dengan saringan sekarang.');
  const pil = $('jmKlg').value;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csvJemaat(list)], { type: 'text/csv;charset=utf-8' }));
  a.download = 'jemaat' + (pil ? '-' + pil : '-semua') + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
};
$('jmCari').oninput = $('jmKlg').onchange = renderJemaat;
// Pendaftaran publik. Menulis ke jemaat_daftar, bukan jemaat: policy anon
// hanya punya INSERT di tabel itu, jadi pengunjung tidak bisa membaca atau
// menyunting daftar resmi.
$('btnDaftar').onclick = () => {
  JF.forEach(k => { $('j_' + k).value = ''; });
  $('jAgg').innerHTML = '';
  $('jmsg').textContent = '';
  bukaDlg('fJemaat', 'Gabung menjadi Jemaat');
};
// Baris anggota keluarga. Pakai elemen <template> bawaan: satu baris ditulis
// sekali di HTML, lalu disalin saat tombol ditekan.
$('jTambahAgg').onclick = () => $('jAgg').appendChild($('tplAgg').content.cloneNode(true));
$('jAgg').onclick = e => { const b = e.target.closest('[data-x]'); if (b) b.closest('.jagg').remove(); };
// Satu pendaftaran = satu keluarga. Tiap orang jadi satu baris di
// jemaat_daftar; semua baris berbagi satu keluarga_ref supaya admin
// melihatnya sebagai satu keluarga, bukan daftar orang terpisah.
const acakRef = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
$('fJemaat').onsubmit = async e => {
  e.preventDefault();
  const body = {};
  JF.forEach(k => { body[k] = $('j_' + k).value; });
  try {
    const { no_keluarga, ...kepala } = cleanJemaat(body);
    if (kepala.hp && !/^[0-9+()\s.-]{6,}$/.test(kepala.hp)) throw new Error('Nomor HP hanya boleh berisi angka, spasi, dan tanda + - ( ).');
    const ref = acakRef();
    const rows = [{ ...kepala, keluarga_ref: ref }];
    for (const box of $('jAgg').children) {
      const a = { nama: box.querySelector('.a_nama').value, jk: box.querySelector('.a_jk').value, lahir: box.querySelector('.a_lahir').value, pelayanan: box.querySelector('.a_pelayanan').value };
        if (!a.nama.trim() && !a.jk && !a.lahir && !a.pelayanan.trim()) continue; // baris yang dikosongkan bukan anggota
      const { no_keluarga: _nk, ...m } = cleanJemaat(a); // batas panjang sama seperti database
      rows.push({ ...m, nama_keluarga: kepala.nama_keluarga, kepala: kepala.kepala, keluarga_ref: ref });
    }
    await sb(db('jemaat_daftar').insert(rows));
    JF.forEach(k => { $('j_' + k).value = ''; });
    $('jAgg').innerHTML = '';
    $('jmsg').innerHTML = '<b>Terima kasih, pendaftaran Anda sudah diterima.</b> ' + rows.length
      + ' orang dari keluarga ini tercatat. Pengelola akan memverifikasi dan memasukkan data ini ke daftar resmi.';
  } catch (er) { $('jmsg').textContent = er.message; }
};
const bukaImpJemaat = () => {
  $('imp_jenis').value = 'jemaat';
  $('imp_out').textContent = '';
  $('impKembali').hidden = true;
  bukaDlg('fImp', 'Impor data Jemaat');
};
$('btnJemaatImp').onclick = bukaImpJemaat;
$('jmImp').onclick = bukaImpJemaat;
$('jmTpl').onclick = () => { $('imp_jenis').value = 'jemaat'; $('imp_tpl').click(); };
// Nomor keluarga untuk pendaftar yang diterima dibuat otomatis supaya tidak
// bentrok dengan nomor yang sudah dipakai di daftar resmi. Satu nomor dipakai
// oleh seluruh anggota keluarga itu, karena no_keluarga yang mengelompokkan.
$('jmPending').onclick = async e => {
  const t = e.target.closest('[data-terima]');
  if (!t) return;
  const ref = t.dataset.terima;
  const grp = JMP.filter(p => refDaftar(p) === ref);
  if (!grp.length) return;
  const namaKlg = grp[0].nama_keluarga || grp[0].nama;
  if (!confirm('Terima ' + grp.length + ' orang dari keluarga ' + namaKlg + ' ke daftar resmi?')) return;
  t.disabled = true;
  try {
    const no = String(Math.max(0, ...JM.map(r => +r.no_keluarga || 0)) + 1);
    // Dua orang bers nama sama dalam satu keluarga akan menabrak UNIQUE
    // (no_keluarga, nama) dan menggagalkan seluruh approve, jadi sekali lagi
    // dibuang di sini.
    const unik = [...new Map(grp.map(p => [p.nama, p])).values()];
    await sb(db('jemaat').upsert(unik.map(p => ({
      no_keluarga: no, nama_keluarga: p.nama_keluarga, nama: p.nama, kepala: p.kepala,
      jk: p.jk, lahir: p.lahir, pelayanan: p.pelayanan, daerah: p.daerah, alamat: p.alamat, hp: p.hp
    })), { onConflict: 'no_keluarga,nama' }));
    // Hapus lewat keluarga_ref kalau baris itu punya; baris pendaftaran lama
    // tidak punya, jadi ikut terhapus lewat id-nya. Dicek dari datanya, bukan
    // dari awalan "id", supaya ref acak yang kebetulan diawali huruf yang sama
    // tidak salah hapus.
    const del = grp[0].keluarga_ref
      ? sb(db('jemaat_daftar').delete().eq('keluarga_ref', ref))
      : sb(db('jemaat_daftar').delete().eq('id', grp[0].id));
    await del;
    await loadJemaat();
  } catch (er) { t.disabled = false; $('jmPending').prepend(er); }
};

$('btnBerita').onclick = () => { bReset(); bukaDlg('fBerita', 'Berita'); };
$('b_del').onclick = async () => {
  if (!EDIT.id) return;
  if (!confirm('Hapus berita ini? Tindakan ini tidak bisa dibatalkan.')) return;
  await hapusBerita(EDIT.id);
  BRS = BRS.filter(b => b.id !== EDIT.id);
  $('dlg').close();
  if (location.hash.startsWith('#/berita/')) location.hash = '#/berita';
  renderBerita();
};
$('fBerita').onsubmit = async e => {
  e.preventDefault();
  const body = {};
  BFIELDS.forEach(k => { body[k] = $('b_' + k).value.trim(); });
  try {
    await simpanBerita(cleanBerita(body), EDIT.id);
    $('dlg').close();
    BRS = [];
    await loadBerita();
    loadBeritaMini();
  } catch (er) { $('bmsg').textContent = er.message; }
};
$('fImp').onsubmit = async e => {
  e.preventDefault();
  const f = $('imp_file').files[0];
  if (!f) { $('imp_out').textContent = 'Pilih berkas CSV dulu.'; return; }
  const s = SPECS[$('imp_jenis').value];
  if (!s) { $('imp_out').textContent = 'Jenis tidak dikenal.'; return; }
  if (!confirm(`Impor ${f.name}?\n\nTanggal yang sudah ada akan diperbarui, bukan digandakan.`)) return;
  $('imp_out').textContent = 'Mengimpor...';
  try {
    const rows = parseCSV(await f.text());
    if (rows.length < 2) throw new Error('CSV hanya berisi baris judul, tidak ada data.');

    // kolom dibaca dari baris judul, bukan urutan, jadi admin bebas menukar kolom
    const at = {};
    rows[0].map(h => h.trim().toLowerCase()).forEach((h, i) => { if (s.cols.includes(h) && at[h] === undefined) at[h] = i; });
    const kurang = s.need.filter(k => at[k] === undefined);
    if (kurang.length) throw new Error(`Kolom wajib belum ada di baris judul: ${kurang.join(', ')}`);

    // validasi semua baris dulu: satu baris salah tidak boleh membatalkan sisanya
    const good = [], errors = [];
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      if (cells.every(c => !c.trim())) continue;
      const body = {};
      s.cols.forEach(c => { body[c] = at[c] === undefined ? '' : (cells[at[c]] ?? ''); });
      try { good.push(s.clean(body)); }
      catch (er) { errors.push({ baris: i + 1, pesan: er.message }); }
    }
    if (!good.length && !errors.length) throw new Error('Tidak ada baris data di CSV.');

    // Dua baris dengan kunci alami sama dalam satu CSV akan ditolak Postgres
    // ("cannot affect row a second time"). Yang terakhir menang, sama seperti
    // server lama yang memproses baris demi baris.
    const unik = new Map();
    good.forEach(r => unik.set(s.kunci(r), r));
    const list = [...unik.values()];

    // ponytail: seluruh kunci alami dimuat ke memori untuk menghitung
    // added vs updated. Cukup untuk ribuan baris; kalau tabel tumbuh sampai
    // itu, ganti dengan RPC atau kolom penanda.
    const keyCols = s.onConflict.split(',').map(x => x.trim()).join(',');
    const lama = new Set((await sb(db(s.tab).select(keyCols))).map(s.kunci));
    const now = new Date().toISOString();
    list.forEach(r => { r.diubah = now; });
    if (list.length) await sb(db(s.tab).upsert(list, { onConflict: s.onConflict }));

    const added = list.filter(r => !lama.has(s.kunci(r))).length;
    const err = errors.slice(0, 50).map(x => `baris ${x.baris}: ${x.pesan}`).join('; ');
    $('imp_out').textContent = `Selesai. ${added} baru, ${list.length - added} diperbarui, ${errors.length} gagal (dari ${list.length + errors.length} baris).` + (err ? ' Gagal -> ' + err : '');
    $('imp_file').value = '';
    await Segarkan(); renderKomisi(); await loadMezbah(); await loadToday();
    if (ADMIN) await loadJemaat();
  } catch (er) { $('imp_out').textContent = er.message; }
};
// sesi admin tersimpan di localStorage oleh Supabase Auth; baca yang ada,
// jangan tanya password lagi. Dulu ini /api/me.
syncAdmin().catch(() => {});
// logout dari tab lain harus ikut mengubah tombol di tab ini juga.
// Tunda lewat setTimeout: memanggil supabase-client lain di dalam
// onAuthStateChange bisa masuk deadlock.
SB && SB.auth.onAuthStateChange(() => { setTimeout(() => syncAdmin().catch(() => {}), 0); });
// kartu beranda harus ikut hari berganti tanpa reload: saat tab diaktifkan lagi + tiap 5 menit (mis. tablet lobby)
async function refreshDaily() {
  await Promise.all([qKomisi().then(d => { ROWS = d; }), loadToday()]);
  renderNext();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDaily(); });
setInterval(refreshDaily, 300000);
// Statistik publik tidak butuh login, jadi dimuat sekali saat halaman dibuka.
loadStatJemaat();
route();
