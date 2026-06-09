// =====================================================================
//  Migrasi data lama (data/responses.json) -> Supabase
//  Pakai bila kamu sudah punya data dari versi file-based sebelumnya.
//
//  Cara pakai:
//    1. Pastikan SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY ter-set (file .env / env)
//    2. node scripts/import-json.js  [path/ke/responses.json]
//       (default: ./data/responses.json)
// =====================================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = process.env.SUPABASE_TABLE || 'responses';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set.');
  process.exit(1);
}

const file = process.argv[2] || path.join(__dirname, '..', 'data', 'responses.json');

(async () => {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Gagal membaca file:', file, '-', e.message);
    process.exit(1);
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    console.log('Tidak ada data untuk dimigrasi (file kosong).');
    return;
  }

  const rows = raw.map((r) => ({
    // biarkan id & created_at di-generate Supabase; pertahankan waktu asli bila ada
    created_at: r.timestamp || new Date().toISOString(),
    nama: r.responden?.nama ?? 'Tanpa Nama',
    usia: r.responden?.usia != null ? String(r.responden.usia) : null,
    jenis_kelamin: r.responden?.jenisKelamin ?? null,
    pekerjaan: r.responden?.pekerjaan ?? null,
    answers: r.answers || {}
  }));

  const { error } = await createClient(SUPABASE_URL, SUPABASE_KEY)
    .from(TABLE)
    .insert(rows);

  if (error) {
    console.error('Gagal insert:', error.message);
    process.exit(1);
  }
  console.log(`Berhasil migrasi ${rows.length} baris ke tabel "${TABLE}".`);
})();
