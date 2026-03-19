create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  username text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity integer not null default 7,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.messages enable row level security;

create policy "profiles are readable by signed in users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "rooms are readable by signed in users"
  on public.rooms for select
  to authenticated
  using (true);

create policy "messages are readable by signed in users"
  on public.messages for select
  to authenticated
  using (true);

create policy "users can insert own messages"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = user_id);

insert into public.rooms (name, capacity)
select 'General Room', 7
where not exists (select 1 from public.rooms);

alter publication supabase_realtime add table public.messages;
