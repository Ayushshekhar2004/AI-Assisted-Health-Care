begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('1a000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','document-patient@example.invalid','',now(),'{}','{}',now(),now()),
('1a000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','document-other@example.invalid','',now(),'{}','{}',now(),now()),
('1a000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','document-doctor@example.invalid','',now(),'{}','{}',now(),now()),
('1a000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','document-unassigned@example.invalid','',now(),'{}','{}',now(),now());
delete from public.profiles where auth_user_id in ('1a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000002','1a000000-0000-4000-8000-000000000003','1a000000-0000-4000-8000-000000000004');
insert into public.profiles(id,auth_user_id,role,display_name) values
('2a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000001','patient','Synthetic Document Patient'),
('2a000000-0000-4000-8000-000000000002','1a000000-0000-4000-8000-000000000002','patient','Synthetic Other Patient'),
('2a000000-0000-4000-8000-000000000003','1a000000-0000-4000-8000-000000000003','doctor','Synthetic Document Doctor'),
('2a000000-0000-4000-8000-000000000004','1a000000-0000-4000-8000-000000000004','doctor','Synthetic Unassigned Doctor');
insert into public.patients(id,profile_id,preferred_language) values
('3a000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000001','en'),
('3a000000-0000-4000-8000-000000000002','2a000000-0000-4000-8000-000000000002','en');
insert into public.doctors(id,profile_id,status,verification_reason,verification_decided_at,verification_decided_by) values
('5a000000-0000-4000-8000-000000000003','2a000000-0000-4000-8000-000000000003','verified','Synthetic approval',now(),'1a000000-0000-4000-8000-000000000003'),
('5a000000-0000-4000-8000-000000000004','2a000000-0000-4000-8000-000000000004','verified','Synthetic approval',now(),'1a000000-0000-4000-8000-000000000004');
insert into public.doctor_availability(id,doctor_id,starts_at,ends_at) values
('6a000000-0000-4000-8000-000000000001','5a000000-0000-4000-8000-000000000003',now()+interval '1 day',now()+interval '1 day 30 minutes');
insert into public.appointments(id,doctor_availability_id,doctor_id,patient_id,starts_at,ends_at,status)
select '8a000000-0000-4000-8000-000000000001',id,doctor_id,'3a000000-0000-4000-8000-000000000001',starts_at,ends_at,'CONFIRMED'
from public.doctor_availability where id='6a000000-0000-4000-8000-000000000001';

select has_table('public','documents','documents table exists');
select is((select public from storage.buckets where id='patient-documents'),false,'patient document bucket is private');
select is((select file_size_limit from storage.buckets where id='patient-documents'),10485760::bigint,'bucket enforces 10 MB limit');
select has_function('public','register_patient_document',array['uuid','uuid','text','text','text','text','bigint'],'registration function exists');
select has_function('public','authorize_patient_document_download',array['uuid'],'download authorization exists');
select has_function('public','list_assigned_appointment_documents',array['uuid'],'assigned doctor list function exists');
select has_function('public','authorize_doctor_document_download',array['uuid'],'doctor download authorization exists');

set local role anon;
select throws_ok($$select public.register_patient_document('4a000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000001','','','','',1)$$,'42501','permission denied for function register_patient_document','anonymous cannot register documents');

reset role; set local role authenticated; set local request.jwt.claim.sub='1a000000-0000-4000-8000-000000000001';
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values(
  'patient-documents','1a000000-0000-4000-8000-000000000001/4a000000-0000-4000-8000-000000000001.pdf',
  '1a000000-0000-4000-8000-000000000001','{"size":100,"mimetype":"application/pdf"}')$$,'patient uploads only to own private folder');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values(
  'patient-documents','1a000000-0000-4000-8000-000000000002/4a000000-0000-4000-8000-000000000002.pdf',
  '1a000000-0000-4000-8000-000000000001','{"size":100,"mimetype":"application/pdf"}')$$,'42501',null,'patient cannot upload into another user folder');
select throws_ok($$select public.register_patient_document('4a000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000001/4a000000-0000-4000-8000-000000000001.pdf','synthetic.pdf','image/png','png',100)$$,'42501','Document registration is unavailable','database verifies storage metadata before registration');
select is(public.register_patient_document(
  '4a000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000001',
  '1a000000-0000-4000-8000-000000000001/4a000000-0000-4000-8000-000000000001.pdf',
  'synthetic-report.pdf','application/pdf','pdf',100),
  '4a000000-0000-4000-8000-000000000001'::uuid,'patient registers appointment-owned document');
