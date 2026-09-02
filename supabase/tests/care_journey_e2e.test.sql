begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

-- Synthetic identities only. Inserting the patient exercises the real signup
-- provisioning trigger; the doctor is then promoted through trusted setup.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('1e000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','journey-patient@example.invalid','',now(),'{}','{}',now(),now()),
  ('1e000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','journey-doctor@example.invalid','',now(),'{}','{}',now(),now()),
  ('1e000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','journey-outsider@example.invalid','',now(),'{}','{}',now(),now());

select is(
  (select role from public.profiles where auth_user_id='1e000000-0000-4000-8000-000000000001'),
  'patient'::public.profile_role,
  'patient signup provisions a patient profile'
);

delete from public.profiles
where auth_user_id in (
  '1e000000-0000-4000-8000-000000000002',
  '1e000000-0000-4000-8000-000000000003'
);

insert into public.profiles(id,auth_user_id,role,display_name) values
  ('2e000000-0000-4000-8000-000000000002','1e000000-0000-4000-8000-000000000002','doctor','Dr Synthetic Journey'),
  ('2e000000-0000-4000-8000-000000000003','1e000000-0000-4000-8000-000000000003','patient','Synthetic Outsider');

insert into public.patients(id,profile_id,preferred_language,date_of_birth,city,onboarding_completed_at)
values ('3e000000-0000-4000-8000-000000000003','2e000000-0000-4000-8000-000000000003','en','1990-01-01','Synthetic Other City',now());

insert into public.doctors(
  id,profile_id,status,full_name,qualification,registration_number,
  registration_council,registration_state,specialty,languages,
  teleconsultation_fee_paise,clinic_city,onboarding_completed_at,is_bookable,
  verification_reason,verification_decided_at,verification_decided_by
) values (
  '4e000000-0000-4000-8000-000000000002','2e000000-0000-4000-8000-000000000002',
  'verified','Dr Synthetic Journey','Synthetic Medical Qualification','SYN-E2E-001',
  'Synthetic Medical Council','Synthetic State','GENERAL_MEDICINE',
  array['en']::public.doctor_language[],50000,'Synthetic Journey City',now(),true,
  'Synthetic development approval',now(),'1e000000-0000-4000-8000-000000000002'
);

set local role authenticated;
set local request.jwt.claim.sub='1e000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.complete_patient_onboarding('en','1990-01-01',null,'Synthetic Journey City',null,null,true,true)$$,
  'patient completes onboarding and purpose consent'
);
select is(
  (select count(*) from public.consent_records where patient_id=(
    select patients.id from public.patients join public.profiles on profiles.id=patients.profile_id
    where profiles.auth_user_id='1e000000-0000-4000-8000-000000000001'
  )),
  2::bigint,
  'onboarding stores two separate consent records'
);
select isnt(public.start_intake_session(),null::uuid,'patient starts intake');
select ok(
  public.add_intake_patient_message(
    (select id from public.intake_sessions where patient_id=(
      select patients.id from public.patients join public.profiles on profiles.id=patients.profile_id
      where profiles.auth_user_id='1e000000-0000-4000-8000-000000000001'
    )),
    'Synthetic mild concern for workflow testing.'
  ),
  'patient submits a synthetic intake response'
);

-- Trusted AI/triage providers are stubbed by persisting deterministic, validated
-- outputs through the same server-only RPCs used by production orchestration.
reset role;
set local role service_role;
select lives_ok($$
  select public.record_intake_assistant_turn(
    '1e000000-0000-4000-8000-000000000001',
    (select id from public.intake_sessions where patient_id=(
      select patients.id from public.patients join public.profiles on profiles.id=patients.profile_id
      where profiles.auth_user_id='1e000000-0000-4000-8000-000000000001'
    )),
    'Your synthetic intake is complete.',
    '{"chief_complaint":"Synthetic mild concern","onset":"Today","duration":"Short","severity":2,"associated_symptoms":[],"relevant_history":[],"current_medicines":[],"allergies":[],"pregnancy_possibility":null,"missing_information":[]}'::jsonb,
    'intake-v1',true
  )
$$,'stubbed AI output completes structured intake');

select lives_ok($$
  select public.record_triage_result_with_answers(
    '1e000000-0000-4000-8000-000000000001',
    (select id from public.intake_sessions where patient_id=(
      select patients.id from public.patients join public.profiles on profiles.id=patients.profile_id
      where profiles.auth_user_id='1e000000-0000-4000-8000-000000000001'
    )),
    'red-flags-v1.0.0','NO_RED_FLAG',array[]::text[],
    '[{"questionId":"severe_breathing_difficulty","answer":"no"},{"questionId":"chest_pain","answer":"no"},{"questionId":"chest_pain_concerning_features","answer":"no"},{"questionId":"stroke_like_symptoms","answer":"no"},{"questionId":"unconsciousness_or_confusion","answer":"no"},{"questionId":"uncontrolled_bleeding","answer":"no"},{"questionId":"severe_allergic_reaction","answer":"no"},{"questionId":"suicidal_or_self_harm_emergency","answer":"no"},{"questionId":"severe_trauma","answer":"no"}]'::jsonb
  )
$$,'deterministic triage records a non-emergency result');

