-- ============================================================
-- Gesture DJ — Supabase Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Profiles table (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  display_name text,
  role text check (role in ('dj', 'audience')) default 'audience',
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Profiles policies
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 2. Sessions table
create table if not exists public.sessions (
  id uuid default gen_random_uuid() primary key,
  code text not null,
  dj_id uuid references public.profiles(id) on delete cascade not null,
  status text check (status in ('active', 'ended')) default 'active',
  created_at timestamptz default now()
);

-- Index for fast session code lookups
create index if not exists idx_sessions_code_status on public.sessions(code, status);
create index if not exists idx_sessions_dj_id on public.sessions(dj_id);

-- Enable RLS
alter table public.sessions enable row level security;

-- Sessions policies
create policy "Anyone authenticated can view active sessions"
  on public.sessions for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can create sessions"
  on public.sessions for insert
  with check (auth.uid() = dj_id);

create policy "DJs can update their own sessions"
  on public.sessions for update
  using (auth.uid() = dj_id);

-- 3. Session members table
create table if not exists public.session_members (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.sessions(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  joined_at timestamptz default now(),
  unique(session_id, user_id)
);

-- Index for fast lookups
create index if not exists idx_session_members_session on public.session_members(session_id);
create index if not exists idx_session_members_user on public.session_members(user_id);

-- Enable RLS
alter table public.session_members enable row level security;

-- Session members policies
create policy "Anyone authenticated can view session members"
  on public.session_members for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can join sessions"
  on public.session_members for insert
  with check (auth.uid() = user_id);

-- Allow upsert (for the onConflict in the API)
create policy "Users can update their own membership"
  on public.session_members for update
  using (auth.uid() = user_id);

-- ============================================================
-- Optional: Auto-create profile on signup via trigger
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if it exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
