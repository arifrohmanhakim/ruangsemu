-- Ngumpul — Supabase Schema
-- Jalankan di Supabase SQL Editor

-- 1. Rooms table
create table if not exists rooms (
  id text primary key,                -- "RM-A7K2"
  name text default '',
  host_peer_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Room members (online presence with position)
create table if not exists room_members (
  id uuid default gen_random_uuid() primary key,
  room_id text not null references rooms(id) on delete cascade,
  peer_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  avatar_url text default '',
  x integer default 200,
  y integer default 400,
  current_area text default null,
  last_seen timestamptz default now(),
  created_at timestamptz default now(),
  unique(room_id, peer_id)
);

-- 3. Messages with area support (room-based chat)
create table if not exists room_messages (
  id uuid default gen_random_uuid() primary key,
  room_id text not null references rooms(id) on delete cascade,
  area_id text not null,               -- 'ruang_kerja' | 'pantry' | 'meeting'
  sender_peer_id text not null,
  sender_name text not null,
  content text not null,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_room_members_room on room_members(room_id);
create index if not exists idx_room_members_peer on room_members(peer_id);
create index if not exists idx_room_messages_area on room_messages(room_id, area_id, created_at);

-- Enable Row Level Security
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table room_messages enable row level security;

-- Policies: anyone can read, only authenticated can insert/update
create policy "Anyone can read rooms"
  on rooms for select using (true);

create policy "Authenticated users can create rooms"
  on rooms for insert with check (auth.role() = 'authenticated' or auth.role() = 'anon');

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

-- 4. Room area config (visibility + PIN per map room)
create table if not exists room_area_config (
  id bigint generated always as identity primary key,
  room_id text not null references rooms(id) on delete cascade,
  area_id text not null,               -- 'ruang_kerja' | 'pantry' | 'meeting'
  visibility text not null default 'public',
  pin text default null,
  updated_at timestamptz default now(),
  unique(room_id, area_id)
);

-- Index
create index if not exists idx_room_area_config_room on room_area_config(room_id);

alter table room_area_config enable row level security;

create policy "Anyone can read room_area_config"
  on room_area_config for select using (true);

-- Allow inserts/updates for any authenticated user (gate via app logic, not RLS)
create policy "Anyone can insert room_area_config"
  on room_area_config for insert with check (true);

create policy "Anyone can update room_area_config"
  on room_area_config for update using (true);

-- Realtime: enable for config changes
-- (bisa ditambah kalo nanti butuh realtime sync)

-- ════════════════════════════════════
-- 5. Custom room definitions (created by room owner)
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

-- ════════════════════════════════════
-- Migration: If table already exists, run ALTER instead:
-- ════════════════════════════════════
-- alter table room_members add column if not exists x integer default 200;
-- alter table room_members add column if not exists y integer default 400;
-- alter table room_members add column if not exists current_area text default null;
-- create policy if not exists "Anyone can delete members"
--   on room_members for delete using (true);
