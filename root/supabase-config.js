// =====================================================================
//  Konfigurasi Supabase untuk frontend.
//
//  ANON KEY aman di-commit DAN aman dipublikasikan di halaman web -
//  itu memang desain Supabase. Yang menjaga data adalah RLS (Row Level
//  Security) yang sudah dipasang di supabase-migration.sql.
//
//  JANGAN PERNAH menaruh PASSWORD POSTGRES di file ini atau file lain
//  yang masuk git / dikirim ke browser. Password postgres hanya dipakai
//  di SQL Editor Supabase.
//
//  Cara isi:
//    1. Rotate password postgres di dashboard (sudah pernah ke-paste di chat)
//    2. Supabase > Settings > API > salin "Project URL" dan "anon public key"
//    3. Tempel di bawah, ganti tanda <...>
// =====================================================================

window.SUPABASE_URL = '<PROJECT_URL—contoh: https://abcdefgh.supabase.co>';
window.SUPABASE_ANON_KEY = '<ANON_PUBLIC_KEY—dimulai "eyJ...">';

// Dipakai app.js untuk memberi tahu kalau belum diisi, bukan diam-diam error.
window.SUPABASE_READY =
  window.SUPABASE_URL.startsWith('http') &&
  window.SUPABASE_ANON_KEY.startsWith('eyJ');