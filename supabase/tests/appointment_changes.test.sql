begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('1e000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','change-patient@example.invalid','',now(),'{}','{}',now(),now()),
('1e000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','change-other@example.invalid','',now(),'{}','{}',now(),now()),
('1e000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','change-doctor@example.invalid','',now(),'{}','{}',now(),now());
delete from public.profiles where auth_user_id in ('1e000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000002','1e000000-0000-4000-8000-000000000003');
insert into public.profiles(id,auth_user_id,role,display_name) values
('2e000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000001','patient','Synthetic Change Patient'),
('2e000000-0000-4000-8000-000000000002','1e000000-0000-4000-8000-000000000002','patient','Synthetic Other Patient'),
('2e000000-0000-4000-8000-000000000003','1e000000-0000-4000-8000-000000000003','doctor','Synthetic Change Doctor');
insert into public.patients(id,profile_id,preferred_language,date_of_birth,city,onboarding_completed_at) values
('3e000000-0000-4000-8000-000000000001','2e000000-0000-4000-8000-000000000001','en','1990-01-01','Synthetic City',now()),
('3e000000-0000-4000-8000-000000000002','2e000000-0000-4000-8000-000000000002','en','1990-01-01','Synthetic City',now());
insert into public.doctors(id,profile_id,status,full_name,qualification,registration_number,registration_council,registration_state,specialty,languages,onboarding_completed_at,is_bookable,verification_reason,verification_decided_at,verification_decided_by) values
('4e000000-0000-4000-8000-000000000003','2e000000-0000-4000-8000-000000000003','verified','Dr Synthetic Change','Synthetic Qualification','CHANGE-001','Synthetic Council','Synthetic State','GENERAL_MEDICINE',array['en']::public.doctor_language[],now(),true,'Synthetic approval',now(),'1e000000-0000-4000-8000-000000000003');
insert into public.doctor_availability(id,doctor_id,starts_at,ends_at) values
('5e000000-0000-4000-8000-000000000001','4e000000-0000-4000-8000-000000000003',now()+interval '10 days',now()+interval '10 days 30 minutes'),
('5e000000-0000-4000-8000-000000000002','4e000000-0000-4000-8000-000000000003',now()+interval '11 days',now()+interval '11 days 30 minutes'),
('5e000000-0000-4000-8000-000000000003','4e000000-0000-4000-8000-000000000003',now()+interval '12 days',now()+interval '12 days 30 minutes'),
('5e000000-0000-4000-8000-000000000004','4e000000-0000-4000-8000-000000000003',now()+interval '13 days',now()+interval '13 days 30 minutes'),
('5e000000-0000-4000-8000-000000000005','4e000000-0000-4000-8000-000000000003',now()-interval '1 day',now()-interval '1 day'+interval '30 minutes');
insert into public.appointments(id,doctor_availability_id,doctor_id,patient_id,starts_at,ends_at,status,fee_paise)
select fixture.id,a.id,a.doctor_id,fixture.patient_id,a.starts_at,a.ends_at,fixture.status,90000
from (values
('6e000000-0000-4000-8000-000000000001'::uuid,'5e000000-0000-4000-8000-000000000001'::uuid,'3e000000-0000-4000-8000-000000000001'::uuid,'REQUESTED'::public.appointment_status),
('6e000000-0000-4000-8000-000000000002'::uuid,'5e000000-0000-4000-8000-000000000002'::uuid,'3e000000-0000-4000-8000-000000000001'::uuid,'CONFIRMED'::public.appointment_status),
('6e000000-0000-4000-8000-000000000004'::uuid,'5e000000-0000-4000-8000-000000000004'::uuid,'3e000000-0000-4000-8000-000000000001'::uuid,'REQUESTED'::public.appointment_status),
('6e000000-0000-4000-8000-000000000005'::uuid,'5e000000-0000-4000-8000-000000000005'::uuid,'3e000000-0000-4000-8000-000000000001'::uuid,'COMPLETED'::public.appointment_status)
) fixture(id,availability_id,patient_id,status) join public.doctor_availability a on a.id=fixture.availability_id;

select ok((select relrowsecurity from pg_class where oid='public.appointment_schedule_changes'::regclass),'schedule changes have RLS enabled');
select has_function('public','cancel_appointment',array['uuid','appointment_change_reason'],'cancel function exists');
select has_function('public','reschedule_appointment',array['uuid','uuid','appointment_change_reason'],'reschedule function exists');

set local role authenticated;
set local request.jwt.claim.sub='1e000000-0000-4000-8000-000000000001';
select lives_ok($$ select public.cancel_appointment('6e000000-0000-4000-8000-000000000001','PATIENT_SCHEDULE_CONFLICT') $$,'patient cancels own requested appointment');
select is((select status::text from public.appointments where id='6e000000-0000-4000-8000-000000000001'),'CANCELLED','cancelled status is persisted');
select is((select reason_category::text from public.appointment_schedule_changes where source_appointment_id='6e000000-0000-4000-8000-000000000001'),'PATIENT_SCHEDULE_CONFLICT','controlled reason is persisted');
select throws_ok($$ select public.transition_appointment_status('6e000000-0000-4000-8000-000000000004','CANCELLED') $$,'42501','Appointment transition is unavailable','generic transition cannot bypass cancellation workflow');
select throws_ok($$ select public.cancel_appointment('6e000000-0000-4000-8000-000000000004','DOCTOR_UNAVAILABLE') $$,'42501','Appointment cancellation is unavailable','patient cannot use doctor-only reason');
select is((select count(*) from public.list_appointment_reschedule_options('6e000000-0000-4000-8000-000000000002')),2::bigint,'participant sees only available future replacement slots');
select lives_ok($$ select public.reschedule_appointment('6e000000-0000-4000-8000-000000000002','5e000000-0000-4000-8000-000000000003','OTHER') $$,'patient reschedules own confirmed appointment');
select is((select status::text from public.appointments where id='6e000000-0000-4000-8000-000000000002'),'CANCELLED','reschedule preserves original as cancelled');
select is((select status::text from public.appointments where doctor_availability_id='5e000000-0000-4000-8000-000000000003'),'REQUESTED','replacement requires confirmation');
select is((select fee_paise from public.appointments where doctor_availability_id='5e000000-0000-4000-8000-000000000003'),90000,'server preserves authoritative price');
select throws_ok($$ select public.cancel_appointment('6e000000-0000-4000-8000-000000000005','OTHER') $$,'42501','Appointment cancellation is unavailable','completed appointment cannot change');

set local request.jwt.claim.sub='1e000000-0000-4000-8000-000000000002';
select throws_ok($$ select public.cancel_appointment('6e000000-0000-4000-8000-000000000004','OTHER') $$,'42501','Appointment cancellation is unavailable','other patient cannot cancel appointment');
select is((select count(*) from public.appointment_schedule_changes),0::bigint,'other patient cannot browse schedule changes');

reset role;
select is((select count(*) from public.audit_events where action in ('appointment_cancelled','appointment_rescheduled')),2::bigint,'each successful change has one audit event');
select * from finish();
rollback;
