begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('1c000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','history-patient@example.invalid','',now(),'{}','{}',now(),now()),
('1c000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','history-doctor@example.invalid','',now(),'{}','{}',now(),now()),
('1c000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','history-other@example.invalid','',now(),'{}','{}',now(),now());
delete from public.profiles where auth_user_id in (
  '1c000000-0000-4000-8000-000000000001','1c000000-0000-4000-8000-000000000002','1c000000-0000-4000-8000-000000000003'
);
insert into public.profiles(id,auth_user_id,role,display_name) values
('2c000000-0000-4000-8000-000000000001','1c000000-0000-4000-8000-000000000001','patient','Synthetic History Patient'),
('2c000000-0000-4000-8000-000000000002','1c000000-0000-4000-8000-000000000002','doctor','Synthetic History Doctor'),
('2c000000-0000-4000-8000-000000000003','1c000000-0000-4000-8000-000000000003','patient','Synthetic Other Patient');
insert into public.patients(id,profile_id,preferred_language,date_of_birth,city,onboarding_completed_at) values
('3c000000-0000-4000-8000-000000000001','2c000000-0000-4000-8000-000000000001','en','1990-01-01','Synthetic City',now()),
('3c000000-0000-4000-8000-000000000003','2c000000-0000-4000-8000-000000000003','en','1990-01-01','Synthetic City',now());
insert into public.doctors(
  id,profile_id,status,full_name,qualification,registration_number,registration_council,
  registration_state,specialty,languages,onboarding_completed_at,is_bookable,
  verification_reason,verification_decided_at,verification_decided_by
) values (
  '4c000000-0000-4000-8000-000000000002','2c000000-0000-4000-8000-000000000002','verified',
  'Dr Synthetic History','Synthetic Qualification','HISTORY-001','Synthetic Council',
  'Synthetic State','GENERAL_MEDICINE',array['en']::public.doctor_language[],now(),true,
  'Synthetic approval',now(),'1c000000-0000-4000-8000-000000000002'
);

insert into public.doctor_availability(id,doctor_id,starts_at,ends_at) values
('5c000000-0000-4000-8000-000000000001','4c000000-0000-4000-8000-000000000002',now()-interval '3 days',now()-interval '3 days'+interval '30 minutes'),
('5c000000-0000-4000-8000-000000000002','4c000000-0000-4000-8000-000000000002',now()-interval '2 days',now()-interval '2 days'+interval '30 minutes'),
('5c000000-0000-4000-8000-000000000003','4c000000-0000-4000-8000-000000000002',now()+interval '3 days',now()+interval '3 days'+interval '30 minutes');
insert into public.appointments(id,doctor_availability_id,doctor_id,patient_id,starts_at,ends_at,status)
select fixtures.appointment_id,availability.id,availability.doctor_id,'3c000000-0000-4000-8000-000000000001',availability.starts_at,availability.ends_at,fixtures.status
from (values
  ('6c000000-0000-4000-8000-000000000001'::uuid,'5c000000-0000-4000-8000-000000000001'::uuid,'COMPLETED'::public.appointment_status),
  ('6c000000-0000-4000-8000-000000000002'::uuid,'5c000000-0000-4000-8000-000000000002'::uuid,'CANCELLED'::public.appointment_status),
  ('6c000000-0000-4000-8000-000000000003'::uuid,'5c000000-0000-4000-8000-000000000003'::uuid,'CONFIRMED'::public.appointment_status)
) fixtures(appointment_id,availability_id,status)
join public.doctor_availability availability on availability.id=fixtures.availability_id;

