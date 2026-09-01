begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('1b000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','safe-care-patient@example.invalid','',now(),'{}','{}',now(),now()),
('1b000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','safe-care-doctor@example.invalid','',now(),'{}','{}',now(),now()),
('1b000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','safe-care-other@example.invalid','',now(),'{}','{}',now(),now());
delete from public.profiles where auth_user_id in ('1b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000002','1b000000-0000-4000-8000-000000000003');
insert into public.profiles(id,auth_user_id,role) values
('2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000001','patient'),
('2b000000-0000-4000-8000-000000000002','1b000000-0000-4000-8000-000000000002','doctor'),
('2b000000-0000-4000-8000-000000000003','1b000000-0000-4000-8000-000000000003','patient');
insert into public.patients(id,profile_id,preferred_language,date_of_birth,city,onboarding_completed_at) values
('3b000000-0000-4000-8000-000000000001','2b000000-0000-4000-8000-000000000001','en','1990-01-01','Synthetic City',now()),
('3b000000-0000-4000-8000-000000000003','2b000000-0000-4000-8000-000000000003','en','1990-01-01','Synthetic City',now());
insert into public.doctors(id,profile_id) values ('5b000000-0000-4000-8000-000000000002','2b000000-0000-4000-8000-000000000002');
insert into public.intake_sessions(id,patient_id,status,completed_at) values ('7b000000-0000-4000-8000-000000000001','3b000000-0000-4000-8000-000000000001','COMPLETED',now());

select has_table('public','safe_care_guidance_results','safe care guidance table exists');
select ok((select relrowsecurity from pg_class where oid='public.safe_care_guidance_results'::regclass),'safe care guidance has RLS');

set local role authenticated; set local request.jwt.claim.sub='1b000000-0000-4000-8000-000000000001';
select throws_ok($$ insert into public.safe_care_guidance_results(intake_session_id,patient_id,symptom_category,disposition,language,library_version,guidance_snapshot) values('7b000000-0000-4000-8000-000000000001','3b000000-0000-4000-8000-000000000001','MILD_HEADACHE','GUIDANCE','en','safe-care-development-v1','{}') $$,'42501','permission denied for table safe_care_guidance_results','patient cannot forge guidance');
select throws_ok($$ select public.record_safe_care_guidance('1b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000001','{}') $$,'42501','permission denied for function record_safe_care_guidance','patient cannot call service persistence');

reset role; set local role service_role;
select lives_ok($$ select public.record_safe_care_guidance('1b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000001','{"symptom_category":"MILD_HEADACHE","allowed_interim_actions":["Synthetic approved action"],"red_flags":["Synthetic warning"],"prohibited_actions":["Synthetic prohibited action"],"escalation_message":"Synthetic escalation","disclaimer":"Not diagnosis or prescription","language":"en","disposition":"GUIDANCE","library_version":"safe-care-development-v1"}') $$,'service role records guidance immediately after completed intake');
select is((select count(*) from public.safe_care_guidance_results),1::bigint,'one idempotent guidance row is stored');
select lives_ok($$ select public.record_safe_care_guidance('1b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000001','{"symptom_category":"MILD_HEADACHE","allowed_interim_actions":["Synthetic approved action"],"red_flags":["Synthetic warning"],"prohibited_actions":["Synthetic prohibited action"],"escalation_message":"Synthetic escalation","disclaimer":"Not diagnosis or prescription","language":"en","disposition":"GUIDANCE","library_version":"safe-care-development-v1"}') $$,'repeated generation is idempotent');
select is((select count(*) from public.safe_care_guidance_results),1::bigint,'repeated generation does not duplicate guidance');

reset role; set local role authenticated; set local request.jwt.claim.sub='1b000000-0000-4000-8000-000000000001';
select is((select count(*) from public.safe_care_guidance_results),1::bigint,'patient reads own guidance');
reset role; set local role authenticated; set local request.jwt.claim.sub='1b000000-0000-4000-8000-000000000003';
select is((select count(*) from public.safe_care_guidance_results),0::bigint,'other patient cannot read guidance');
reset role; set local role authenticated; set local request.jwt.claim.sub='1b000000-0000-4000-8000-000000000002';
select is((select count(*) from public.safe_care_guidance_results),0::bigint,'doctor cannot browse patient guidance globally');

reset role;
insert into public.triage_results(intake_session_id,rule_set_version,outcome,matched_rule_codes) values('7b000000-0000-4000-8000-000000000001','synthetic-rules-v1','RED_FLAG',array['SEVERE_TRAUMA']);
set local role service_role;
select throws_ok($$ select public.record_safe_care_guidance('1b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000001','{"symptom_category":"MILD_HEADACHE","allowed_interim_actions":["Unsafe normal action"],"red_flags":["Synthetic warning"],"prohibited_actions":["Synthetic prohibited action"],"escalation_message":"Synthetic escalation","disclaimer":"Not diagnosis","language":"en","disposition":"GUIDANCE","library_version":"safe-care-development-v1"}') $$,'42501','Safe care guidance is unavailable','red flag rejects normal guidance persistence');
select is((select count(*) from public.audit_events where action='safe_care_guidance_recorded' and target_type='safe_care_guidance'),2::bigint,'successful idempotent records create content-free audit events');

select * from finish(); rollback;
