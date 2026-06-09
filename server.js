require('dotenv').config(); // baca file .env saat lokal (di platform deploy, env diisi otomatis)

const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// --- Konfigurasi (ramah deploy) ---
const PORT = process.env.PORT || 3000;                  // platform deploy mengisi PORT sendiri
const ADMIN_KEY = process.env.ADMIN_KEY || 'statistikanjing';  // WAJIB diganti via env saat online!

// --- Konfigurasi Supabase ---
// SUPABASE_URL              : URL project (Settings > API > Project URL)
// SUPABASE_SERVICE_ROLE_KEY : service_role key (Settings > API). RAHASIA — server only, bypass RLS.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = process.env.SUPABASE_TABLE || 'responses';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\n[FATAL] Kredensial Supabase belum terbaca.');
  console.error('  SUPABASE_URL              :', SUPABASE_URL ? 'OK' : 'KOSONG / tidak terbaca');
  console.error('  SUPABASE_SERVICE_ROLE_KEY :', SUPABASE_KEY ? 'OK' : 'KOSONG / tidak terbaca');
  console.error('\nCek: (1) file bernama persis ".env" ada di folder yang sama dengan server.js,');
  console.error('     (2) nama variabel ditulis persis, (3) jalankan ulang "npm start".');
  console.error('Lihat .env.example untuk format.\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Proteksi endpoint admin ---
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ success: false, message: 'Akses ditolak. Kunci admin salah.' });
  }
  next();
}

// --- Helper: bentuk baris DB -> bentuk yang dipakai frontend ---
// Frontend mengharapkan: { id, timestamp, responden:{nama,usia,jenisKelamin,pekerjaan}, answers }
function rowToEntry(row) {
  return {
    id: row.id,
    timestamp: row.created_at,
    responden: {
      nama: row.nama,
      usia: row.usia,
      jenisKelamin: row.jenis_kelamin,
      pekerjaan: row.pekerjaan
    },
    answers: row.answers || {}
  };
}

// --- Helper escape CSV (aman untuk koma, kutip, newline) ---
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const X_LABELS = Array.from({ length: 25 }, (_, i) => `X${i + 1}`);
const Y_LABELS = Array.from({ length: 25 }, (_, i) => `Y${i + 1}`);

function buildMatrix(entries) {
  // Mengembalikan { headers, rows } di mana rows = array of array (nilai mentah, belum di-escape)
  const headers = ['No', 'ID', 'Timestamp', 'Nama', 'Usia', 'Jenis Kelamin', 'Pekerjaan',
    ...X_LABELS, ...Y_LABELS, 'Total X', 'Total Y'];

  const rows = entries.map((r, idx) => {
    const xs = X_LABELS.map((l) => r.answers[l] ?? '');
    const ys = Y_LABELS.map((l) => r.answers[l] ?? '');
    const totalX = xs.reduce((a, b) => a + (parseInt(b) || 0), 0);
    const totalY = ys.reduce((a, b) => a + (parseInt(b) || 0), 0);
    return [
      idx + 1, r.id, r.timestamp,
      r.responden.nama, r.responden.usia, r.responden.jenisKelamin, r.responden.pekerjaan,
      ...xs, ...ys, totalX, totalY
    ];
  });

  return { headers, rows };
}

// ====================================================================
// POST - Simpan jawaban kuesioner (PUBLIK)
// ====================================================================
app.post('/api/submit', async (req, res) => {
  try {
    const { nama, usia, jenisKelamin, pekerjaan, answers } = req.body || {};

    if (!nama || !answers || typeof answers !== 'object') {
      return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
    }

    const payload = {
      nama: String(nama).slice(0, 100),
      usia: usia != null ? String(usia) : null,
      jenis_kelamin: jenisKelamin != null ? String(jenisKelamin) : null,
      pekerjaan: pekerjaan != null ? String(pekerjaan) : null,
      answers
    };

    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;

    res.json({ success: true, message: 'Jawaban berhasil disimpan!', id: data.id });
  } catch (err) {
    console.error('submit error:', err.message || err);
    res.status(500).json({ success: false, message: 'Gagal menyimpan data' });
  }
});

