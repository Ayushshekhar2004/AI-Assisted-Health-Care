begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

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
    '12000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'intake-patient-one@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '12000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'intake-patient-two@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '12000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'intake-doctor@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

delete from public.profiles
where auth_user_id in (
  '12000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000002',
  '12000000-0000-0000-0000-000000000003'
);

insert into public.profiles (id, auth_user_id, role)
values
  ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'patient'),
  ('22000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000002', 'patient'),
  ('22000000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-000000000003', 'doctor');

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
    '32000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'en',
    '1990-01-01',
    'Synthetic City',
    now()
  ),
  (
    '32000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000002',
    'hi',
    '1991-01-01',
    'Synthetic City',
    now()
  );

insert into public.doctors (id, profile_id)
values ('52000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000003');

insert into public.intake_sessions (id, patient_id)
values ('72000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000002');

insert into public.intake_messages (
  intake_session_id,
  sequence_number,
  role,
  text_content
)
values (
  '72000000-0000-0000-0000-000000000002',
  1,
  'patient',
  'Synthetic other-patient intake text.'
);

insert into public.intake_structured (
  id,
  intake_session_id,
  schema_version,
  structured_data
)
values (
  '82000000-0000-0000-0000-000000000002',
  '72000000-0000-0000-0000-000000000002',
  'synthetic-v1',
  '{"synthetic": true}'::jsonb
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.intake_sessions'::regclass),
  'intake sessions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.intake_messages'::regclass),
  'intake messages has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.intake_structured'::regclass),
  'structured intake has RLS enabled'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('intake_sessions', 'intake_messages', 'intake_structured')
      and column_name in ('reasoning', 'hidden_reasoning', 'chain_of_thought')
  ),
  0::bigint,
  'intake schema has no hidden reasoning columns'
);

set local role authenticated;
set local request.jwt.claim.sub = '12000000-0000-0000-0000-000000000001';

select is((select count(*) from public.intake_sessions), 0::bigint, 'patient sees no other sessions');
select lives_ok(
  $$ select public.start_intake_session() $$,
  'onboarded patient can start an intake session'
);
select is((select count(*) from public.intake_sessions), 1::bigint, 'patient sees own active session');
select results_eq(
  $$ select role::text from public.intake_messages $$,
  $$ values ('assistant') $$,
  'new session stores one visible assistant greeting'
);
select lives_ok(
  $$ select public.start_intake_session() $$,
  'starting intake again safely returns the active session'
);
select is((select count(*) from public.intake_sessions), 1::bigint, 'only one active session exists');
select lives_ok(
  $$
    select public.add_intake_patient_message(
      (select id from public.intake_sessions limit 1),
      '  Synthetic patient intake response.  '
    )
  $$,
  'patient can append visible text to own active session before orchestration'
);
select results_eq(
  $$ select role::text from public.intake_messages order by sequence_number $$,
  $$ values ('assistant'), ('patient') $$,
  'patient cannot create or forge the assistant response'
);
select results_eq(
  $$
    select public.add_intake_patient_message(
      (select id from public.intake_sessions limit 1),
      'Synthetic patient intake response.'
    )
  $$,
  $$ values (false) $$,
  'retrying the same pending message does not duplicate sensitive text'
);
select is(
  (select count(*) from public.intake_messages where created_at is not null),
  2::bigint,
  'all visible messages have timestamps'
);
select throws_ok(
  $$
    insert into public.intake_messages (
      intake_session_id,
      sequence_number,
      role,
      text_content
    )
    values (
      (select id from public.intake_sessions limit 1),
      99,
      'assistant',
      'Patient cannot forge assistant text.'
    )
  $$,
  '42501',
  'permission denied for table intake_messages',
  'patient cannot bypass append function or forge assistant messages'
);
select throws_ok(
  $$
    select public.record_intake_assistant_turn(
      '12000000-0000-0000-0000-000000000001',
      (select id from public.intake_sessions limit 1),
      'When did this synthetic concern begin?',
      '{}'::jsonb,
      'intake-v1',
      false
    )
  $$,
  '42501',
  'permission denied for function record_intake_assistant_turn',
  'patient session cannot forge a validated assistant turn'
);

