-- ガチャマシーン用テーブル。Supabase の SQL Editor に貼り付けて 1 回だけ実行してください。
create table if not exists public.gacha_rooms (
  id         text primary key check (char_length(id) between 1 and 64),
  data       jsonb not null check (pg_column_size(data) < 500000),
  rev        bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.gacha_rooms enable row level security;

-- URL を知っている人は誰でも読み書きできる（削除は不可）
drop policy if exists "gacha read"   on public.gacha_rooms;
drop policy if exists "gacha insert" on public.gacha_rooms;
drop policy if exists "gacha update" on public.gacha_rooms;
create policy "gacha read"   on public.gacha_rooms for select to anon, authenticated using (true);
create policy "gacha insert" on public.gacha_rooms for insert to anon, authenticated with check (true);
create policy "gacha update" on public.gacha_rooms for update to anon, authenticated using (true) with check (true);

grant select, insert, update on public.gacha_rooms to anon, authenticated;
