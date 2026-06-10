-- Reference copy of the schema live on the skipperkit Supabase project
-- (jaxzkldvifgmqnoahvom). Applied originally via MCP apply_migration; kept
-- here so the schema isn't recorded only inside the database itself.

create table public.submissions (
  id bigint generated always as identity primary key,
  package text not null,
  target text not null check (target in ('SKIP_INTRO','SKIP_RECAP')),
  view_id text,
  label text,
  report_count int not null default 1,
  app_versions text[] not null default '{}',
  locales text[] not null default '{}',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','pr_open','merged','rejected')),
  unique nulls not distinct (package, target, view_id, label)
);

create table public.rate_limits (
  ip text primary key,
  day date not null default current_date,
  count int not null default 1
);

-- Only the edge function (service role) touches these tables.
alter table public.submissions enable row level security;
alter table public.rate_limits enable row level security;

-- Atomic increment-and-check used by the edge function.
create or replace function public.bump_rate_limit(p_ip text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare new_count int;
begin
  -- Opportunistic purge keeps the table from growing unboundedly.
  delete from rate_limits where day < current_date;
  insert into rate_limits(ip, day, count) values (p_ip, current_date, 1)
  on conflict (ip) do update
    set count = case when rate_limits.day = current_date then rate_limits.count + 1 else 1 end,
        day = current_date
  returning count into new_count;
  return new_count;
end;
$function$;
