begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('16000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'detail-patient@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'detail-doctor@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'detail-other-doctor@example.invalid', '', now(), '{}', '{}', now(), now());

delete from public.profiles
where auth_user_id in (
  '16000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000002',
  '16000000-0000-4000-8000-000000000003'
);

insert into public.profiles (id, auth_user_id, role, display_name)
values
  ('26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 'patient', 'Synthetic Detail Patient'),
  ('26000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000002', 'doctor', 'Synthetic Detail Doctor'),
  ('26000000-0000-4000-8000-000000000003', '16000000-0000-4000-8000-000000000003', 'doctor', 'Synthetic Other Doctor');

insert into public.patients (
  id, profile_id, preferred_language, date_of_birth, gender, city,
  emergency_contact_name, emergency_contact_phone, onboarding_completed_at
)
values (
  '36000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  'hi',
  (current_date - interval '36 years')::date,
  'prefer_not_to_say',
  'Synthetic Detail City',
  'Synthetic Private Contact',
  '+910000000001',
  now()
);

insert into public.doctors (id, profile_id)
values
  ('56000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000002'),
  ('56000000-0000-4000-8000-000000000003', '26000000-0000-4000-8000-000000000003');

insert into public.intake_sessions (
  id, patient_id, status, completed_at, created_at
)
values (
  '76000000-0000-4000-8000-000000000001',
  '36000000-0000-4000-8000-000000000001',
  'COMPLETED',
  now(),
  now() - interval '2 hours'
);

insert into public.intake_structured (
  intake_session_id, schema_version, structured_data
)
values (
  '76000000-0000-4000-8000-000000000001',
  'intake-v1',
  '{"chief_complaint":"Synthetic patient-provided complaint.","onset":"Synthetic onset.","duration":"Two synthetic days.","severity":"Moderate.","associated_symptoms":[],"relevant_history":[],"current_medicines":[],"allergies":[],"pregnancy_possibility":{"clinically_relevant":false,"response":"not_clinically_relevant"},"missing_information":[],"follow_up_question":null,"intake_complete":true}'::jsonb
);

insert into public.intake_messages (
  id, intake_session_id, sequence_number, role, text_content, created_at
)
values
  ('96000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', 1, 'patient', 'Synthetic patient transcript.', now() - interval '2 hours'),
  ('96000000-0000-4000-8000-000000000002', '76000000-0000-4000-8000-000000000001', 2, 'assistant', 'Synthetic assistant transcript.', now() - interval '119 minutes');

insert into public.doctor_availability (id, doctor_id, starts_at, ends_at)
values (
  '66000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000002',
  now() + interval '1 day',
  now() + interval '1 day 30 minutes'
);

insert into public.appointments (
  id, doctor_availability_id, doctor_id, patient_id, starts_at, ends_at, status
)
select
  '86000000-0000-4000-8000-000000000001',
  id,
  doctor_id,
  '36000000-0000-4000-8000-000000000001',
  starts_at,
  ends_at,
  'CONFIRMED'
from public.doctor_availability
where id = '66000000-0000-4000-8000-000000000001';

insert into public.triage_results (
  intake_session_id, rule_set_version, outcome, matched_rule_codes
)
values (
  '76000000-0000-4000-8000-000000000001',
  'red-flags-v1.0.0',
  'RED_FLAG',
  array['SEVERE_TRAUMA']
);

insert into public.specialty_routing_results (
  intake_session_id, model_name, model_version, prompt_version,
  routing_schema_version, routing_policy_version, model_output, routing_result
)
values (
  '76000000-0000-4000-8000-000000000001',
  'synthetic-detail-model', 'synthetic-detail-model-v1',
  'prompt-v1', 'schema-v1', 'policy-v1',
  '{"recommended_specialty":"GENERAL_MEDICINE","alternate_specialty":null,"urgency":"EMERGENCY","rationale_for_doctor":"Synthetic routing rationale.","confidence":0.4,"missing_information":[]}'::jsonb,
  '{"recommended_specialty":"GENERAL_MEDICINE","alternate_specialty":null,"urgency":"EMERGENCY","rationale_for_doctor":"Synthetic routing rationale.","confidence":0.4,"missing_information":[],"decision_source":"DETERMINISTIC_FALLBACK","fallback_reasons":["RED_FLAG"]}'::jsonb
);

select has_function(
  'public', 'get_doctor_appointment_detail', array['uuid'],
  'doctor appointment detail function exists'
);
select has_function(
  'public', 'get_doctor_appointment_transcript', array['uuid'],
  'doctor appointment transcript function exists'
);

set local role anon;
select throws_ok(
  $$ select * from public.get_doctor_appointment_detail('86000000-0000-4000-8000-000000000001') $$,
  '42501',
  'permission denied for function get_doctor_appointment_detail',
  'anonymous callers cannot read appointment detail'
);
select throws_ok(
  $$ select * from public.get_doctor_appointment_transcript('86000000-0000-4000-8000-000000000001') $$,
  '42501',
  'permission denied for function get_doctor_appointment_transcript',
  'anonymous callers cannot expand transcripts'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '16000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from public.get_doctor_appointment_detail('86000000-0000-4000-8000-000000000001') $$,
  '42501', 'Appointment detail is unavailable',
  'patient role cannot read doctor appointment detail'
);
select throws_ok(
  $$ select * from public.get_doctor_appointment_transcript('86000000-0000-4000-8000-000000000001') $$,
  '42501', 'Appointment transcript is unavailable',
  'patient role cannot expand doctor transcripts'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '16000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from public.get_doctor_appointment_detail('86000000-0000-4000-8000-000000000001') $$,
  '42501', 'Appointment detail is unavailable',
  'another doctor cannot read the appointment detail'
);
select throws_ok(
  $$ select * from public.get_doctor_appointment_transcript('86000000-0000-4000-8000-000000000001') $$,
  '42501', 'Appointment transcript is unavailable',
  'another doctor cannot expand the appointment transcript'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '16000000-0000-4000-8000-000000000002';
select is(
  (select count(*) from public.get_doctor_appointment_detail('86000000-0000-4000-8000-000000000001')),
  1::bigint,
  'assigned doctor can read one appointment detail'
);
select results_eq(
  $$
    select patient_display_name, patient_age_years, patient_gender::text,
      patient_city, patient_language::text
    from public.get_doctor_appointment_detail('86000000-0000-4000-8000-000000000001')
  $$,
  $$ values ('Synthetic Detail Patient'::text, 36, 'prefer_not_to_say'::text, 'Synthetic Detail City'::text, 'hi'::text) $$,
  'detail includes bounded patient-provided profile context'
);
select is(
  (select structured_data->>'chief_complaint' from public.get_doctor_appointment_detail('86000000-0000-4000-8000-000000000001')),
  'Synthetic patient-provided complaint.',
  'detail includes the appointment-linked structured intake'
);
select is(
  (select triage_outcome::text from public.get_doctor_appointment_detail('86000000-0000-4000-8000-000000000001')),
  'RED_FLAG',
  'detail preserves the deterministic red-flag result'
);
select is(
  (select matched_rule_codes from public.get_doctor_appointment_detail('86000000-0000-4000-8000-000000000001')),
  array['SEVERE_TRAUMA']::text[],
  'detail includes the matched deterministic rule codes'
);
select is(
  (select routing_result->>'rationale_for_doctor' from public.get_doctor_appointment_detail('86000000-0000-4000-8000-000000000001')),
  'Synthetic routing rationale.',
  'detail includes routing rationale for doctor review'
);
select ok(
  not (select routing_result ? 'confidence' from public.get_doctor_appointment_detail('86000000-0000-4000-8000-000000000001')),
  'doctor detail projection excludes the internal routing confidence score'
);
select is(
  (select count(*) from public.get_doctor_appointment_transcript('86000000-0000-4000-8000-000000000001')),
  2::bigint,
  'explicit transcript request returns visible messages only'
);
select results_eq(
  $$
    select message_role::text, text_content
    from public.get_doctor_appointment_transcript('86000000-0000-4000-8000-000000000001')
  $$,
  $$ values
    ('patient'::text, 'Synthetic patient transcript.'::text),
    ('assistant'::text, 'Synthetic assistant transcript.'::text)
  $$,
  'transcript preserves patient and visible assistant provenance'
);
select is(
  (select count(*) from public.profiles),
  1::bigint,
  'detail access does not grant global patient profile browsing'
);
select is(
  (select count(*) from public.intake_structured),
  0::bigint,
  'doctor cannot browse structured intake outside the authorized function'
);

reset role;
select ok(
  exists (
    select 1 from public.audit_events
    where actor_user_id = '16000000-0000-4000-8000-000000000002'
      and action = 'doctor_appointment_detail_viewed'
      and target_id = '86000000-0000-4000-8000-000000000001'
  ),
  'appointment detail access is audited without content'
);
select ok(
  exists (
    select 1 from public.audit_events
    where actor_user_id = '16000000-0000-4000-8000-000000000002'
      and action = 'doctor_appointment_transcript_viewed'
      and target_id = '86000000-0000-4000-8000-000000000001'
  ),
  'explicit transcript access is separately audited without content'
);
select ok(
  position(
    'emergency_contact' in
    pg_get_function_result('public.get_doctor_appointment_detail(uuid)'::regprocedure)
  ) = 0,
  'detail function does not return emergency contact fields'
);

select * from finish();
rollback;
