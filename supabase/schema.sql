-- Supabase schema for Bloodborne Sudoku
-- Run in Supabase SQL editor.

-- Enable required extensions (usually enabled by default)
-- create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  created_at timestamptz not null default now(),
  finished_at timestamptz,

  puzzle_code text not null,
  difficulty text,
  mode text not null default 'solo',

  score integer not null default 0,
  errors integer not null default 0,
  time_sec integer not null default 0
);

alter table public.games enable row level security;

-- Users can only see their own games
create policy "games_select_own" on public.games
  for select
  using (auth.uid() = user_id);

-- Users can insert their own games
create policy "games_insert_own" on public.games
  for insert
  with check (auth.uid() = user_id);

-- Users can update their own games
create policy "games_update_own" on public.games
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional: allow delete own
create policy "games_delete_own" on public.games
  for delete
  using (auth.uid() = user_id);

create index if not exists games_user_created_idx on public.games(user_id, created_at desc);
create index if not exists games_user_finished_idx on public.games(user_id, finished_at desc);
