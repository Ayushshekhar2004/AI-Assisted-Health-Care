begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('1f000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','idor-patient-a@example.invalid','',now(),'{}','{}',now(),now()),
('1f000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','idor-patient-b@example.invalid','',now(),'{}','{}',now(),now()),
('1f000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','idor-doctor-a@example.invalid','',now(),'{}','{}',now(),now()),
('1f000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','idor-doctor-b@example.invalid','',now(),'{}','{}',now(),now()),
('1f000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','idor-operations@example.invalid','',now(),'{}','{}',now(),now());

delete from public.profiles where auth_user_id in (
'1f000000-0000-4000-8000-000000000001','1f000000-0000-4000-8000-000000000002',
'1f000000-0000-4000-8000-000000000003','1f000000-0000-4000-8000-000000000004',
'1f000000-0000-4000-8000-000000000005');
insert into public.profiles(id,auth_user_id,role,display_name) values
('2f000000-0000-4000-8000-000000000001','1f000000-0000-4000-8000-000000000001','patient','Synthetic IDOR Patient A'),
('2f000000-0000-4000-8000-000000000002','1f000000-0000-4000-8000-000000000002','patient','Synthetic IDOR Patient B'),
('2f000000-0000-4000-8000-000000000003','1f000000-0000-4000-8000-000000000003','doctor','Synthetic IDOR Doctor A'),
('2f000000-0000-4000-8000-000000000004','1f000000-0000-4000-8000-000000000004','doctor','Synthetic IDOR Doctor B'),
('2f000000-0000-4000-8000-000000000005','1f000000-0000-4000-8000-000000000005','operations','Synthetic IDOR Operations');
insert into public.patients(id,profile_id,preferred_language) values
('3f000000-0000-4000-8000-000000000001','2f000000-0000-4000-8000-000000000001','en'),
('3f000000-0000-4000-8000-000000000002','2f000000-0000-4000-8000-000000000002','en');
insert into public.doctors(id,profile_id,status,full_name,registration_number,registration_council,registration_state,verification_reason,verification_decided_at,verification_decided_by) values
('4f000000-0000-4000-8000-000000000003','2f000000-0000-4000-8000-000000000003','verified','Synthetic IDOR Doctor A','IDOR-A','Synthetic Council','Synthetic State','Synthetic approval',now(),'1f000000-0000-4000-8000-000000000005'),
('4f000000-0000-4000-8000-000000000004','2f000000-0000-4000-8000-000000000004','verified','Synthetic IDOR Doctor B','IDOR-B','Synthetic Council','Synthetic State','Synthetic approval',now(),'1f000000-0000-4000-8000-000000000005');
insert into public.doctor_availability(id,doctor_id,starts_at,ends_at) values
('5f000000-0000-4000-8000-000000000001','4f000000-0000-4000-8000-000000000003',now()+interval '1 day',now()+interval '1 day 30 minutes');
insert into public.appointments(id,doctor_availability_id,doctor_id,patient_id,starts_at,ends_at,status)
select '6f000000-0000-4000-8000-000000000001',id,doctor_id,'3f000000-0000-4000-8000-000000000001',starts_at,ends_at,'IN_PROGRESS'
from public.doctor_availability where id='5f000000-0000-4000-8000-000000000001';
insert into public.consultations(id,appointment_id,doctor_id,patient_id,subjective_history,examination_observations,assessment,plan,status)
values('7f000000-0000-4000-8000-000000000001','6f000000-0000-4000-8000-000000000001','4f000000-0000-4000-8000-000000000003','3f000000-0000-4000-8000-000000000001','Synthetic history','Synthetic limitations','Synthetic assessment','Synthetic plan','DRAFT');
insert into public.prescriptions(id,appointment_id,consultation_id,patient_id,doctor_id,doctor_name,doctor_registration_number,doctor_registration_council,doctor_registration_state,status)
values('8f000000-0000-4000-8000-000000000001','6f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000001','3f000000-0000-4000-8000-000000000001','4f000000-0000-4000-8000-000000000003','Synthetic IDOR Doctor A','IDOR-A','Synthetic Council','Synthetic State','DRAFT');
insert into public.documents(id,appointment_id,patient_id,object_path,original_filename,mime_type,file_extension,size_bytes,scan_status,scan_provider,scanned_at)
values('9f000000-0000-4000-8000-000000000001','6f000000-0000-4000-8000-000000000001','3f000000-0000-4000-8000-000000000001','1f000000-0000-4000-8000-000000000001/9f000000-0000-4000-8000-000000000001.pdf','synthetic-idor.pdf','application/pdf','pdf',128,'CLEAN','synthetic-scanner',now());