select is((select count(*) from public.documents),1::bigint,'patient reads own metadata through RLS');
select is((select count(*) from public.list_own_patient_documents('8a000000-0000-4000-8000-000000000001')),1::bigint,'patient lists appointment documents');
select is((select object_path from public.authorize_patient_document_download('4a000000-0000-4000-8000-000000000001')),
  '1a000000-0000-4000-8000-000000000001/4a000000-0000-4000-8000-000000000001.pdf','patient authorizes own download path');

reset role; set local role authenticated; set local request.jwt.claim.sub='1a000000-0000-4000-8000-000000000002';
select is((select count(*) from public.documents),0::bigint,'other patient cannot read metadata');
select throws_ok($$select * from public.authorize_patient_document_download('4a000000-0000-4000-8000-000000000001')$$,'42501','Document is unavailable','other patient cannot authorize download');
select is((select count(*) from storage.objects where bucket_id='patient-documents'),0::bigint,'other patient cannot read storage object');

reset role; set local role authenticated; set local request.jwt.claim.sub='1a000000-0000-4000-8000-000000000003';
select is((select count(*) from public.documents),1::bigint,'assigned verified doctor reads only appointment document metadata');
select is((select count(*) from public.list_assigned_appointment_documents('8a000000-0000-4000-8000-000000000001')),1::bigint,'assigned doctor lists appointment documents');
select is((select scan_status from public.documents where id='4a000000-0000-4000-8000-000000000001'),'PENDING_SCAN'::public.document_scan_status,'new document defaults to pending scan');
select throws_ok($$select * from public.authorize_doctor_document_download('4a000000-0000-4000-8000-000000000001')$$,'42501','Document is unavailable','pending document cannot be downloaded by doctor');
select is((select count(*) from storage.objects where bucket_id='patient-documents'),0::bigint,'pending object is hidden from assigned doctor');

reset role; set local role authenticated; set local request.jwt.claim.sub='1a000000-0000-4000-8000-000000000004';
select is((select count(*) from public.documents),0::bigint,'unassigned doctor cannot browse document metadata');
select throws_ok($$select * from public.list_assigned_appointment_documents('8a000000-0000-4000-8000-000000000001')$$,'42501','Documents are unavailable','unassigned doctor cannot list appointment documents');

reset role; set local role service_role;
update public.documents set scan_status='CLEAN',scan_provider='synthetic-scanner',scanned_at=now() where id='4a000000-0000-4000-8000-000000000001';
reset role; set local role authenticated; set local request.jwt.claim.sub='1a000000-0000-4000-8000-000000000003';
select is((select object_path from public.authorize_doctor_document_download('4a000000-0000-4000-8000-000000000001')),
  '1a000000-0000-4000-8000-000000000001/4a000000-0000-4000-8000-000000000001.pdf','assigned doctor authorizes a clean document');
select is((select count(*) from storage.objects where bucket_id='patient-documents'),1::bigint,'assigned doctor can read clean storage object');

reset role; set local role service_role;
update public.documents set scan_status='QUARANTINED',scan_failure_code='MALWARE_DETECTED' where id='4a000000-0000-4000-8000-000000000001';
reset role; set local role authenticated; set local request.jwt.claim.sub='1a000000-0000-4000-8000-000000000001';
select throws_ok($$select * from public.authorize_patient_document_download('4a000000-0000-4000-8000-000000000001')$$,'42501','Document is unavailable','quarantine blocks patient signed-download authorization');
select is((select count(*) from storage.objects where bucket_id='patient-documents'),0::bigint,'quarantine hides the storage object from the patient');

reset role;
select is((select count(*) from public.audit_events where action='patient_document_uploaded' and target_id='4a000000-0000-4000-8000-000000000001'),1::bigint,'upload is audited without file content');
select is((select count(*) from public.audit_events where action='patient_document_downloaded' and target_id='4a000000-0000-4000-8000-000000000001'),1::bigint,'download authorization is audited without signed URL');
select is((select count(*) from public.audit_events where action='doctor_document_downloaded' and target_id='4a000000-0000-4000-8000-000000000001'),1::bigint,'doctor download is audited without signed URL');

select * from finish();
rollback;