select lives_ok($$
  select public.record_specialty_routing_result(
    '1e000000-0000-4000-8000-000000000001',
    (select id from public.intake_sessions where patient_id=(
      select patients.id from public.patients join public.profiles on profiles.id=patients.profile_id
      where profiles.auth_user_id='1e000000-0000-4000-8000-000000000001'
    )),
    'synthetic-provider-stub','synthetic-v1','routing-prompt-v1','routing-schema-v1','routing-policy-v1',
    '{"recommended_specialty":"GENERAL_MEDICINE","alternate_specialty":null,"urgency":"ROUTINE","rationale_for_doctor":"Synthetic non-diagnostic routing rationale.","confidence":0.9,"missing_information":[]}'::jsonb,
    '{"recommended_specialty":"GENERAL_MEDICINE","alternate_specialty":null,"urgency":"ROUTINE","rationale_for_doctor":"Synthetic non-diagnostic routing rationale.","confidence":0.9,"missing_information":[],"decision_source":"AI","fallback_reasons":[]}'::jsonb
  )
$$,'stubbed routing output is schema-validated and stored');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='1e000000-0000-4000-8000-000000000002';
select isnt(public.create_doctor_availability(now()+interval '2 days',now()+interval '2 days 30 minutes'),null::uuid,'verified doctor publishes availability');

set local request.jwt.claim.sub='1e000000-0000-4000-8000-000000000001';
select is(
  (select doctor_id from public.find_matching_doctors('TELECONSULTATION',now(),now()+interval '10 days') limit 1),
  '4e000000-0000-4000-8000-000000000002'::uuid,
  'patient receives the verified routed doctor shortlist'
);
select isnt(
  public.request_appointment((select id from public.doctor_availability where doctor_id='4e000000-0000-4000-8000-000000000002')),
  null::uuid,
  'patient books the selected doctor slot'
);
select is(
  (select intake_sessions.status from public.appointments join public.intake_sessions on intake_sessions.id=appointments.intake_session_id where appointments.doctor_id='4e000000-0000-4000-8000-000000000002'),
  'COMPLETED'::public.intake_session_status,
  'booking attaches the completed intake to the appointment'
);

set local request.jwt.claim.sub='1e000000-0000-4000-8000-000000000002';
select lives_ok($$select public.transition_appointment_status((select id from public.appointments where doctor_id='4e000000-0000-4000-8000-000000000002'),'CONFIRMED')$$,'assigned doctor confirms the request');
select is(
  (select structured_data->>'chief_complaint' from public.get_doctor_appointment_detail((select id from public.appointments where doctor_id='4e000000-0000-4000-8000-000000000002'))),
  'Synthetic mild concern',
  'assigned doctor reviews the linked structured intake'
);
select is(
  (select participant_role from public.authorize_appointment_video_token((select id from public.appointments where doctor_id='4e000000-0000-4000-8000-000000000002'))),
  'doctor',
  'video provider stub authorizes the assigned doctor without issuing a real token'
);

set local request.jwt.claim.sub='1e000000-0000-4000-8000-000000000003';
select throws_ok(
  $$select * from public.authorize_appointment_video_token((select id from public.appointments where doctor_id='4e000000-0000-4000-8000-000000000002'))$$,
  '42501','Video consultation is unavailable','unrelated user cannot authorize a video token'
);

set local request.jwt.claim.sub='1e000000-0000-4000-8000-000000000002';
select is(
  public.start_appointment_consultation((select id from public.appointments where doctor_id='4e000000-0000-4000-8000-000000000002')),
  'IN_PROGRESS'::public.appointment_status,
  'assigned doctor starts the consultation'
);
select isnt(
  public.finalize_consultation(
    (select id from public.appointments where doctor_id='4e000000-0000-4000-8000-000000000002'),
    'Reviewed synthetic history','Remote examination limitations','Reviewed synthetic assessment',
    'Reviewed synthetic plan','Synthetic follow-up','ADEQUATE'
  ),null::uuid,'assigned verified doctor finalizes the consultation'
);
select isnt(
  public.write_prescription(
    (select id from public.appointments where doctor_id='4e000000-0000-4000-8000-000000000002'),
    'Synthetic follow-up',
    '[{"item_type":"INSTRUCTION","item_name":"Synthetic reviewed instruction","dosage":"","frequency":"","duration":"","instructions":"Synthetic clinician-reviewed instruction."}]'::jsonb,
    true
  ),null::uuid,'doctor explicitly finalizes a synthetic prescription'
);

set local request.jwt.claim.sub='1e000000-0000-4000-8000-000000000001';
select is((select count(*) from public.list_patient_history(10,0)),1::bigint,'patient history contains the completed appointment');
select is(
  (select finalized_prescription->>'follow_up' from public.list_patient_history(10,0)),
  'Synthetic follow-up',
  'patient history exposes the finalized prescription'
);

reset role;
select * from finish();
rollback;