insert into public.consultations(
  id,appointment_id,doctor_id,patient_id,subjective_history,examination_observations,
  assessment,plan,telemedicine_adequacy,status,finalized_at,finalized_by_doctor_id
) values (
  '7c000000-0000-4000-8000-000000000001','6c000000-0000-4000-8000-000000000001',
  '4c000000-0000-4000-8000-000000000002','3c000000-0000-4000-8000-000000000001',
  'Synthetic history','Synthetic limitation','Synthetic assessment','Synthetic plan',
  'ADEQUATE','FINALIZED',now()-interval '3 days','4c000000-0000-4000-8000-000000000002'
);
insert into public.consultation_outcomes(
  id,consultation_id,appointment_id,patient_id,doctor_id,outcome,recorded_by_doctor_id
) values (
  '8c000000-0000-4000-8000-000000000001','7c000000-0000-4000-8000-000000000001',
  '6c000000-0000-4000-8000-000000000001','3c000000-0000-4000-8000-000000000001',
  '4c000000-0000-4000-8000-000000000002','TELECONSULT_COMPLETED','4c000000-0000-4000-8000-000000000002'
);
insert into public.prescriptions(
  id,appointment_id,consultation_id,patient_id,doctor_id,doctor_name,doctor_registration_number,
  doctor_registration_council,doctor_registration_state,status,finalized_at,finalized_by_doctor_id
) values (
  '9c000000-0000-4000-8000-000000000001','6c000000-0000-4000-8000-000000000001',
  '7c000000-0000-4000-8000-000000000001','3c000000-0000-4000-8000-000000000001',
  '4c000000-0000-4000-8000-000000000002','Dr Synthetic History','HISTORY-001',
  'Synthetic Council','Synthetic State','DRAFT',null,null
);
insert into public.prescription_items(id,prescription_id,item_type,item_name,sort_order)
values('9d000000-0000-4000-8000-000000000001','9c000000-0000-4000-8000-000000000001','INSTRUCTION','Synthetic instruction',0);
update public.prescriptions set status='FINAL',finalized_at=now()-interval '3 days',
  finalized_by_doctor_id='4c000000-0000-4000-8000-000000000002'
where id='9c000000-0000-4000-8000-000000000001';
insert into public.documents(
  id,appointment_id,patient_id,object_path,original_filename,mime_type,file_extension,size_bytes
) values (
  '9e000000-0000-4000-8000-000000000001','6c000000-0000-4000-8000-000000000001',
  '3c000000-0000-4000-8000-000000000001','synthetic/history-document.pdf','synthetic-history.pdf',
  'application/pdf','pdf',1024
);

select has_function('public','list_patient_history',array['integer','integer'],'patient history function exists');
select function_returns('public','list_patient_history',array['integer','integer'],'setof record','patient history returns records');

set local role authenticated;
set local request.jwt.claim.sub='1c000000-0000-4000-8000-000000000001';
select is((select count(*) from public.list_patient_history(10,0)),2::bigint,'patient sees only two past or terminal appointments');
select is((select count(*) from public.list_patient_history(1,0)),1::bigint,'page limit is enforced');
select is((select total_count from public.list_patient_history(1,1)),2::bigint,'history includes total count for pagination');
select is((select consultation_outcome->>'outcome' from public.list_patient_history(10,0) where appointment_id='6c000000-0000-4000-8000-000000000001'),'TELECONSULT_COMPLETED','patient sees consultation outcome');
select is((select finalized_prescription->'items'->0->>'item_name' from public.list_patient_history(10,0) where appointment_id='6c000000-0000-4000-8000-000000000001'),'Synthetic instruction','patient sees finalized prescription items');
select ok(not (select uploaded_documents->0 ? 'object_path' from public.list_patient_history(10,0) where appointment_id='6c000000-0000-4000-8000-000000000001'),'history never returns private storage paths');

set local request.jwt.claim.sub='1c000000-0000-4000-8000-000000000003';
select is((select count(*) from public.list_patient_history(10,0)),0::bigint,'other patient cannot see history');
set local request.jwt.claim.sub='1c000000-0000-4000-8000-000000000002';
select throws_ok($$ select * from public.list_patient_history(10,0) $$,'42501','Patient history is unavailable','doctor cannot use patient history');

set local request.jwt.claim.sub='1c000000-0000-4000-8000-000000000001';
select lives_ok($$ select public.audit_patient_consultation_packet('6c000000-0000-4000-8000-000000000001') $$,'owning patient can authorize finalized consultation packet');
set local request.jwt.claim.sub='1c000000-0000-4000-8000-000000000003';
select throws_ok($$ select public.audit_patient_consultation_packet('6c000000-0000-4000-8000-000000000001') $$,'42501','Consultation packet is unavailable','other patient cannot authorize packet');
set local request.jwt.claim.sub='1c000000-0000-4000-8000-000000000002';
select throws_ok($$ select public.audit_patient_consultation_packet('6c000000-0000-4000-8000-000000000001') $$,'42501','Consultation packet is unavailable','doctor cannot use patient packet authorization');

reset role;
select ok((select count(*) from public.audit_events where action='patient_history_viewed' and target_type='patient')>=1,'history access creates content-free audit event');
select is((select count(*) from public.audit_events where action='patient_consultation_packet_downloaded' and target_type='appointment'),1::bigint,'packet authorization creates one content-free audit event');

select * from finish();
rollback;
