begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('1e000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','retention-patient@example.invalid','',now(),'{}','{}',now(),now()),
('1e000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','retention-doctor@example.invalid','',now(),'{}','{}',now(),now());
delete from public.profiles where auth_user_id in ('1e000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000002');
insert into public.profiles(id,auth_user_id,role,display_name) values
('2e000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000001','patient','Synthetic Retention Patient'),
('2e000000-0000-4000-8000-000000000002','1e000000-0000-4000-8000-000000000002','doctor','Synthetic Retention Doctor');
insert into public.patients(id,profile_id,preferred_language) values
('3e000000-0000-4000-8000-000000000001','2e000000-0000-4000-8000-000000000001','en');
insert into public.doctors(id,profile_id,status,verification_reason,verification_decided_at,verification_decided_by) values
('4e000000-0000-4000-8000-000000000002','2e000000-0000-4000-8000-000000000002','verified','Synthetic approval',now(),'1e000000-0000-4000-8000-000000000002');
insert into public.doctor_availability(id,doctor_id,starts_at,ends_at) values
('5e000000-0000-4000-8000-000000000001','4e000000-0000-4000-8000-000000000002',now()-interval '500 days',now()-interval '500 days'+interval '30 minutes');
insert into public.appointments(id,doctor_availability_id,doctor_id,patient_id,starts_at,ends_at,status)
select '6e000000-0000-4000-8000-000000000001',id,doctor_id,'3e000000-0000-4000-8000-000000000001',starts_at,ends_at,'COMPLETED'
from public.doctor_availability where id='5e000000-0000-4000-8000-000000000001';
insert into public.notification_events(id,appointment_id,recipient_profile_id,event_type,delivery_status,scheduled_for,delivery_attempts,provider_message_id,delivered_at,created_at,updated_at) values
('7e000000-0000-4000-8000-000000000001','6e000000-0000-4000-8000-000000000001','2e000000-0000-4000-8000-000000000001','APPOINTMENT_CONFIRMED','DELIVERED',now()-interval '40 days',1,'synthetic-provider-1',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days'),
('7e000000-0000-4000-8000-000000000002','6e000000-0000-4000-8000-000000000001','2e000000-0000-4000-8000-000000000001','APPOINTMENT_CANCELLED','DELIVERED',now()-interval '400 days',1,'synthetic-provider-2',now()-interval '400 days',now()-interval '400 days',now()-interval '400 days');
insert into public.intake_sessions(id,patient_id,status,created_at) values
('8e000000-0000-4000-8000-000000000001','3e000000-0000-4000-8000-000000000001','ACTIVE',now()-interval '500 days');
insert into public.intake_messages(id,intake_session_id,sequence_number,role,text_content,created_at) values
('9e000000-0000-4000-8000-000000000001','8e000000-0000-4000-8000-000000000001',1,'patient','Synthetic protected transcript.',now()-interval '500 days');
insert into public.documents(id,appointment_id,patient_id,object_path,original_filename,mime_type,file_extension,size_bytes,created_at,updated_at) values
('ae000000-0000-4000-8000-000000000001','6e000000-0000-4000-8000-000000000001','3e000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000001/ae000000-0000-4000-8000-000000000001.pdf','synthetic-protected.pdf','application/pdf','pdf',128,now()-interval '500 days',now()-interval '500 days');
insert into storage.objects(id,bucket_id,name,owner_id,created_at,updated_at,metadata) values
('be000000-0000-4000-8000-000000000001','patient-documents','1e000000-0000-4000-8000-000000000001/be000000-0000-4000-8000-000000000001.pdf','1e000000-0000-4000-8000-000000000001',now()-interval '2 days',now()-interval '2 days','{"size":128,"mimetype":"application/pdf"}'),
('be000000-0000-4000-8000-000000000002','patient-documents','1e000000-0000-4000-8000-000000000001/ae000000-0000-4000-8000-000000000001.pdf','1e000000-0000-4000-8000-000000000001',now()-interval '500 days',now()-interval '500 days','{"size":128,"mimetype":"application/pdf"}');

select has_function('public','run_data_retention',array['text','boolean','timestamp with time zone','integer'],'retention function exists');
select has_function('public','list_expired_unregistered_document_objects',array['text','timestamp with time zone','integer'],'temporary object inventory exists');
set local role authenticated; set local request.jwt.claim.sub='1e000000-0000-4000-8000-000000000001';
select throws_ok($$select * from public.run_data_retention('retention-dev-v1',false,now(),100)$$,'42501','permission denied for function run_data_retention','browser users cannot invoke retention');
select throws_ok($$select * from public.list_expired_unregistered_document_objects('retention-dev-v1',now(),100)$$,'42501','permission denied for function list_expired_unregistered_document_objects','browser users cannot inventory temporary files');

reset role; set local role service_role;
select is((select anonymized_operational_rows::text||':'||deleted_operational_rows::text from public.run_data_retention('retention-dev-v1',false,now(),100)),'2:1','dry run returns bounded candidate counts');
select is((select count(*) from public.notification_events where id in ('7e000000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000002')),2::bigint,'dry run does not delete operational rows');
select is((select provider_message_id from public.notification_events where id='7e000000-0000-4000-8000-000000000001'),'synthetic-provider-1','dry run does not anonymize metadata');
select is((select string_agg(object_path,',') from public.list_expired_unregistered_document_objects('retention-dev-v1',now(),100)),'1e000000-0000-4000-8000-000000000001/be000000-0000-4000-8000-000000000001.pdf','only orphaned private upload is disposable');
select throws_ok($$select * from public.run_data_retention('unapproved-policy',true,now(),100)$$,'22023','Data retention job is unavailable','unapproved policy version cannot mutate data');
select is((select anonymized_operational_rows::text||':'||deleted_operational_rows::text from public.run_data_retention('retention-dev-v1',true,now(),100)),'2:1','approved apply reports anonymized and deleted rows');
select is((select provider_message_id from public.notification_events where id='7e000000-0000-4000-8000-000000000001'),'REDACTED','operational provider identifier is anonymized');
select is((select count(*) from public.notification_events where id='7e000000-0000-4000-8000-000000000002'),0::bigint,'expired terminal operational event is deleted');
select is((select count(*) from public.intake_messages where id='9e000000-0000-4000-8000-000000000001'),1::bigint,'transcript is protected from retention job');
select is((select count(*) from public.documents where id='ae000000-0000-4000-8000-000000000001'),1::bigint,'registered clinical document is protected');
select is((select count(*) from public.audit_events where action='data_retention_executed' and target_type='retention_job'),1::bigint,'apply creates content-free immutable audit event');
select is((select count(*) from storage.objects where id='be000000-0000-4000-8000-000000000001'),1::bigint,'database inventory never deletes storage objects directly');
select is((select count(*) from storage.objects where id='be000000-0000-4000-8000-000000000002'),1::bigint,'registered storage object remains protected');
select is((select count(*) from public.audit_events where action='data_retention_executed' and actor_user_id='00000000-0000-0000-0000-000000000000'),1::bigint,'job audit uses a non-user system actor without payload');
select is((select count(*) from public.intake_sessions where id='8e000000-0000-4000-8000-000000000001'),1::bigint,'clinical intake record is not silently destroyed');

select * from finish();
rollback;
