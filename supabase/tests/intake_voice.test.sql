begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '13000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'voice-patient-one@example.invalid', '', now(),
    '{}', '{}', now(), now()
  ),
  (
    '13000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'voice-patient-two@example.invalid', '', now(),
    '{}', '{}', now(), now()
  ),
  (
    '13000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'voice-doctor@example.invalid', '', now(),
    '{}', '{}', now(), now()
  );

delete from public.profiles
where auth_user_id in (
  '13000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000002',
  '13000000-0000-4000-8000-000000000003'
);

insert into public.profiles (id, auth_user_id, role)
values
  (
    '23000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    'patient'
  ),
  (
    '23000000-0000-4000-8000-000000000002',
    '13000000-0000-4000-8000-000000000002',
    'patient'
  ),
  (
    '23000000-0000-4000-8000-000000000003',
    '13000000-0000-4000-8000-000000000003',
    'doctor'
  );

insert into public.patients (
  id, profile_id, preferred_language, date_of_birth, city, onboarding_completed_at
)
values
  (
    '33000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000001',
    'en', '1990-01-01', 'Synthetic Voice City', now()
  ),
  (
    '33000000-0000-4000-8000-000000000002',
    '23000000-0000-4000-8000-000000000002',
    'hi', '1991-01-01', 'Synthetic Voice City', now()
  );

insert into public.doctors (id, profile_id)
values (
  '53000000-0000-4000-8000-000000000003',
  '23000000-0000-4000-8000-000000000003'
);

insert into public.intake_sessions (id, patient_id)
values
  (
    '73000000-0000-4000-8000-000000000001',
    '33000000-0000-4000-8000-000000000001'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '33000000-0000-4000-8000-000000000002'
  );

select has_function(
  'public',
  'record_intake_voice_session_issued',
  array['uuid'],
  'voice session audit function exists'
);

set local role anon;
select throws_ok(
  $$ select public.record_intake_voice_session_issued('73000000-0000-4000-8000-000000000001') $$,
  '42501',
  'permission denied for function record_intake_voice_session_issued',
  'anonymous caller cannot record a voice session'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-4000-8000-000000000001';
select lives_ok(
  $$ select public.record_intake_voice_session_issued('73000000-0000-4000-8000-000000000001') $$,
  'patient can record issuance for their own active intake'
);
select throws_ok(
  $$ select public.record_intake_voice_session_issued('73000000-0000-4000-8000-000000000002') $$,
  '42501',
  'Voice input is unavailable',
  'patient cannot record issuance for another patient intake'
);
select throws_ok(
  $$
    insert into public.audit_events (actor_user_id, action, target_type, target_id, outcome)
    values (
      '13000000-0000-4000-8000-000000000001',
      'intake_voice_session_issued',
      'intake_session',
      '73000000-0000-4000-8000-000000000001',
      'success'
    )
  $$,
  '42501',
  'permission denied for table audit_events',
  'patient cannot forge a voice-session audit event directly'
);

reset role;
select is(
  (
    select count(*)
    from public.audit_events
    where action = 'intake_voice_session_issued'
      and target_id = '73000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'successful issuance records one content-free audit event'
);

set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select public.record_intake_voice_session_issued('73000000-0000-4000-8000-000000000001') $$,
  '42501',
  'Voice input is unavailable',
  'doctor role cannot record patient voice-session issuance'
);

reset role;
insert into public.triage_results (
  intake_session_id, rule_set_version, outcome, matched_rule_codes
)
values (
  '73000000-0000-4000-8000-000000000001',
  'red-flags-v1.0.0',
  'RED_FLAG',
  array['SEVERE_TRAUMA']
);

set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select public.record_intake_voice_session_issued('73000000-0000-4000-8000-000000000001') $$,
  '42501',
  'Voice input is unavailable',
  'red flag blocks further voice-session issuance'
);

reset role;
select * from finish();
rollback;