reset role;

select set_config(
  'test.patient_one_intake_session_id',
  (
    select id::text
    from public.intake_sessions
    where patient_id = '32000000-0000-0000-0000-000000000001'
  ),
  true
);

set local role service_role;

select throws_ok(
  $$
    select public.record_intake_assistant_turn(
      '12000000-0000-0000-0000-000000000001',
      current_setting('test.patient_one_intake_session_id')::uuid,
      'When did this synthetic concern begin?',
      '{"diagnosis": "forbidden"}'::jsonb,
      'intake-v1',
      false
    )
  $$,
  '23514',
  'Assistant intake turn is invalid',
  'database rejects diagnosis fields even from privileged persistence'
);
select lives_ok(
  $$
    select public.record_intake_assistant_turn(
      '12000000-0000-0000-0000-000000000001',
      current_setting('test.patient_one_intake_session_id')::uuid,
      'When did this synthetic concern begin?',
      '{
        "chief_complaint": "Synthetic concern",
        "onset": null,
        "duration": null,
        "severity": null,
        "associated_symptoms": [],
        "relevant_history": [],
        "current_medicines": [],
        "allergies": [],
        "pregnancy_possibility": {
          "clinically_relevant": false,
          "response": "not_clinically_relevant"
        },
        "missing_information": ["onset"],
        "follow_up_question": "When did this synthetic concern begin?",
        "intake_complete": false
      }'::jsonb,
      'intake-v1',
      false
    )
  $$,
  'service role records validated visible assistant and structured output'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '12000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.intake_structured),
  1::bigint,
  'patient sees only own structured intake record'
);
select throws_ok(
  $$
    insert into public.intake_structured (
      intake_session_id,
      schema_version,
      structured_data
    )
    values (
      current_setting('test.patient_one_intake_session_id')::uuid,
      'synthetic-forged-v1',
      '{}'::jsonb
    )
  $$,
  '42501',
  'permission denied for table intake_structured',
  'patient cannot write structured extraction directly'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '12000000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    select public.add_intake_patient_message(
      current_setting('test.patient_one_intake_session_id')::uuid,
      'Synthetic unauthorized response.'
    )
  $$,
  '42501',
  'Intake is unavailable',
  'patient cannot append to another patient intake session'
);
select is((select count(*) from public.intake_sessions), 1::bigint, 'second patient sees own session only');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '12000000-0000-0000-0000-000000000003';

select is((select count(*) from public.intake_sessions), 0::bigint, 'doctor sees no intake sessions globally');
select is((select count(*) from public.intake_messages), 0::bigint, 'doctor sees no intake messages globally');
select is((select count(*) from public.intake_structured), 0::bigint, 'doctor sees no structured intake globally');
select throws_ok(
  $$ select public.start_intake_session() $$,
  '42501',
  'Intake is unavailable',
  'doctor cannot start a patient intake session'
);

reset role;

select is(
  (
    select count(*)
    from public.audit_events
    where target_type = 'intake_session'
  ),
  3::bigint,
  'session, patient message, and assistant turn create content-free audit events'
);
select results_eq(
  $$
    select role::text, text_content
    from public.intake_messages
    where intake_session_id = current_setting('test.patient_one_intake_session_id')::uuid
    order by sequence_number
  $$,
  $$
    values
      (
        'assistant',
        'Please describe what brings you here today. This intake assistant does not diagnose or prescribe.'
      ),
      ('patient', 'Synthetic patient intake response.'),
      (
        'assistant',
        'When did this synthetic concern begin?'
      )
  $$,
  'database stores only the visible conversation text'
);

select * from finish();
rollback;
