create table if not exists public.scan_usage (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists scan_usage_user_created_idx
  on public.scan_usage (user_id, created_at desc);

alter table public.scan_usage enable row level security;

revoke all on table public.scan_usage from anon, authenticated;

create or replace function public.get_scan_quota()
returns table (
  "limit" integer,
  used integer,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  usage_count integer;
  oldest_usage timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select count(*)::integer, min(created_at)
  into usage_count, oldest_usage
  from public.scan_usage
  where user_id = current_user_id
    and created_at > now() - interval '24 hours';

  return query select
    3,
    usage_count,
    greatest(3 - usage_count, 0),
    case when oldest_usage is null then null else oldest_usage + interval '24 hours' end;
end;
$$;

create or replace function public.consume_scan_quota(p_request_id uuid)
returns table (
  allowed boolean,
  "limit" integer,
  used integer,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  usage_count integer;
  oldest_usage timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select count(*)::integer, min(created_at)
  into usage_count, oldest_usage
  from public.scan_usage
  where user_id = current_user_id
    and created_at > now() - interval '24 hours';

  if usage_count >= 3 then
    return query select false, 3, usage_count, 0, oldest_usage + interval '24 hours';
    return;
  end if;

  insert into public.scan_usage (request_id, user_id)
  values (p_request_id, current_user_id);

  usage_count := usage_count + 1;

  if oldest_usage is null then
    oldest_usage := now();
  end if;

  return query select
    true,
    3,
    usage_count,
    greatest(3 - usage_count, 0),
    oldest_usage + interval '24 hours';
end;
$$;

revoke all on function public.get_scan_quota() from public, anon;
revoke all on function public.consume_scan_quota(uuid) from public, anon;
grant execute on function public.get_scan_quota() to authenticated;
grant execute on function public.consume_scan_quota(uuid) to authenticated;
