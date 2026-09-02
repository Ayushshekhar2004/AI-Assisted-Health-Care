begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('1a100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-patient@example.invalid','',now(),'{}','{}',now(),now()),
('1a100000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-operations@example.invalid','',now(),'{}','{}',now(),now());
delete from public.profiles where auth_user_id in ('1a100000-0000-4000-8000-000000000001','1a100000-0000-4000-8000-000000000002');
insert into public.profiles(id,auth_user_id,role,display_name) values
('2a100000-0000-4000-8000-000000000001','1a100000-0000-4000-8000-000000000001','patient','Synthetic Audit Patient'),
('2a100000-0000-4000-8000-000000000002','1a100000-0000-4000-8000-000000000002','operations','Synthetic Audit Operator');
insert into public.patients(id,profile_id,preferred_language,date_of_birth,city,onboarding_completed_at) values
('3a100000-0000-4000-8000-000000000001','2a100000-0000-4000-8000-000000000001','en','1990-01-01','Synthetic City',now());

select has_function('public','append_audit_event',array['uuid','text','text','uuid','text'],'central audit sink exists');
select has_function('public','record_authenticated_audit_event',array['text','text','uuid','text'],'authenticated audit service exists');
select ok((select relrowsecurity from pg_class where oid='public.audit_events'::regclass),'audit events retain RLS');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name='audit_events' and column_name in ('payload','metadata','details','content')),0::bigint,'audit table has no arbitrary payload column');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='audit_events' and grantee in ('anon','authenticated')),0::bigint,'browser roles have no direct audit table grants');
select function_privs_are('public','append_audit_event',array['uuid','text','text','uuid','text'],'authenticated',array[]::text[],'authenticated cannot call internal sink');
select lives_ok($$select public.append_audit_event('1a100000-0000-4000-8000-000000000002','doctor_verification_approved','doctor','2a100000-0000-4000-8000-000000000002','success')$$,'central sink supports doctor verification events');
select lives_ok($$select public.append_audit_event('1a100000-0000-4000-8000-000000000001','consultation_viewed','appointment','2a100000-0000-4000-8000-000000000001','success')$$,'central sink supports record-view events');
select lives_ok($$select public.append_audit_event('1a100000-0000-4000-8000-000000000001','patient_document_downloaded','document','2a100000-0000-4000-8000-000000000001','success')$$,'central sink supports document-access events');
select lives_ok($$select public.append_audit_event('1a100000-0000-4000-8000-000000000001','appointment_status_transitioned','appointment','2a100000-0000-4000-8000-000000000001','success')$$,'central sink supports appointment-transition events');
select lives_ok($$select public.append_audit_event('1a100000-0000-4000-8000-000000000003','consultation_finalized','appointment','2a100000-0000-4000-8000-000000000001','success')$$,'central sink supports consultation-finalization events');
select lives_ok($$select public.append_audit_event('1a100000-0000-4000-8000-000000000003','prescription_finalized','appointment','2a100000-0000-4000-8000-000000000001','success')$$,'central sink supports prescription-finalization events');

set local role authenticated;
set local request.jwt.claim.sub='1a100000-0000-4000-8000-000000000001';
select lives_ok($$select public.record_authenticated_audit_event('login_role_resolution_failed','auth_user','1a100000-0000-4000-8000-000000000001','success')$$,'authenticated user records own available login anomaly');
select throws_ok($$select public.record_authenticated_audit_event('login_role_resolution_failed','auth_user','1a100000-0000-4000-8000-000000000002','success')$$,'42501','Audit event is unavailable','user cannot spoof audit target');
select throws_ok($$select public.record_authenticated_audit_event('consultation_finalized','appointment','1a100000-0000-4000-8000-000000000001','success')$$,'42501','Audit event is unavailable','client cannot forge domain audit event');
select throws_ok($$select public.record_authenticated_audit_event('admin_doctor_verification_queue_viewed','admin_area','1a100000-0000-4000-8000-000000000001','success')$$,'42501','Audit event is unavailable','patient cannot record admin action');
select lives_ok($$select public.record_patient_consent_decision('document_processing','granted','document-processing-v1')$$,'validated patient consent grant succeeds');
select lives_ok($$select public.record_patient_consent_decision('document_processing','withdrawn','document-processing-v1')$$,'validated patient consent withdrawal succeeds');

set local request.jwt.claim.sub='1a100000-0000-4000-8000-000000000002';
select lives_ok($$select public.record_authenticated_audit_event('admin_doctor_verification_queue_viewed','admin_area','1a100000-0000-4000-8000-000000000002','success')$$,'operations user records admin queue access');

reset role;
select is((select count(*) from public.audit_events where actor_user_id='1a100000-0000-4000-8000-000000000001' and action='login_role_resolution_failed'),1::bigint,'login anomaly is content-free and attributable');
select is((select count(*) from public.audit_events where actor_user_id='1a100000-0000-4000-8000-000000000002' and action='admin_doctor_verification_queue_viewed'),1::bigint,'admin action is attributable');
select is((select count(*) from public.audit_events where actor_user_id='1a100000-0000-4000-8000-000000000001' and action='consent_granted'),1::bigint,'consent grant is audited');
select is((select count(*) from public.audit_events where actor_user_id='1a100000-0000-4000-8000-000000000001' and action='consent_revoked'),1::bigint,'consent revocation is audited');
select throws_ok($$update public.audit_events set outcome='success' where actor_user_id='1a100000-0000-4000-8000-000000000001'$$,'23514','Audit events are immutable','audit events cannot be updated');
select throws_ok($$delete from public.audit_events where actor_user_id='1a100000-0000-4000-8000-000000000001'$$,'23514','Audit events are immutable','audit events cannot be deleted');
select * from finish();
rollback;
