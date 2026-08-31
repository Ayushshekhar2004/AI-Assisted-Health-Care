begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('15000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dashboard-patient-one@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('15000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dashboard-patient-two@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('15000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dashboard-doctor-one@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('15000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dashboard-doctor-two@example.invalid', '', now(), '{}', '{}', now(), now());

delete from public.profiles
where auth_user_id in (
  '15000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000002',
  '15000000-0000-4000-8000-000000000003',
  '15000000-0000-4000-8000-000000000004'
);

insert into public.profiles (id, auth_user_id, role, display_name)
values
  ('25000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', 'patient', 'Synthetic Dashboard Patient One'),
  ('25000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000002', 'patient', 'Synthetic Dashboard Patient Two'),
  ('25000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000003', 'doctor', 'Synthetic Dashboard Doctor One'),
  ('25000000-0000-4000-8000-000000000004', '15000000-0000-4000-8000-000000000004', 'doctor', 'Synthetic Dashboard Doctor Two');

insert into public.patients (
  id, profile_id, preferred_language, date_of_birth, city, onboarding_completed_at
)
values
  ('35000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000001', 'en', '1990-01-01', 'Synthetic Dashboard City', now()),
  ('35000000-0000-4000-8000-000000000002', '25000000-0000-4000-8000-000000000002', 'hi', '1991-01-01', 'Synthetic Dashboard City', now());

insert into public.doctors (id, profile_id)
values
  ('55000000-0000-4000-8000-000000000003', '25000000-0000-4000-8000-000000000003'),
  ('55000000-0000-4000-8000-000000000004', '25000000-0000-4000-8000-000000000004');

insert into public.intake_sessions (
  id, patient_id, status, completed_at, created_at
)
values
  ('75000000-0000-4000-8000-000000000001', '35000000-0000-4000-8000-000000000001', 'COMPLETED', now(), now() - interval '2 hours'),
  ('75000000-0000-4000-8000-000000000002', '35000000-0000-4000-8000-000000000002', 'ACTIVE', null, now() - interval '1 hour');

insert into public.specialty_routing_results (
  intake_session_id, model_name, model_version, prompt_version,
  routing_schema_version, routing_policy_version, model_output, routing_result
)
values (
  '75000000-0000-4000-8000-000000000001',
  'synthetic-dashboard-model', 'synthetic-dashboard-model-v1',
  'prompt-v1', 'schema-v1', 'policy-v1',
  '{"recommended_specialty":"GENERAL_MEDICINE","alternate_specialty":null,"urgency":"URGENT","rationale_for_doctor":"Synthetic routing rationale.","confidence":0.9,"missing_information":[]}'::jsonb,
  '{"recommended_specialty":"GENERAL_MEDICINE","alternate_specialty":null,"urgency":"URGENT","rationale_for_doctor":"Synthetic routing rationale.","confidence":0.9,"missing_information":[],"decision_source":"AI","fallback_reasons":[]}'::jsonb
);

insert into public.doctor_availability (id, doctor_id, starts_at, ends_at)
values
  ('65000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000003', now() + interval '1 day', now() + interval '1 day 30 minutes'),
  ('65000000-0000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000003', now() + interval '2 days', now() + interval '2 days 30 minutes'),
  ('65000000-0000-4000-8000-000000000003', '55000000-0000-4000-8000-000000000004', now() + interval '3 days', now() + interval '3 days 30 minutes'),
  ('65000000-0000-4000-8000-000000000004', '55000000-0000-4000-8000-000000000003', now() + interval '4 days', now() + interval '4 days 30 minutes');

insert into public.appointments (
  id, doctor_availability_id, doctor_id, patient_id, starts_at, ends_at, status
)
select
  appointment_id,
  availability.id,
  availability.doctor_id,
  patient_id,
  availability.starts_at,
  availability.ends_at,
  appointment_status
from (
  values
    ('85000000-0000-4000-8000-000000000001'::uuid, '65000000-0000-4000-8000-000000000001'::uuid, '35000000-0000-4000-8000-000000000001'::uuid, 'CONFIRMED'::public.appointment_status),
    ('85000000-0000-4000-8000-000000000002'::uuid, '65000000-0000-4000-8000-000000000002'::uuid, '35000000-0000-4000-8000-000000000002'::uuid, 'REQUESTED'::public.appointment_status),
    ('85000000-0000-4000-8000-000000000003'::uuid, '65000000-0000-4000-8000-000000000003'::uuid, '35000000-0000-4000-8000-000000000001'::uuid, 'CONFIRMED'::public.appointment_status)
) as fixtures (appointment_id, availability_id, patient_id, appointment_status)
join public.doctor_availability as availability on availability.id = fixtures.availability_id;

select has_column('public', 'appointments', 'intake_session_id', 'appointment stores its associated intake');
select has_function(
  'public',
  'list_doctor_dashboard_appointments',
  array['timestamp with time zone', 'timestamp with time zone', 'appointment_status', 'integer', 'integer'],
  'doctor dashboard function exists'
);
select is(
  (select intake_session_id from public.appointments where id = '85000000-0000-4000-8000-000000000001'),
  '75000000-0000-4000-8000-000000000001'::uuid,
  'booking attaches the patient latest non-abandoned intake'
);
select throws_ok(
  $$
    insert into public.appointments (
      doctor_availability_id, doctor_id, patient_id, starts_at, ends_at, intake_session_id
    )
    select id, doctor_id, '35000000-0000-4000-8000-000000000002', starts_at, ends_at,
      '75000000-0000-4000-8000-000000000001'
    from public.doctor_availability
    where id = '65000000-0000-4000-8000-000000000004'
  $$,
  '23503',
  null,
  'an appointment cannot reference another patient intake'
);

set local role anon;
select throws_ok(
  $$ select * from public.list_doctor_dashboard_appointments(now(), now() + interval '10 days', null, 10, 0) $$,
  '42501',
  'permission denied for function list_doctor_dashboard_appointments',
  'anonymous callers cannot access the dashboard'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '15000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from public.list_doctor_dashboard_appointments(now(), now() + interval '10 days', null, 10, 0) $$,
  '42501',
  'Doctor dashboard is unavailable',
  'a patient cannot access the doctor dashboard'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '15000000-0000-4000-8000-000000000003';
select is(
  (select count(*) from public.list_doctor_dashboard_appointments(now(), now() + interval '10 days', null, 10, 0)),
  2::bigint,
  'doctor sees only their own appointments'
);
select results_eq(
  $$
    select patient_display_name, patient_language::text, intake_state, urgency
    from public.list_doctor_dashboard_appointments(now(), now() + interval '10 days', 'CONFIRMED', 10, 0)
  $$,
  $$ values ('Synthetic Dashboard Patient One'::text, 'en'::text, 'COMPLETED'::text, 'URGENT'::text) $$,
  'dashboard returns only requested patient display and intake summary fields'
);
select is(
  (select total_count from public.list_doctor_dashboard_appointments(now(), now() + interval '10 days', null, 1, 1)),
  2::bigint,
  'pagination retains the filtered total count'
);
select is(
  (select count(*) from public.list_doctor_dashboard_appointments(now(), now() + interval '10 days', 'REQUESTED', 10, 0)),
  1::bigint,
  'status filtering is applied in the database'
);
select is(
  (select count(*) from public.profiles),
  1::bigint,
  'dashboard access does not grant global patient profile browsing'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '15000000-0000-4000-8000-000000000004';
select is(
  (select count(*) from public.list_doctor_dashboard_appointments(now(), now() + interval '10 days', null, 10, 0)),
  1::bigint,
  'another doctor receives only their own appointment'
);

reset role;
select ok(
  (
    select count(*) >= 1
    from public.audit_events
    where actor_user_id = '15000000-0000-4000-8000-000000000003'
      and action = 'doctor_dashboard_viewed'
      and target_id = '55000000-0000-4000-8000-000000000003'
  ),
  'dashboard reads create content-free audit events'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name in ('symptoms', 'message_body', 'prescription')
  ),
  0::bigint,
  'appointment list storage does not duplicate raw clinical content'
);

select * from finish();
rollback;
