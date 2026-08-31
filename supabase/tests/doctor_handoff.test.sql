begin;

create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('17000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'handoff-patient@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000002', '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated', 'handoff-doctor@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000003', '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated', 'handoff-other@example.invalid', '', now(), '{}', '{}', now(), now());

delete from public.profiles
where auth_user_id in (
  '17000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000002',
  '17000000-0000-4000-8000-000000000003'
);

insert into public.profiles (id, auth_user_id, role, display_name) values
  ('27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', 'patient', 'Synthetic Handoff Patient'),
  ('27000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000002', 'doctor', 'Synthetic Handoff Doctor'),
  ('27000000-0000-4000-8000-000000000003', '17000000-0000-4000-8000-000000000003', 'doctor', 'Synthetic Other Doctor');

insert into public.patients (id, profile_id, preferred_language) values
  ('37000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'en');
insert into public.doctors (id, profile_id) values
  ('57000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000002'),
  ('57000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-000000000003');

insert into public.intake_sessions (id, patient_id, status, completed_at) values
  ('77000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000001', 'COMPLETED', now());
insert into public.intake_structured (intake_session_id, schema_version, structured_data) values (
  '77000000-0000-4000-8000-000000000001', 'intake-v1',
  '{"chief_complaint":"Synthetic concern.","onset":"Synthetic onset.","duration":"One synthetic day.","severity":"Moderate.","associated_symptoms":[],"relevant_history":[],"current_medicines":[],"allergies":[],"pregnancy_possibility":{"clinically_relevant":false,"response":"not_clinically_relevant"},"missing_information":[],"follow_up_question":null,"intake_complete":true}'::jsonb
);
insert into public.intake_messages (intake_session_id, sequence_number, role, text_content) values
  ('77000000-0000-4000-8000-000000000001', 1, 'patient', 'Synthetic transcript must not enter handoff source.');

insert into public.doctor_availability (id, doctor_id, starts_at, ends_at) values (
  '67000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000002',
  now() + interval '1 day', now() + interval '1 day 30 minutes'
);
insert into public.appointments (
  id, doctor_availability_id, doctor_id, patient_id, intake_session_id,
  starts_at, ends_at, status
) select
  '87000000-0000-4000-8000-000000000001', id, doctor_id,
  '37000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001', starts_at, ends_at, 'CONFIRMED'
from public.doctor_availability where id = '67000000-0000-4000-8000-000000000001';

insert into public.triage_results (
  intake_session_id, rule_set_version, outcome, matched_rule_codes, explicit_answers
) values (
  '77000000-0000-4000-8000-000000000001', 'red-flags-v1.0.0', 'NO_RED_FLAG', '{}',
  '[{"questionId":"severe_breathing_difficulty","answer":"no"},{"questionId":"chest_pain","answer":"no"},{"questionId":"chest_pain_concerning_features","answer":"no"},{"questionId":"stroke_like_symptoms","answer":"no"},{"questionId":"unconsciousness_or_confusion","answer":"no"},{"questionId":"uncontrolled_bleeding","answer":"no"},{"questionId":"severe_allergic_reaction","answer":"no"},{"questionId":"suicidal_or_self_harm_emergency","answer":"no"},{"questionId":"severe_trauma","answer":"no"}]'::jsonb
);
insert into public.specialty_routing_results (
  intake_session_id, model_name, model_version, prompt_version,
  routing_schema_version, routing_policy_version, model_output, routing_result
) values (
  '77000000-0000-4000-8000-000000000001', 'synthetic-model', 'synthetic-v1',
  'prompt-v1', 'schema-v1', 'policy-v1', '{}'::jsonb,
  '{"rationale_for_doctor":"Synthetic non-diagnostic routing reason."}'::jsonb
);

select has_column('public', 'triage_results', 'explicit_answers', 'explicit answers are persisted');
select has_table('public', 'doctor_handoff_summaries', 'versioned handoff table exists');
select is((select relrowsecurity from pg_class where oid = 'public.doctor_handoff_summaries'::regclass), true, 'handoff table has RLS');
select has_function('public', 'get_doctor_handoff_source', array['uuid'], 'authorized source function exists');
select has_function('public', 'record_doctor_handoff', array['uuid','uuid','text','jsonb'], 'service-only record function exists');
select has_table('public', 'doctor_handoff_feedback', 'append-only handoff feedback table exists');
select is((select relrowsecurity from pg_class where oid = 'public.doctor_handoff_feedback'::regclass), true, 'handoff feedback table has RLS');
select has_function('public', 'mark_doctor_handoff_inaccurate', array['uuid','text','text'], 'doctor feedback function exists');
select has_function('public', 'get_doctor_handoff_inaccurate_items', array['uuid','text'], 'doctor feedback read function exists');

select throws_ok(
  $$ insert into public.triage_results (intake_session_id, rule_set_version, outcome, matched_rule_codes, explicit_answers) values ('77000000-0000-4000-8000-000000000001', 'red-flags-v1.0.0', 'NO_RED_FLAG', '{}', '[{"questionId":"severe_trauma","answer":"no"}]') $$,
  '23514', null, 'incomplete screening answers are rejected'
);

set local role anon;
select throws_ok(
  $$ select * from public.get_doctor_handoff_source('87000000-0000-4000-8000-000000000001') $$,
  '42501', 'permission denied for function get_doctor_handoff_source',
  'anonymous callers cannot read handoff source'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from public.get_doctor_handoff_source('87000000-0000-4000-8000-000000000001') $$,
  '42501', 'Doctor handoff is unavailable', 'patient cannot read doctor handoff source'
);
select throws_ok(
  $$ select public.record_doctor_handoff('17000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', 'doctor-handoff-v1', '{}') $$,
  '42501', 'permission denied for function record_doctor_handoff',
  'authenticated callers cannot invoke privileged persistence'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from public.get_doctor_handoff_source('87000000-0000-4000-8000-000000000001') $$,
  '42501', 'Doctor handoff is unavailable', 'another doctor cannot read handoff source'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000002';
select is(
  (select count(*) from public.get_doctor_handoff_source('87000000-0000-4000-8000-000000000001')),
  1::bigint, 'assigned doctor can read bounded handoff source'
);
select ok(
  position('text_content' in pg_get_function_result('public.get_doctor_handoff_source(uuid)'::regprocedure)) = 0,
  'handoff source cannot return transcript text'
);
select throws_ok(
  $$ select count(*) from public.doctor_handoff_summaries $$,
  '42501', 'permission denied for table doctor_handoff_summaries',
  'doctor cannot browse private handoff table'
);

reset role;
select lives_ok(
  $$ select public.record_doctor_handoff(
    '17000000-0000-4000-8000-000000000002',
    '87000000-0000-4000-8000-000000000001',
    'doctor-handoff-v2',
    '{"chief_complaint":"Synthetic concern.","timeline":{"onset":"Synthetic onset.","duration":"One synthetic day."},"positives":[],"important_negatives":[],"relevant_history":[],"medications":[],"allergies":[],"red_flag_status":{"outcome":"NO_RED_FLAG","matched_rule_codes":[],"rule_set_version":"red-flags-v1.0.0"},"routing_reason":"Synthetic non-diagnostic routing reason.","unanswered_questions":[],"patient_quotes":[],"source_trace":[{"item_key":"chief_complaint","source_kind":"STRUCTURED_INTAKE","source_field":"chief_complaint","recorded_answer":null},{"item_key":"red_flag_status","source_kind":"DETERMINISTIC_TRIAGE","source_field":"triage_results.outcome","recorded_answer":null}]}'::jsonb
  ) $$,
  'service path records a validated versioned handoff'
);
select throws_ok(
  $$ update public.doctor_handoff_summaries set summary_data = summary_data || '{"diagnosis":"forbidden"}'::jsonb $$,
  '23514', null, 'stored handoff rejects forbidden diagnosis field'
);

set local role authenticated;
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000002';
select is(
  (select summary_version from public.get_doctor_handoff('87000000-0000-4000-8000-000000000001')),
  'doctor-handoff-v2', 'assigned doctor can read stored summary version'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select public.mark_doctor_handoff_inaccurate('87000000-0000-4000-8000-000000000001', 'doctor-handoff-v2', 'chief_complaint') $$,
  '42501', 'Doctor handoff feedback is unavailable',
  'patient cannot mark a doctor handoff inaccurate'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select public.mark_doctor_handoff_inaccurate('87000000-0000-4000-8000-000000000001', 'doctor-handoff-v2', 'chief_complaint') $$,
  '42501', 'Doctor handoff feedback is unavailable',
  'another doctor cannot submit handoff feedback'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select public.mark_doctor_handoff_inaccurate('87000000-0000-4000-8000-000000000001', 'doctor-handoff-v2', 'diagnosis') $$,
  '42501', 'Doctor handoff feedback is unavailable',
  'doctor cannot submit feedback for an item absent from source trace'
);
select lives_ok(
  $$ select public.mark_doctor_handoff_inaccurate('87000000-0000-4000-8000-000000000001', 'doctor-handoff-v2', 'chief_complaint') $$,
  'assigned doctor can mark a traced item inaccurate'
);
select lives_ok(
  $$ select public.mark_doctor_handoff_inaccurate('87000000-0000-4000-8000-000000000001', 'doctor-handoff-v2', 'chief_complaint') $$,
  'repeated feedback is idempotent'
);
select is(
  (select count(*) from public.get_doctor_handoff_inaccurate_items('87000000-0000-4000-8000-000000000001', 'doctor-handoff-v2')),
  1::bigint, 'assigned doctor sees the marked item once'
);
select throws_ok(
  $$ select count(*) from public.doctor_handoff_feedback $$,
  '42501', 'permission denied for table doctor_handoff_feedback',
  'doctor cannot browse the private feedback table directly'
);

reset role;
select is((select count(*) from public.doctor_handoff_feedback), 1::bigint, 'one append-only feedback record is stored');
select ok(
  not (select summary_data ? 'feedback' from public.doctor_handoff_summaries where summary_version = 'doctor-handoff-v2'),
  'feedback does not rewrite the original summary'
);

set local role authenticated;
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from public.get_doctor_handoff_inaccurate_items('87000000-0000-4000-8000-000000000001', 'doctor-handoff-v2') $$,
  '42501', 'Doctor handoff feedback is unavailable',
  'another doctor cannot read handoff feedback'
);

reset role;
select ok(exists(select 1 from public.audit_events where action = 'doctor_handoff_source_accessed' and target_id = '87000000-0000-4000-8000-000000000001'), 'source access is audited without content');
select ok(exists(select 1 from public.audit_events where action = 'doctor_handoff_generated' and target_id = '87000000-0000-4000-8000-000000000001'), 'handoff generation is audited without content');
select ok(exists(select 1 from public.audit_events where action = 'doctor_handoff_viewed' and target_id = '87000000-0000-4000-8000-000000000001'), 'handoff view is audited without content');
select ok(exists(select 1 from public.audit_events where action = 'doctor_handoff_marked_inaccurate' and target_id = '87000000-0000-4000-8000-000000000001'), 'inaccuracy feedback is audited without content');

select * from finish();
rollback;
