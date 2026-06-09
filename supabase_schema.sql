-- =====================================================================
--  Skema tabel untuk Kuesioner AI
--  Jalankan di Supabase: menu "SQL Editor" -> tempel -> Run
-- =====================================================================

create table if not exists public.responses (
  id            uuid         primary key default gen_random_uuid(),
  created_at    timestamptz  not null    default now(),
  nama          text         not null,
  usia          text,
  jenis_kelamin text,
  pekerjaan     text,
  answers       jsonb        not null
);

-- Indeks untuk pengurutan berdasarkan waktu
create index if not exists responses_created_at_idx
  on public.responses (created_at);

-- Aktifkan Row Level Security.
-- Kita TIDAK membuat policy publik apa pun, sehingga anon/public key
-- tidak bisa mengakses tabel ini. Hanya server (memakai SERVICE ROLE key,
-- yang otomatis bypass RLS) yang boleh baca/tulis. Ini lapisan aman.
alter table public.responses enable row level security;