// ====================================================================
// GET - Ambil semua data (ADMIN)
// ====================================================================
app.get('/api/responses', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const entries = (data || []).map(rowToEntry);
    res.json({ success: true, total: entries.length, data: entries });
  } catch (err) {
    console.error('responses error:', err.message || err);
    res.status(500).json({ success: false, message: 'Gagal memuat data' });
  }
});

// ====================================================================
// GET - Export CSV (ADMIN)  -> untuk Google Sheets / spreadsheet apa pun
// ====================================================================
app.get('/api/export/csv', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;

    const entries = (data || []).map(rowToEntry);
    if (entries.length === 0) {
      return res.status(404).json({ success: false, message: 'Belum ada data' });
    }

    const { headers, rows } = buildMatrix(entries);
    // \uFEFF = BOM, supaya huruf Indonesia tidak rusak saat dibuka di Excel
    const csv = '\uFEFF' + [
      headers.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="data_kuesioner.csv"');
    res.send(csv);
  } catch (err) {
    console.error('export csv error:', err.message || err);
    res.status(500).json({ success: false, message: 'Gagal export CSV' });
  }
});

// ====================================================================
// GET - Export Excel .xlsx (ADMIN)  -> file Excel asli, berformat rapi
// ====================================================================
app.get('/api/export/excel', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;

    const entries = (data || []).map(rowToEntry);
    if (entries.length === 0) {
      return res.status(404).json({ success: false, message: 'Belum ada data' });
    }

    const { headers, rows } = buildMatrix(entries);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Kuesioner AI';
    wb.created = new Date();
    const ws = wb.addWorksheet('Data Kuesioner', {
      views: [{ state: 'frozen', xSplit: 7, ySplit: 1 }] // bekukan identitas + baris header
    });

    // Header
    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell, col) => {
      // Warna header: identitas (navy), X (ungu), Y (hijau), total (kuning)
      let fill = 'FF1B2A4A'; // navy default
      if (col >= 8 && col <= 32) fill = 'FF7C6FFF';        // X1..X25
      else if (col >= 33 && col <= 57) fill = 'FF2BB39B';  // Y1..Y25
      else if (col >= 58) fill = 'FFE0B400';               // Total X / Total Y
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thin();
    });
    headerRow.height = 22;

    // Data
    rows.forEach((r) => {
      const row = ws.addRow(r);
      row.eachCell((cell) => {
        cell.border = thin();
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      // Nama rata kiri biar enak dibaca
      row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
    });

    // Lebar kolom
    ws.getColumn(1).width = 5;   // No
    ws.getColumn(2).width = 14;  // ID
    ws.getColumn(3).width = 22;  // Timestamp
    ws.getColumn(4).width = 22;  // Nama
    ws.getColumn(5).width = 8;   // Usia
    ws.getColumn(6).width = 14;  // JK
    ws.getColumn(7).width = 16;  // Pekerjaan
    for (let c = 8; c <= 57; c++) ws.getColumn(c).width = 5; // X & Y
    ws.getColumn(58).width = 9;  // Total X
    ws.getColumn(59).width = 9;  // Total Y

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="data_kuesioner.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('export excel error:', err.message || err);
    res.status(500).json({ success: false, message: 'Gagal export Excel' });
  }
});

function thin() {
  const s = { style: 'thin', color: { argb: 'FFD9D9D9' } };
  return { top: s, left: s, bottom: s, right: s };
}

// ====================================================================
// DELETE - Hapus semua data (ADMIN)
// ====================================================================
app.delete('/api/responses', requireAdmin, async (req, res) => {
  try {
    // Hapus semua baris (kondisi selalu benar untuk id apa pun)
    const { error } = await supabase.from(TABLE).delete().not('id', 'is', null);
    if (error) throw error;
    res.json({ success: true, message: 'Data berhasil dihapus' });
  } catch (err) {
    console.error('delete error:', err.message || err);
    res.status(500).json({ success: false, message: 'Gagal menghapus data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
