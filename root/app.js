const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const PAGES = { beranda: '', tentang: 'Tentang', jadwal: 'Jadwal Ibadah', mezbah: 'Mezbah Keluarga', berita: 'Berita', beritaIsi: 'Berita', kontak: 'Kontak' };

let ROWS = [], FK = '', FB = '', MZL = [];
let EDIT = { id: null, tgl: null };
const KNAMA = { KU: 'Kebaktian Umum', PW: 'Persekutuan Wanita', PKP: 'Persekutuan Kaum Pria' };
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tgl = (t) => { const [y, m, d] = t.split('-'); return { y: +y, m: +m - 1, d: +d, wd: new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'UTC' }).format(new Date(t + 'T00:00:00Z')) }; };
// 'YYYYMMDDhhmm' in church time (Asia/Jayapura) - date-only compare misses same-day services already past
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
      <h3>${esc(r.judul)}</h3>${r.teks ? `<div>Teks: <b>${esc(r.teks)}</b></div>` : ''}${r.nats_pembimbing ? `<div>Nats Pembimbing: ${esc(r.nats_pembimbing)}</div>` : ''}
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
}


// ---- Mezbah Keluarga (dari database) ----
const fmtTgl = (t) => new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(t + 'T00:00:00Z'));
const block = (label, v) => v ? `<h3 class="lbl">${label}</h3><p class="pre">${esc(v)}</p>` : '';

