begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('1f000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','follow-patient@example.invalid','',now(),'{}','{}',now(),now()),
('1f000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','follow-other@example.invalid','',now(),'{}','{}',now(),now()),
('1f000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','follow-doctor@example.invalid','',now(),'{}','{}',now(),now());
delete from public.profiles where auth_user_id in ('1f000000-0000-4000-8000-000000000001','1f000000-0000-4000-8000-000000000002','1f000000-0000-4000-8000-000000000003');
insert into public.profiles(id,auth_user_id,role,display_name) values
('2f000000-0000-4000-8000-000000000001','1f000000-0000-4000-8000-000000000001','patient','Synthetic Follow Patient'),
('2f000000-0000-4000-8000-000000000002','1f000000-0000-4000-8000-000000000002','patient','Synthetic Other Patient'),
('2f000000-0000-4000-8000-000000000003','1f000000-0000-4000-8000-000000000003','doctor','Synthetic Follow Doctor');
insert into public.patients(id,profile_id,preferred_language,date_of_birth,city,onboarding_completed_at) values
('3f000000-0000-4000-8000-000000000001','2f000000-0000-4000-8000-000000000001','en','1990-01-01','Synthetic City',now()),
('3f000000-0000-4000-8000-000000000002','2f000000-0000-4000-8000-000000000002','en','1990-01-01','Synthetic City',now());
insert into public.doctors(id,profile_id,status,full_name,qualification,registration_number,registration_council,registration_state,specialty,languages,teleconsultation_fee_paise,onboarding_completed_at,is_bookable,verification_reason,verification_decided_at,verification_decided_by) values
('4f000000-0000-4000-8000-000000000003','2f000000-0000-4000-8000-000000000003','verified','Dr Synthetic Follow','Synthetic Qualification','FOLLOW-001','Synthetic Council','Synthetic State','GENERAL_MEDICINE',array['en']::public.doctor_language[],88000,now(),true,'Synthetic approval',now(),'1f000000-0000-4000-8000-000000000003');
insert into public.intake_sessions(id,patient_id,status) values
('5f000000-0000-4000-8000-000000000001','3f000000-0000-4000-8000-000000000001','ACTIVE');
insert into public.doctor_availability(id,doctor_id,starts_at,ends_at) values
('6f000000-0000-4000-8000-000000000001','4f000000-0000-4000-8000-000000000003',now()-interval '2 days',now()-interval '2 days'+interval '30 minutes'),
('6f000000-0000-4000-8000-000000000002','4f000000-0000-4000-8000-000000000003',now()+interval '7 days',now()+interval '7 days 30 minutes');
insert into public.appointments(id,doctor_availability_id,doctor_id,patient_id,starts_at,ends_at,status,intake_session_id)
select '7f000000-0000-4000-8000-000000000001',id,doctor_id,'3f000000-0000-4000-8000-000000000001',starts_at,ends_at,'COMPLETED','5f000000-0000-4000-8000-000000000001'
from public.doctor_availability where id='6f000000-0000-4000-8000-000000000001';
insert into public.consultations(id,appointment_id,doctor_id,patient_id,subjective_history,examination_observations,assessment,plan,follow_up,telemedicine_adequacy,status,finalized_at,finalized_by_doctor_id) values
('8f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000001','4f000000-0000-4000-8000-000000000003','3f000000-0000-4000-8000-000000000001','Synthetic history','Synthetic remote observation','Synthetic assessment','Synthetic plan','Synthetic follow-up','ADEQUATE','FINALIZED',now(),'4f000000-0000-4000-8000-000000000003');
insert into public.consultation_outcomes(id,consultation_id,appointment_id,patient_id,doctor_id,outcome,recorded_by_doctor_id) values
('9f000000-0000-4000-8000-000000000001','8f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000001','3f000000-0000-4000-8000-000000000001','4f000000-0000-4000-8000-000000000003','FOLLOW_UP_REQUIRED','4f000000-0000-4000-8000-000000000003');

select ok((select relrowsecurity from pg_class where oid='public.follow_up_recommendations'::regclass),'follow-up recommendations have RLS');
select has_function('public','create_follow_up_recommendation',array['uuid','follow_up_timing'],'doctor recommendation function exists');
select has_function('public','book_follow_up_appointment',array['uuid','uuid'],'patient booking function exists');

set local role authenticated;
set local request.jwt.claim.sub='1f000000-0000-4000-8000-000000000001';
select throws_ok($$select public.create_follow_up_recommendation('7f000000-0000-4000-8000-000000000001','WITHIN_7_DAYS')$$,'42501','Follow-up recommendation is unavailable','patient cannot create recommendation');
set local request.jwt.claim.sub='1f000000-0000-4000-8000-000000000003';
select lives_ok($$select public.create_follow_up_recommendation('7f000000-0000-4000-8000-000000000001','WITHIN_14_DAYS')$$,'assigned verified doctor creates recommendation');
select is((select timing::text from public.follow_up_recommendations where source_appointment_id='7f000000-0000-4000-8000-000000000001'),'WITHIN_14_DAYS','controlled timing is stored');
select throws_ok($$select public.create_follow_up_recommendation('7f000000-0000-4000-8000-000000000001','WITHIN_30_DAYS')$$,'23505',null,'recommendation cannot be silently replaced');

set local request.jwt.claim.sub='1f000000-0000-4000-8000-000000000002';
select is((select count(*) from public.follow_up_recommendations),0::bigint,'other patient cannot browse recommendation');
select throws_ok($$select public.book_follow_up_appointment((select id from public.follow_up_recommendations limit 1),'6f000000-0000-4000-8000-000000000002')$$,'42501','Follow-up booking is unavailable','other patient cannot book recommendation');

set local request.jwt.claim.sub='1f000000-0000-4000-8000-000000000001';
select is((select count(*) from public.list_follow_up_booking_options((select id from public.follow_up_recommendations limit 1))),1::bigint,'owning patient sees assigned doctor available slot');
select lives_ok($$select public.book_follow_up_appointment((select id from public.follow_up_recommendations limit 1),'6f000000-0000-4000-8000-000000000002')$$,'patient requests follow-up appointment');
select is((select status::text from public.appointments where follow_up_recommendation_id is not null),'REQUESTED','follow-up requires doctor confirmation');
select is((select intake_session_id from public.appointments where follow_up_recommendation_id is not null),null::uuid,'prior intake is not copied');
select is((select count(*) from public.prescriptions where appointment_id=(select id from public.appointments where follow_up_recommendation_id is not null)),0::bigint,'prescription is not copied');
select throws_ok($$select public.book_follow_up_appointment((select id from public.follow_up_recommendations limit 1),'6f000000-0000-4000-8000-000000000002')$$,'42501','Follow-up booking is unavailable','recommendation cannot create duplicate booking');

reset role;
select is((select count(*) from public.audit_events where action in ('follow_up_recommended','follow_up_appointment_requested')),2::bigint,'recommendation and booking have content-free audit events');
select * from finish();
rollback;
