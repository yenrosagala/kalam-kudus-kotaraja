// =====================================================================
//  Konfigurasi Supabase untuk frontend.
//
//  ANON / PUBLISHABLE key aman di-commit DAN aman dipublikasikan di
//  halaman web - itu memang desain Supabase. Yang menjaga data adalah
//  RLS (Row Level Security) yang sudah dipasang di supabase-migration.sql.
//
//  JANGAN PERNAH menaruh SECRET KEY / SERVICE ROLE / PASSWORD POSTGRES
//  di file ini atau file lain yang masuk git atau dikirim ke browser.
//  Secret key (sb_secret_...) bypass RLS:ymbawa akses penuh ke database.
//
//  Cara isi - Supabase > Settings > API Keys:
//    1. Rotate password postgres (sudah pernah ke-paste di chat) - WAJIB
//    2. Copy "Project URL"
//    3. Copy yang berlabel "anon public" ATAU "publishable"
//       JANGAN copy yang berlabel "secret" / "service_role"
//    4. Tempel ke dua baris di bawah, ganti tanda <...>
// =====================================================================

window.SUPABASE_URL = 'https://vxuaupkqkgmddliqgqlx.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_ktWMcJ5YldRfVBUseBsejg_li7wlZ2w';

// Dua format kunci yang aman di browser, dua-duanya bawah kendali RLS:
//   - kunci anon lama   : JWT, awalan "eyJ..."
//   - publishable key baru: awalan "sb_publishable_..."
const KUNCI_BISA_DIPAKAI = /^(eyJ|sb_publishable_)/;

// Secret key (awalan "sb_secret_", atau JWT service_role) sengaja TIDAK
// diterima: key itu bypass RLS dan memberi akses penuh ke database.
// Kalau tidak, salah tempel di sini bisa diam-diam jadi lubang besar.
// Kalau sempat terlanjur terpakai, hapus di dashboard Supabase lalu
// buat ulang - mencabut aksesnya saja tidak cukup.
window.SUPABASE_READY =
  window.SUPABASE_URL.startsWith('https://') &&
  KUNCI_BISA_DIPAKAI.test(window.SUPABASE_ANON_KEY);