function bukaBaca(src) {
  const got = typeof src === 'string'
    ? fetch('/api/mezbah/' + encodeURIComponent(src)).then(r => r.json())
    : Promise.resolve(src);
  got.then(m => {
    if (!m || m.error) return;
    $('bTgl').textContent = fmtTgl(m.tanggal);
    $('bJudul').textContent = m.judul || '-';
    $('bTema').textContent = m.tema ? 'Tema Mingguan: ' + m.tema : '';
    $('bIsi').innerHTML =
      (m.bacaan || m.ayat ? `<div class="two">${m.bacaan ? `<div class="card"><h3>Bacaan Alkitab</h3><p>${esc(m.bacaan)}</p></div>` : ''}${m.ayat ? `<div class="card"><h3>Ayat Kunci</h3><p>${esc(m.ayat)}</p></div>` : ''}</div>` : '') +
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
$('klist').addEventListener('click', e => { const id = e.target.dataset.ubah; if (id) editK(id); });

let MZTODAY = null;
async function loadToday() {
  const c = $('mzToday');
  try {
    const m = await fetch('/api/mezbah/hari-ini').then(r => r.json());
    if (!m || m.error) throw 0;
    MZTODAY = m;
    c.innerHTML = `<p class="rdate">${fmtTgl(m.tanggal)}</p><p class="tjudul">${esc(m.judul || 'Renungan')}</p>` +
      (m.tema ? `<p class="theme">Tema Mingguan: ${esc(m.tema)}</p>` : '') +
      (m.bacaan ? `<p class="note">Bacaan: ${esc(m.bacaan)}</p>` : '') +
      `<p style="margin:10px 0 0"><button class="sm" type="button" id="btnToday">Lihat renungan</button></p>`;
  } catch { c.innerHTML = '<p class="note">Belum ada renungan. <a href="#/mezbah"><b>Mulai di sini</b></a></p>'; }
}
$('mzToday').addEventListener('click', e => { if (e.target.id === 'btnToday' && MZTODAY) bukaBaca(MZTODAY); });

async function loadMezbah(buka) {
  try {
    const list = await fetch('/api/mezbah/daftar').then(r => r.json());
    MZL = list;
    $('mz').innerHTML = list.length
      ? list.map(x => `<article class="mzi"><div class="mzb">
<p class="rdate">${fmtTgl(x.tanggal)}</p>
<h3>${esc(x.judul || 'Renungan')}</h3>
${x.tema ? `<p class="theme">Tema Mingguan: ${esc(x.tema)}</p>` : ''}
${(x.bacaan || x.ayat) ? `<div class="mmeta">${x.bacaan ? `<p><b>Bacaan Alkitab</b>${esc(x.bacaan)}</p>` : ''}${x.ayat ? `<p><b>Ayat Kunci</b>${esc(x.ayat)}</p>` : ''}</div>` : ''}
</div><div class="dact">${ADMIN ? `<button class="sm" type="button" data-ubah="${esc(x.tanggal)}">Ubah renungan</button>` : ''}<button class="sm" type="button" data-mz="${esc(x.tanggal)}">Lihat Renungan</button></div></article>`).join('')
      : '<p class="note">Belum ada renungan.</p>';
    if (buka) bukaBaca(buka);
  } catch { $('mz').innerHTML = '<p class="note">Renungan belum dapat dimuat.</p>'; }
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
    try { BRS = await fetch('/api/berita').then(r => r.json()); }
    catch { $('blist').innerHTML = '<p class="note">Berita belum dapat dimuat. Muat ulang halaman.</p>'; return; }
  }
  renderBerita();
}

const loadBeritaMini = async () => {
  const el = $('bMini');
  if (!el) return;
  try {
    const d = await fetch('/api/berita').then(r => r.json());
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
  const b = await fetch('/api/berita/' + id).then(r => r.json()).catch(() => null);
  if (!b || b.error) { host.innerHTML = '<p class="note">Berita tidak ditemukan.</p>'; return; }
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
  const b = await fetch('/api/berita/' + id).then(r => r.json()).catch(() => null);
  if (!b || b.error) return;
  BFIELDS.forEach(k => { $('b_' + k).value = b[k] ?? ''; });
  EDIT.id = b.id;
  $('bTitle2').textContent = 'Ubah berita';
  $('b_del').hidden = false;
  bukaDlg('fBerita', 'Berita');
}

$('kchips').addEventListener('click', e => { const k = e.target.dataset.k; if (k !== undefined) { FK = k; history.replaceState(null, '', '#/jadwal' + (k ? '/' + encodeURIComponent(k) : '')); renderKomisi(); } });
$('kBulan').addEventListener('change', e => { FB = e.target.value; renderKomisi(); });
$('kCari').addEventListener('input', renderKomisi);
window.addEventListener('hashchange', route);
fetch('/api/komisi').then(r => r.json()).then(d => { ROWS = d; renderKomisi(); })
  .catch(() => { $('klist').innerHTML = '<p class="note">Jadwal belum dapat dimuat. Muat ulang halaman.</p>'; });

/* ---- Tambah jadwal: dialog di tab Jadwal Ibadah (server tetap mewajibkan admin) ---- */
const NFIELDS = ['tipe', 'tanggal', 'komisi', 'judul', 'teks', 'nats_pembimbing', 'pelayan_firman', 'liturgis', 'tuan_rumah', 'tempat', 'waktu', 'status', 'tujuan'];
const NDEF = { tipe: 'KU', status: 'TERJADWAL', tempat: 'GKKK Kotaraja', waktu: '09.30 WIT' };
let ADMIN = false;
const panel = (id) => {
  ['fLogin', 'dNew', 'dMz', 'fImp', 'fBerita', 'dBaca'].forEach(p => { $(p).hidden = p !== id; });
  $('dlg').className = { fLogin: 'login', dNew: 'form', dMz: 'form', fImp: 'form', fBerita: 'form', dBaca: 'wide' }[id];
};
const Segarkan = async () => {
  ROWS = await fetch('/api/komisi').then(x => x.json());
  MZL = await fetch('/api/mezbah/daftar').then(x => x.json());
};
// sesi admin menentukan apa yang terlihat: tombol tambah, dan tombol ubah di tiap entri
const syncAdmin = async () => {
  $('btnLogin').textContent = ADMIN ? 'Keluar' : 'Login';
  $('btnLogin').title = ADMIN ? 'Keluar dari sesi admin' : 'Masuk sebagai admin';
  $('btnTambah').hidden = !ADMIN;
  $('btnMz').hidden = !ADMIN;
  $('btnBerita').hidden = !ADMIN;
  if (ADMIN) await Segarkan();
  renderKomisi();
  await loadMezbah();
  if (BRS.length) renderBerita();
};
let IMP_HOST = 'dNew', IMP_LABEL = 'Tambah jadwal';
const mode = (host, jenis, label) => {
  IMP_HOST = host; IMP_LABEL = label;
  $('imp_jenis').value = jenis;
  $('imp_tpl').href = '/api/template/' + jenis;
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
    await post('/api/komisi/' + EDIT.id, null, 'DELETE');
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
    await post('/api/mezbah/' + encodeURIComponent(t), null, 'DELETE');
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

const post = async (url, body, method = 'POST') => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Gagal.');
  return j;
};
$('fLogin').onsubmit = async e => {
  e.preventDefault();
  $('nmsg').textContent = 'Memeriksa password...';
  try {
    await post('/api/login', { password: $('npw').value });
    ADMIN = true; $('npw').value = ''; $('dlg').close();
    await syncAdmin();
  } catch (er) { $('nmsg').textContent = er.message; $('npw').select(); }
};
$('fNew').onsubmit = async e => {
  e.preventDefault();
  const body = {}; NFIELDS.forEach(k => { body[k] = $('n_' + k).value; });
  $('nmsg2').textContent = 'Menyimpan...';
  try {
    const r = EDIT.id ? await post('/api/komisi/' + EDIT.id, body, 'PUT') : await post('/api/komisi', body);
    $('dlg').close(); EDIT.id = null;
    ROWS = await fetch('/api/komisi').then(x => x.json());
    renderKomisi();
    $('kInfo').textContent = 'Jadwal baru tersimpan: ' + r.tanggal + ' - ' + r.judul;
  } catch (er) { $('nmsg2').textContent = er.message; }
};
$('fMz').onsubmit = async e => {
  e.preventDefault();
  const body = {}; MFIELDS.forEach(k => { body[k] = $('mz_' + k).value; });
  $('mzm').textContent = 'Menyimpan...';
  try {
    const r = await post('/api/mezbah/' + encodeURIComponent(body.tanggal), body, 'PUT');
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
    await post('/api/logout', {}).catch(() => {});
    ADMIN = false; await syncAdmin();
    return;
  }
  $('nmsg').textContent = '';
  bukaDlg('fLogin', 'Masuk sebagai admin');
  $('npw').focus();
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
  const r = await fetch('/api/mezbah/' + encodeURIComponent(t)).then(x => x.json()).catch(() => null);
  if (!r || r.error) return alert('Entri itu tidak bisa dimuat.');
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
$('imp_jenis').onchange = () => { $('imp_tpl').href = '/api/template/' + $('imp_jenis').value; };

$('btnBerita').onclick = () => { bReset(); bukaDlg('fBerita', 'Berita'); };
$('b_del').onclick = async () => {
  if (!EDIT.id) return;
  if (!confirm('Hapus berita ini? Tindakan ini tidak bisa dibatalkan.')) return;
  await post('/api/berita/' + EDIT.id, {}, 'DELETE');
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
    await post(EDIT.id ? '/api/berita/' + EDIT.id : '/api/berita', body, EDIT.id ? 'PUT' : 'POST');
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
  if (!confirm(`Impor ${f.name}?\n\nTanggal yang sudah ada akan diperbarui, bukan digandakan.`)) return;
  $('imp_out').textContent = 'Mengimpor...';
  try {
    const r = await post('/api/import/' + $('imp_jenis').value, { csv: await f.text() });
    const err = r.errors.map(x => `baris ${x.baris}: ${x.pesan}`).join('; ');
    $('imp_out').textContent = `Selesai. ${r.added} baru, ${r.updated} diperbarui, ${r.errorCount} gagal (dari ${r.total} baris).` + (err ? ' Gagal -> ' + err : '');
    $('imp_file').value = '';
    await Segarkan(); renderKomisi(); await loadMezbah(); await loadToday();
  } catch (er) { $('imp_out').textContent = er.message; }
};
// sudah punya sesi admin? jangan minta password lagi (fetch tidak reject pada 401)
fetch('/api/me').then(r => { ADMIN = r.ok; return syncAdmin(); }).catch(() => syncAdmin());
// kartu beranda harus ikut hari berganti tanpa reload: saat tab diaktifkan lagi + tiap 5 menit (mis. tablet lobby)
async function refreshDaily() {
  await Promise.all([fetch('/api/komisi').then(x => x.json()).then(d => { ROWS = d; }), loadToday()]);
  renderNext();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDaily(); });
setInterval(refreshDaily, 300000);
route();
