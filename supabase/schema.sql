-- RuangSemu — Supabase Schema v2 (fresh install)
-- Jalankan di Supabase SQL Editor
-- ⚠️ Jika sudah ada tabel dengan data, gunakan supabase/migration.sql

-- ════════════════════════════════════
-- 0. Users table (auth.users mirror)
-- ════════════════════════════════════
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  peer_id text not null unique,
  name text not null default '',
  avatar_url text default '',
  created_at timestamptz default now()
);

-- Auto-create user row on auth signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, peer_id, name, avatar_url)
  values (
    new.id,
    'p2p_' || encode(gen_random_bytes(12), 'hex'),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'User'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enable RLS
alter table users enable row level security;
create policy "Anyone can read users"
  on users for select using (true);
create policy "Users can insert own row"
  on users for insert with check (auth.uid() = id);
create policy "Users can update own row"
  on users for update using (auth.uid() = id);

-- ════════════════════════════════════
-- 1. Rooms table
-- ════════════════════════════════════
create table if not exists rooms (
  id text primary key,
  name text default '',
  host_user_id uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ════════════════════════════════════
-- 2. Room members
-- ════════════════════════════════════
create table if not exists room_members (
  id uuid default gen_random_uuid() primary key,
  room_id text not null references rooms(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  peer_id text not null,
  name text not null,
  x integer default 200,
  y integer default 400,
  current_area text default null,
  last_seen timestamptz default now(),
  created_at timestamptz default now(),
  unique(room_id, user_id)
);

create index if not exists idx_room_members_room on room_members(room_id);
create index if not exists idx_room_members_user on room_members(user_id);

-- ════════════════════════════════════
-- 3. Room messages
-- ════════════════════════════════════
create table if not exists room_messages (
  id uuid default gen_random_uuid() primary key,
  room_id text not null references rooms(id) on delete cascade,
  area_id text not null,
  sender_user_id uuid not null,
  sender_name text not null,
  content text not null,
  created_at timestamptz default now()
);

create index if not exists idx_room_messages_area on room_messages(room_id, area_id, created_at);

-- ════════════════════════════════════
-- RLS
-- ════════════════════════════════════
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table room_messages enable row level security;

create policy "Anyone can read rooms"
  on rooms for select using (true);

create policy "Authenticated users can create rooms"
  on rooms for insert with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "Anyone can update rooms"
  on rooms for update using (true);

create policy "Anyone can delete rooms"
  on rooms for delete using (true);

create policy "Anyone can read members"
  on room_members for select using (true);

create policy "Anyone can insert members"
  on room_members for insert with check (true);

create policy "Anyone can delete members"
  on room_members for delete using (true);

create policy "Anyone can update members"
  on room_members for update using (true);

create policy "Anyone can read messages"
  on room_messages for select using (true);

create policy "Anyone can insert messages"
  on room_messages for insert with check (true);

-- Realtime: enable for presence
alter publication supabase_realtime add table room_members;

-- ════════════════════════════════════
-- 4. Room area config
-- ════════════════════════════════════
create table if not exists room_area_config (
  id bigint generated always as identity primary key,
  room_id text not null references rooms(id) on delete cascade,
  area_id text not null,
  visibility text not null default 'public',
  pin text default null,
  updated_at timestamptz default now(),
  unique(room_id, area_id)
);

create index if not exists idx_room_area_config_room on room_area_config(room_id);

alter table room_area_config enable row level security;

create policy "Anyone can read room_area_config"
  on room_area_config for select using (true);

create policy "Anyone can insert room_area_config"
  on room_area_config for insert with check (true);

create policy "Anyone can update room_area_config"
  on room_area_config for update using (true);

-- ════════════════════════════════════
-- 5. Custom room definitions
-- ════════════════════════════════════
create table if not exists room_defs (
  id bigint generated always as identity primary key,
  room_id text not null references rooms(id) on delete cascade,
  name text not null,
  x integer not null,
  y integer not null,
  w integer not null default 360,
  h integer not null default 280,
  color text not null default 'rgba(100, 200, 150, 0.07)',
  door_side text not null default 'bottom',
  door_w integer not null default 70,
  created_at timestamptz default now()
);

alter table room_defs enable row level security;

create policy "Anyone can read room_defs"
  on room_defs for select using (true);

create policy "Anyone can insert room_defs"
  on room_defs for insert with check (true);

create policy "Anyone can update room_defs"
  on room_defs for update using (true);

create policy "Anyone can delete room_defs"
  on room_defs for delete using (true);