set local role authenticated;
set local request.jwt.claim.sub='1f000000-0000-4000-8000-000000000002';
select is((select count(*) from public.profiles where id='2f000000-0000-4000-8000-000000000001'),0::bigint,'patient cannot read another patient profile by ID');
select is((select count(*) from public.patients where id='3f000000-0000-4000-8000-000000000001'),0::bigint,'patient cannot read another patient record by ID');
select is((select count(*) from public.appointments where id='6f000000-0000-4000-8000-000000000001'),0::bigint,'patient cannot read another patient appointment by ID');
select is((select count(*) from public.consultations where id='7f000000-0000-4000-8000-000000000001'),0::bigint,'patient cannot read another patient consultation by ID');
select is((select count(*) from public.prescriptions where id='8f000000-0000-4000-8000-000000000001'),0::bigint,'patient cannot read another patient prescription by ID');
select is((select count(*) from public.documents where id='9f000000-0000-4000-8000-000000000001'),0::bigint,'patient cannot read another patient document by ID');
select is((select count(*) from public.get_own_consultation('6f000000-0000-4000-8000-000000000001')),0::bigint,'patient consultation route discloses no row for another patient appointment ID');
select is((select count(*) from public.get_own_prescription('6f000000-0000-4000-8000-000000000001')),0::bigint,'patient prescription route discloses no row for another patient appointment ID');
select throws_ok($$select * from public.authorize_patient_document_download('9f000000-0000-4000-8000-000000000001')$$,'42501','Document is unavailable','patient document route rejects another patient document ID');
select throws_ok($$select public.cancel_appointment('6f000000-0000-4000-8000-000000000001','OTHER')$$,'42501','Appointment cancellation is unavailable','patient cannot cancel another patient appointment');
select throws_ok($$select public.transition_appointment_status('6f000000-0000-4000-8000-000000000001','COMPLETED')$$,'42501','Appointment transition is unavailable','patient cannot force a privileged appointment transition');

set local request.jwt.claim.sub='1f000000-0000-4000-8000-000000000004';
select is((select count(*) from public.profiles where id='2f000000-0000-4000-8000-000000000001'),0::bigint,'unassigned doctor cannot browse patient profiles by ID');
select is((select count(*) from public.patients where id='3f000000-0000-4000-8000-000000000001'),0::bigint,'unassigned doctor cannot browse patient records by ID');
select is((select count(*) from public.appointments where id='6f000000-0000-4000-8000-000000000001'),0::bigint,'unassigned doctor cannot read appointment by ID');
select is((select count(*) from public.consultations where id='7f000000-0000-4000-8000-000000000001'),0::bigint,'unassigned doctor cannot read consultation by ID');
select is((select count(*) from public.prescriptions where id='8f000000-0000-4000-8000-000000000001'),0::bigint,'unassigned doctor cannot read prescription by ID');
select is((select count(*) from public.documents where id='9f000000-0000-4000-8000-000000000001'),0::bigint,'unassigned doctor cannot read document metadata by ID');
select throws_ok($$select * from public.get_doctor_appointment_detail('6f000000-0000-4000-8000-000000000001')$$,'42501','Appointment detail is unavailable','doctor detail route rejects an unassigned appointment ID');
select throws_ok($$select public.save_consultation_draft('6f000000-0000-4000-8000-000000000001','','','','','',null)$$,'42501','Consultation note is unavailable','unassigned doctor cannot mutate consultation');
select throws_ok($$select public.write_prescription('6f000000-0000-4000-8000-000000000001','','[]'::jsonb,false)$$,'42501','Prescription is unavailable','unassigned doctor cannot mutate prescription');
select throws_ok($$select * from public.authorize_doctor_document_download('9f000000-0000-4000-8000-000000000001')$$,'42501','Document is unavailable','doctor document route rejects an unassigned document ID');
select throws_ok($$select public.transition_appointment_status('6f000000-0000-4000-8000-000000000001','COMPLETED')$$,'42501','Appointment transition is unavailable','unassigned doctor cannot transition appointment');

set local request.jwt.claim.sub='1f000000-0000-4000-8000-000000000005';
select is((select count(*) from public.appointments where id='6f000000-0000-4000-8000-000000000001'),0::bigint,'operations role has no implicit appointment access');
select is((select count(*) from public.consultations where id='7f000000-0000-4000-8000-000000000001'),0::bigint,'operations role has no implicit consultation access');
select is((select count(*) from public.prescriptions where id='8f000000-0000-4000-8000-000000000001'),0::bigint,'operations role has no implicit prescription access');
select is((select count(*) from public.documents where id='9f000000-0000-4000-8000-000000000001'),0::bigint,'operations role has no implicit document access');

set local request.jwt.claim.sub='1f000000-0000-4000-8000-000000000003';
select is((select count(*) from public.appointments where id='6f000000-0000-4000-8000-000000000001'),1::bigint,'assigned doctor can read own appointment');
select is((select count(*) from public.consultations where id='7f000000-0000-4000-8000-000000000001'),1::bigint,'assigned verified doctor can read consultation');
select is((select count(*) from public.prescriptions where id='8f000000-0000-4000-8000-000000000001'),1::bigint,'assigned verified doctor can read prescription');
select is((select count(*) from public.documents where id='9f000000-0000-4000-8000-000000000001'),1::bigint,'assigned verified doctor can read clean document metadata');

select * from finish();
rollback;
