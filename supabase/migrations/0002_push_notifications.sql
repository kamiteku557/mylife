-- Background push notification support for pomodoro sessions.

alter table public.pomodoro_sessions
  add column if not exists planned_end_at timestamptz;

alter table public.pomodoro_sessions
  add column if not exists last_notified_step int not null default -1;

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_web_push_subscriptions_user_active
  on public.web_push_subscriptions (user_id, is_active);

create index if not exists idx_pomodoro_sessions_user_status_planned_end
  on public.pomodoro_sessions (user_id, status, planned_end_at);
