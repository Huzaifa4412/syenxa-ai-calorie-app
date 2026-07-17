begin;

select plan(16);

select has_table('public', 'scan_usage', 'scan_usage exists');
select col_is_pk('public', 'scan_usage', 'id', 'scan_usage.id is the primary key');
select ok(
  not has_table_privilege('anon', 'public.scan_usage', 'select,insert,update,delete'),
  'anon has no direct scan_usage access'
);
select ok(
  not has_table_privilege('authenticated', 'public.scan_usage', 'select,insert,update,delete'),
  'authenticated has no direct scan_usage access'
);
select ok(
  not has_function_privilege('anon', 'public.get_scan_quota()', 'execute'),
  'anon cannot read quota through RPC'
);
select ok(
  not has_function_privilege('anon', 'public.consume_scan_quota(uuid)', 'execute'),
  'anon cannot consume quota through RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.get_scan_quota()', 'execute'),
  'authenticated can read quota through RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.consume_scan_quota(uuid)', 'execute'),
  'authenticated can consume quota through RPC'
);

insert into auth.users (id, aud, role, email)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'quota-one@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'quota-two@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  'select remaining from public.get_scan_quota()',
  array[3],
  'a new user starts with three scans'
);
select results_eq(
  $$select allowed from public.consume_scan_quota('20000000-0000-4000-8000-000000000001')$$,
  array[true],
  'first scan is accepted'
);
select results_eq(
  $$select allowed from public.consume_scan_quota('20000000-0000-4000-8000-000000000002')$$,
  array[true],
  'second scan is accepted'
);
select results_eq(
  $$select allowed from public.consume_scan_quota('20000000-0000-4000-8000-000000000003')$$,
  array[true],
  'third scan is accepted'
);
select results_eq(
  $$select allowed from public.consume_scan_quota('20000000-0000-4000-8000-000000000004')$$,
  array[false],
  'fourth active scan is rejected'
);
select results_eq(
  'select remaining from public.get_scan_quota()',
  array[0],
  'the first user has no scans remaining'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select results_eq(
  'select remaining from public.get_scan_quota()',
  array[3],
  'a separate user has an independent allowance'
);

reset role;
update public.scan_usage
set created_at = now() - interval '24 hours'
where user_id = '10000000-0000-4000-8000-000000000001'
  and request_id = '20000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select results_eq(
  'select remaining from public.get_scan_quota()',
  array[1],
  'one scan returns exactly when the oldest usage leaves the window'
);

select * from finish();
rollback;
