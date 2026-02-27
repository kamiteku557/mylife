-- mylife initial schema
-- Apply this in Supabase SQL Editor or via Supabase CLI.

create extension if not exists "pgcrypto";

do $$
begin
  if to_regtype('public.pomodoro_session_type') is null then
    create type public.pomodoro_session_type as enum ('focus', 'short_break', 'long_break');
  end if;
end
$$;

do $$
begin
  if to_regtype('public.pomodoro_session_status') is null then
    create type public.pomodoro_session_status as enum ('running', 'paused', 'completed', 'cancelled');
  end if;
end
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.pomodoro_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  focus_minutes int not null default 25,
  short_break_minutes int not null default 5,
  long_break_minutes int not null default 20,
  long_break_every int not null default 4,
  updated_at timestamptz not null default now()
);

create table if not exists public.pomodoro_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null default '',
  session_type public.pomodoro_session_type not null,
  planned_seconds int not null,
  actual_seconds int not null default 0,
  started_at timestamptz not null,
  ended_at timestamptz,
  status public.pomodoro_session_status not null,
  cycle_index int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.pomodoro_session_tags (
  session_id uuid not null references public.pomodoro_sessions(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (session_id, tag_id)
);

create table if not exists public.memo_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null default '',
  body_md text not null,
  log_date date not null,
  related_session_id uuid references public.pomodoro_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memo_log_tags (
  memo_log_id uuid not null references public.memo_logs(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (memo_log_id, tag_id)
);

create table if not exists public.diaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  diary_date date not null,
  title text,
  body_md text not null,
  mood smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, diary_date)
);

create index if not exists idx_pomodoro_sessions_user_started_at
  on public.pomodoro_sessions (user_id, started_at desc);

create index if not exists idx_memo_logs_user_log_date
  on public.memo_logs (user_id, log_date desc);

create index if not exists idx_diaries_user_diary_date
  on public.diaries (user_id, diary_date desc);
