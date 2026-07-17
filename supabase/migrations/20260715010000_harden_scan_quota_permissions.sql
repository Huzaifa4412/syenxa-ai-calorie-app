-- Follow-up hardening migration. Keep this separate because the original quota
-- migration may already have been applied to a remote project.

create index if not exists scan_usage_user_created_idx
  on public.scan_usage (user_id, created_at desc);

alter table public.scan_usage enable row level security;

revoke all on table public.scan_usage from public, anon, authenticated;

alter function public.get_scan_quota()
  stable
  security definer
  set search_path = '';

alter function public.consume_scan_quota(uuid)
  volatile
  security definer
  set search_path = '';

revoke all on function public.get_scan_quota() from public, anon, authenticated;
revoke all on function public.consume_scan_quota(uuid) from public, anon, authenticated;

grant execute on function public.get_scan_quota() to authenticated;
grant execute on function public.consume_scan_quota(uuid) to authenticated;
