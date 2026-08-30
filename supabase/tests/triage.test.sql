begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '13000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'triage-patient-one@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '13000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'triage-patient-two@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '13000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'triage-doctor@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

delete from public.profiles
where auth_user_id in (
  '13000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000002',
  '13000000-0000-0000-0000-000000000003'
);

insert into public.profiles (id, auth_user_id, role)
values
  ('23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'patient'),
  ('23000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000002', 'patient'),
  ('23000000-0000-0000-0000-000000000003', '13000000-0000-0000-0000-000000000003', 'doctor');

insert into public.patients (
  id,
  profile_id,
  preferred_language,
  date_of_birth,
  city,
  onboarding_completed_at
)
values
  (
    '33000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'en',
    '1990-01-01',
    'Synthetic City',
    now()
  ),
  (
    '33000000-0000-0000-0000-000000000002',
    '23000000-0000-0000-0000-000000000002',
    'hi',
    '1991-01-01',
    'Synthetic City',
    now()
  );

insert into public.doctors (id, profile_id)
values ('53000000-0000-0000-0000-000000000003', '23000000-0000-0000-0000-000000000003');

insert into public.intake_sessions (id, patient_id)
values
  ('73000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001'),
  ('73000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000002');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.triage_results'::regclass),
  'triage results has RLS enabled'
);
select has_column('public', 'triage_results', 'rule_set_version', 'rule-set version is persisted');
select has_column('public', 'triage_results', 'matched_rule_codes', 'matched rule codes are persisted');
select has_column('public', 'triage_results', 'created_at', 'created timestamp is present');
select has_column('public', 'triage_results', 'updated_at', 'updated timestamp is present');

set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    insert into public.triage_results (
      intake_session_id,
      rule_set_version,
      outcome,
      matched_rule_codes
    ) values (
      '73000000-0000-0000-0000-000000000001',
      'forged-v1',
      'RED_FLAG',
      array['FORGED']
    )
  $$,
  '42501',
  'permission denied for table triage_results',
  'patient cannot forge a triage result'
);
select throws_ok(
  $$
    select public.record_triage_result(
      '13000000-0000-0000-0000-000000000001',
      '73000000-0000-0000-0000-000000000001',
      'red-flags-v1.0.0',
      'RED_FLAG',
      array['SEVERE_TRAUMA']
    )
  $$,
  '42501',
  'permission denied for function record_triage_result',
  'patient cannot invoke privileged triage persistence'
);

reset role;
set local role service_role;

select throws_ok(
  $$
    insert into public.triage_results (
      intake_session_id,
      rule_set_version,
      outcome,
      matched_rule_codes
    ) values (
      '73000000-0000-0000-0000-000000000001',
      'bypass-v1',
      'RED_FLAG',
      array['FORGED']
    )
  $$,
  '42501',
  'permission denied for table triage_results',
  'service role must use the validated triage persistence function'
);
select lives_ok(
  $$
    select public.record_triage_result(
      '13000000-0000-0000-0000-000000000001',
      '73000000-0000-0000-0000-000000000001',
      'red-flags-v1.0.0',
      'RED_FLAG',
      array['SEVERE_TRAUMA']
    )
  $$,
  'service role can record a validated red flag for the actor patient'
);
select throws_ok(
  $$
    select public.record_triage_result(
      '13000000-0000-0000-0000-000000000001',
      '73000000-0000-0000-0000-000000000002',
      'red-flags-v1.0.0',
      'RED_FLAG',
      array['SEVERE_TRAUMA']
    )
  $$,
  '42501',
  'Triage is unavailable',
  'service persistence rejects a mismatched patient session'
);
select throws_ok(
  $$
    select public.record_triage_result(
      '13000000-0000-0000-0000-000000000001',
      '73000000-0000-0000-0000-000000000001',
      'red-flags-v1.0.0',
      'NO_RED_FLAG',
      array[]::text[]
    )
  $$,
  '23514',
  'Red-flag escalation must remain active',
  'a later result cannot clear a prior red flag'
);
select throws_ok(
  $$
    select public.record_triage_result(
      '13000000-0000-0000-0000-000000000002',
      '73000000-0000-0000-0000-000000000002',
      'red-flags-v1.0.0',
      'RED_FLAG',
      array[]::text[]
    )
  $$,
  '23514',
  'Triage result is invalid',
  'red-flag outcome requires at least one matched rule code'
);
select throws_ok(
  $$
    select public.record_triage_result(
      '13000000-0000-0000-0000-000000000002',
      '73000000-0000-0000-0000-000000000002',
      'red-flags-v1.0.0',
      'NO_RED_FLAG',
      array['SEVERE_TRAUMA']
    )
  $$,
  '23514',
  'Triage result is invalid',
  'no-red-flag outcome cannot contain matched rule codes'
);

reset role;
select set_config(
  'test.triage_result_id',
  (select id::text from public.triage_results limit 1),
  true
);
set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-0000-0000-000000000001';

select is((select count(*) from public.triage_results), 1::bigint, 'patient sees own triage result');
select results_eq(
  $$ select outcome::text, rule_set_version from public.triage_results $$,
  $$ values ('RED_FLAG', 'red-flags-v1.0.0') $$,
  'patient sees the versioned escalation outcome'
);
select lives_ok(
  $$
    select public.enter_triage_emergency_pathway(
      current_setting('test.triage_result_id')::uuid
    )
  $$,
  'patient can enter the emergency pathway for their own red flag'
);
select lives_ok(
  $$
    select public.enter_triage_emergency_pathway(
      current_setting('test.triage_result_id')::uuid
    )
  $$,
  'emergency pathway entry is idempotent'
);
select throws_ok(
  $$
    select public.add_intake_patient_message(
      '73000000-0000-0000-0000-000000000001',
      'Synthetic response that must be blocked.'
    )
  $$,
  '42501',
  'Emergency pathway required',
  'normal intake messages stop after a red flag'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-0000-0000-000000000002';

select is((select count(*) from public.triage_results), 0::bigint, 'another patient cannot see the result');
select throws_ok(
  $$
    select public.enter_triage_emergency_pathway(
      current_setting('test.triage_result_id')::uuid
    )
  $$,
  '42501',
  'Emergency pathway is unavailable',
  'another patient cannot enter the red-flag pathway'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-0000-0000-000000000003';

select is((select count(*) from public.triage_results), 0::bigint, 'doctor cannot browse triage results globally');

reset role;

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'triage_red_flag_detected'
      and target_type = 'triage_result'
  ),
  1::bigint,
  'red-flag persistence creates one content-free audit event'
);
select is(
  (
    select count(*)
    from public.audit_events
    where action = 'triage_emergency_pathway_entered'
      and target_type = 'triage_result'
  ),
  1::bigint,
  'emergency pathway entry creates one idempotent content-free audit event'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'triage_results'
      and column_name in ('patient_text', 'message_body', 'symptoms', 'diagnosis', 'prescription')
  ),
  0::bigint,
  'triage results do not duplicate raw clinical content'
);

select * from finish();
rollback;
