# Kuesioner — Pengaruh Pemanfaatan AI terhadap Kemampuan Berpikir Kritis

Versi 2: penyimpanan data pakai **Supabase (Postgres)** dan ekspor data bisa **Excel (.xlsx)** atau **CSV/Spreadsheet**.

## 1. Siapkan Supabase
1. Buat project di [supabase.com](https://supabase.com).
2. Buka menu **SQL Editor**, tempel isi file `supabase_schema.sql`, lalu **Run** (membuat tabel `responses`).
3. Buka **Settings → API**, catat:
   - **Project URL** → untuk `SUPABASE_URL`
   - **service_role** key → untuk `SUPABASE_SERVICE_ROLE_KEY` (RAHASIA, dipakai server saja)

## 2. Jalankan di lokal
```bash
npm install
cp .env.example .env      # lalu isi nilainya (SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY)
npm start
```
File `.env` otomatis dibaca (lewat `dotenv`), jadi cukup `npm start`.

- Kuesioner (responden): http://localhost:3000
- Dashboard admin: http://localhost:3000/admin.html

## 3. Variabel environment
| Variabel | Fungsi | Wajib |
|----------|--------|-------|
| `SUPABASE_URL` | URL project Supabase | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (server only, bypass RLS) | ✅ |
| `SUPABASE_TABLE` | Nama tabel (default: `responses`) | – |
| `ADMIN_KEY` | Kunci buka dashboard & ekspor (default `admin123`, WAJIB diganti online) | – |
| `PORT` | Port server (diisi otomatis platform deploy) | – |

## 4. Deploy (Railway / Render / dll.)
1. Push project ke GitHub → buat project baru dari repo tersebut.
2. Tambahkan **Variables**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, dan `ADMIN_KEY`.
3. **Tidak perlu volume lagi** — data tersimpan di Supabase, aman saat redeploy.
4. Platform memberi URL publik → itu link kuesioner yang dibagikan.
5. Admin: buka `URL/admin.html`, masukkan `ADMIN_KEY`.

## 5. Migrasi data lama (opsional)
Kalau sebelumnya sudah punya `data/responses.json` berisi jawaban:
```bash
npm run migrate            # baca ./data/responses.json
# atau: node scripts/import-json.js path/ke/responses.json
```

## 6. API
| Method | Endpoint | Akses | Fungsi |
|--------|----------|-------|--------|
| POST | /api/submit | publik | Kirim jawaban |
| GET | /api/responses | admin | Ambil semua data |
| GET | /api/export/excel | admin | Ekspor Excel (.xlsx) |
| GET | /api/export/csv | admin | Ekspor CSV (buka di Google Sheets/Excel) |
| DELETE | /api/responses | admin | Hapus semua data |

## Catatan keamanan
- `service_role` key punya akses penuh ke database → **hanya** dipakai di server, jangan pernah ditaruh di kode frontend atau di-commit.
- RLS diaktifkan tanpa policy publik, jadi anon key tidak bisa menyentuh tabel. Server jadi satu-satunya pintu, dilindungi `ADMIN_KEY`.
