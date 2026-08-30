begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  ('12000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'matching-user-' || number || '@example.invalid',
  '',
  now(),
  '{}',
  '{}',
  now(),
  now()
from generate_series(1, 12) as number;

delete from public.profiles
where auth_user_id in (
  select ('12000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid
  from generate_series(1, 12) as number
);

insert into public.profiles (id, auth_user_id, role)
select
  ('22000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('12000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  case when number = 1 then 'patient'::public.profile_role else 'doctor'::public.profile_role end
from generate_series(1, 12) as number;

insert into public.patients (
  id, profile_id, preferred_language, date_of_birth, city, onboarding_completed_at
)
values (
  '32000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'en',
  '1990-01-01',
  'Synthetic Match City',
  now()
);

insert into public.doctors (
  id, profile_id, status, full_name, qualification, registration_number,
  registration_council, registration_state, specialty, languages,
  teleconsultation_fee_paise, clinic_city, onboarding_completed_at,
  verification_reason, verification_decided_at, verification_decided_by,
  is_bookable
)
select
  ('52000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('22000000-0000-4000-8000-' || lpad((number + 1)::text, 12, '0'))::uuid,
  case when number = 8 then 'pending_verification'::public.doctor_status else 'verified'::public.doctor_status end,
  'Dr Synthetic Match ' || number,
  'Synthetic Medical Degree',
  'SYN-MATCH-' || number,
  'Synthetic Medical Council',
  'Synthetic State',
  case when number = 9 then 'Cardiology' else 'General Medicine' end,
  case when number = 10 then array['hi']::public.doctor_language[] else array['en']::public.doctor_language[] end,
  50000 + number,
  case when number % 2 = 1 then 'Synthetic Match City' else 'Another Synthetic City' end,
  now(),
  case when number = 8 then null else 'Synthetic verification approval.' end,
  case when number = 8 then null else now() end,
  case when number = 8 then null else '12000000-0000-4000-8000-000000000012'::uuid end,
  number <> 8
from generate_series(1, 10) as number;

insert into public.doctor_availability (id, doctor_id, starts_at, ends_at)
values
  (
    '62000000-0000-4000-8000-000000000101',
    '52000000-0000-4000-8000-000000000001',
    now() + interval '11 days',
    now() + interval '11 days 30 minutes'
  ),
  (
    '62000000-0000-4000-8000-000000000102',
    '52000000-0000-4000-8000-000000000001',
    now() + interval '12 days',
    now() + interval '12 days 30 minutes'
  );

insert into public.doctor_availability (id, doctor_id, starts_at, ends_at)
select
  ('62000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('52000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  now() + make_interval(days => number),
  now() + make_interval(days => number, mins => 30)
from generate_series(1, 10) as number;

insert into public.intake_sessions (id, patient_id)
values (
  '72000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001'
);

insert into public.specialty_routing_results (
  intake_session_id,
  model_name,
  model_version,
  prompt_version,
  routing_schema_version,
  routing_policy_version,
  model_output,
  routing_result
)
values (
  '72000000-0000-4000-8000-000000000001',
  'synthetic-routing-model',
  'synthetic-v1',
  'specialty-routing-prompt-v1',
  'specialty-routing-v1',
  'specialty-routing-policy-v1',
  '{"recommended_specialty":"GENERAL_MEDICINE"}'::jsonb,
  '{"recommended_specialty":"GENERAL_MEDICINE","decision_source":"AI"}'::jsonb
);

set local role anon;
select throws_ok(
  $$
    select * from public.find_matching_doctors(
      'TELECONSULTATION', now(), now() + interval '30 days'
    )
  $$,
  '42501',
  'permission denied for function find_matching_doctors',
  'anonymous users cannot call doctor matching'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '12000000-0000-4000-8000-000000000001';

select is((select count(*) from public.doctors), 0::bigint, 'patient cannot browse doctor records directly');

select is(
  (
    select count(*)
    from public.find_matching_doctors(
      'TELECONSULTATION', now(), now() + interval '30 days'
    )
  ),
  5::bigint,
  'teleconsultation matching returns a shortlist capped at five verified doctors'
);

select ok(
  (
    select bool_and(clinic_city is null)
    from public.find_matching_doctors(
      'TELECONSULTATION', now(), now() + interval '30 days'
    )
  ),
  'teleconsultation matching neither uses nor returns patient-city matches'
);

select results_eq(
  $$
    select doctor_name
    from public.find_matching_doctors(
      'TELECONSULTATION', now(), now() + interval '30 days'
    )
  $$,
  $$ values
    ('Dr Synthetic Match 1'),
    ('Dr Synthetic Match 2'),
    ('Dr Synthetic Match 3'),
    ('Dr Synthetic Match 4'),
    ('Dr Synthetic Match 5')
  $$,
  'matching ranks only by earliest open availability with a stable tie-breaker'
);

select is(
  (
    select count(*)
    from public.find_matching_doctors(
      'IN_PERSON', now(), now() + interval '30 days'
    )
  ),
  4::bigint,
  'in-person matching requires the authenticated patient city'
);

select ok(
  (
    select bool_and(clinic_city = 'Synthetic Match City')
    from public.find_matching_doctors(
      'IN_PERSON', now(), now() + interval '30 days'
    )
  ),
  'in-person results disclose only the matched clinic city'
);

select is(
  (
    select count(*)
    from public.find_matching_doctors(
      'TELECONSULTATION', now(), now() + interval '30 days'
    )
    where registration_number is not null
  ),
  5::bigint,
  'selection returns registration numbers only for verified shortlisted doctors'
);

select ok(
  (
    select bool_and('en'::public.doctor_language = any(consultation_languages))
    from public.find_matching_doctors(
      'TELECONSULTATION', now(), now() + interval '30 days'
    )
  ),
  'preferred consultation language is derived from the patient record'
);

select is(
  (
    select jsonb_array_length(next_slots)
    from public.find_matching_doctors(
      'TELECONSULTATION', now(), now() + interval '30 days'
    )
    where doctor_name = 'Dr Synthetic Match 1'
  ),
  3,
  'selection returns at most three next open slots for a doctor'
);

reset role;
select is(
  (
    select count(*)
    from public.audit_events
    where action = 'doctor_match_searched'
      and target_id = '32000000-0000-4000-8000-000000000001'
  ),
  8::bigint,
  'each successful search emits a content-free audit event'
);

set local role authenticated;
set local request.jwt.claim.sub = '12000000-0000-4000-8000-000000000001';
select lives_ok(
  $$ select public.request_appointment('62000000-0000-4000-8000-000000000001') $$,
  'patient can book a returned slot'
);

select is(
  (
    select count(*)
    from public.find_matching_doctors(
      'TELECONSULTATION', now(), now() + interval '2 days'
    )
    where doctor_name = 'Dr Synthetic Match 1'
  ),
  0::bigint,
  'matching excludes an occupied availability slot'
);

select ok(
  (
    select bool_and(specialty = 'GENERAL_MEDICINE')
    from public.find_matching_doctors(
      'TELECONSULTATION', now(), now() + interval '30 days'
    )
  ),
  'specialty is derived from the latest owned routing result'
);

select throws_ok(
  $$
    select * from public.find_matching_doctors(
      null::text, now(), now() + interval '30 days'
    )
  $$,
  '22023',
  'Doctor matching criteria are invalid',
  'database rejects an omitted consultation mode'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '12000000-0000-4000-8000-000000000002';

select throws_ok(
  $$
    select * from public.find_matching_doctors(
      'TELECONSULTATION', now(), now() + interval '30 days'
    )
  $$,
  '42501',
  'Doctor matching is unavailable',
  'doctor role cannot browse the matching service'
);

reset role;
insert into public.triage_results (
  intake_session_id, rule_set_version, outcome, matched_rule_codes
)
values (
  '72000000-0000-4000-8000-000000000001',
  'red-flags-v1.0.0',
  'RED_FLAG',
  array['SEVERE_TRAUMA']
);

set local role authenticated;
set local request.jwt.claim.sub = '12000000-0000-4000-8000-000000000001';
select throws_ok(
  $$
    select * from public.find_matching_doctors(
      'TELECONSULTATION', now(), now() + interval '30 days'
    )
  $$,
  '42501',
  'Emergency pathway required',
  'persistent red flag blocks normal doctor matching'
);

reset role;
select * from finish();
rollback;
