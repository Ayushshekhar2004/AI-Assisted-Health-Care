begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('1b100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','privacy-patient@example.invalid','',now(),'{}','{}',now(),now()),
('1b100000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','privacy-other@example.invalid','',now(),'{}','{}',now(),now()),
('1b100000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','privacy-operations@example.invalid','',now(),'{}','{}',now(),now());
delete from public.profiles where auth_user_id in ('1b100000-0000-4000-8000-000000000001','1b100000-0000-4000-8000-000000000002','1b100000-0000-4000-8000-000000000003');
insert into public.profiles(id,auth_user_id,role,display_name) values
('2b100000-0000-4000-8000-000000000001','1b100000-0000-4000-8000-000000000001','patient','Synthetic Privacy Patient'),
('2b100000-0000-4000-8000-000000000002','1b100000-0000-4000-8000-000000000002','patient','Synthetic Other Patient'),
('2b100000-0000-4000-8000-000000000003','1b100000-0000-4000-8000-000000000003','operations','Synthetic Privacy Operator');
insert into public.patients(id,profile_id,preferred_language,date_of_birth,city,onboarding_completed_at) values
('3b100000-0000-4000-8000-000000000001','2b100000-0000-4000-8000-000000000001','en','1990-01-01','Synthetic City',now()),
('3b100000-0000-4000-8000-000000000002','2b100000-0000-4000-8000-000000000002','en','1990-01-01','Synthetic City',now());

select ok((select relrowsecurity from pg_class where oid='public.consent_records'::regclass),'consent records retain RLS');
select has_function('public','record_patient_consent_decision',array['consent_type','consent_status','text'],'purpose-specific consent function exists');
select has_function('public','list_own_managed_consents',array[]::text[],'patient privacy-center function exists');
select has_function('public','list_audit_events_for_operations',array['text','uuid','uuid','timestamp with time zone','timestamp with time zone','integer','integer'],'strict admin audit lookup exists');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='consent_records' and grantee='authenticated' and privilege_type='INSERT'),0::bigint,'browser cannot bypass validated consent writes');

set local role authenticated;
set local request.jwt.claim.sub='1b100000-0000-4000-8000-000000000001';
select is((select count(*) from public.list_own_managed_consents()),0::bigint,'patient starts with no managed decisions');
select lives_ok($$select public.record_patient_consent_decision('ai_intake_processing','granted','ai-intake-processing-v1')$$,'patient grants AI intake processing');
select lives_ok($$select public.record_patient_consent_decision('teleconsultation','granted','teleconsultation-v1')$$,'patient grants teleconsultation');
select lives_ok($$select public.record_patient_consent_decision('document_processing','granted','document-processing-v1')$$,'patient grants document processing');
select is((select count(*) from public.list_own_managed_consents()),3::bigint,'privacy center displays all managed versions');
select throws_ok($$select public.record_patient_consent_decision('document_processing','withdrawn','browser-version')$$,'42501','Consent preferences are unavailable','browser cannot select policy version');
select throws_ok($$select public.record_patient_consent_decision('teleconsultation','granted','teleconsultation-v1')$$,'23514','Consent decision is unavailable','duplicate decision is rejected');

reset role;
insert into public.intake_sessions(id,patient_id,status) values('4b100000-0000-4000-8000-000000000001','3b100000-0000-4000-8000-000000000001','ACTIVE');
set local role authenticated;
set local request.jwt.claim.sub='1b100000-0000-4000-8000-000000000001';
select throws_ok($$select public.record_patient_consent_decision('ai_intake_processing','withdrawn','ai-intake-processing-v1')$$,'23514','Consent is required by an active workflow','AI consent cannot be revoked during active intake');
reset role;
update public.intake_sessions set status='ABANDONED' where id='4b100000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub='1b100000-0000-4000-8000-000000000001';
select lives_ok($$select public.record_patient_consent_decision('ai_intake_processing','withdrawn','ai-intake-processing-v1')$$,'AI consent can be revoked after intake ends');
select lives_ok($$select public.record_patient_consent_decision('teleconsultation','withdrawn','teleconsultation-v1')$$,'teleconsultation can be revoked without active appointment');
select lives_ok($$select public.record_patient_consent_decision('document_processing','withdrawn','document-processing-v1')$$,'document processing can be revoked without pending scan');
select is((select count(*) from (select distinct on(consent_type) consent_type,status from public.list_own_managed_consents() order by consent_type,effective_at desc) latest where status='withdrawn'),3::bigint,'latest decision for every purpose is withdrawn');
select throws_ok($$select public.start_intake_session()$$,'42501','Required purpose consent is withdrawn','withdrawal blocks new AI intake processing');

set local request.jwt.claim.sub='1b100000-0000-4000-8000-000000000002';
select is((select count(*) from public.list_own_managed_consents()),0::bigint,'other patient sees only their own empty consent history');
select throws_ok($$select * from public.list_audit_events_for_operations('ALL',null,null,null,null,25,0)$$,'42501','Audit lookup is unavailable','patient cannot access audit lookup');

set local request.jwt.claim.sub='1b100000-0000-4000-8000-000000000003';
select ok((select count(*) from public.list_audit_events_for_operations('CONSENT',null,null,now()-interval '1 day',now()+interval '1 day',25,0))>=6,'operations can read content-free consent audit events');
select throws_ok($$select * from public.list_audit_events_for_operations('ALL',null,null,now()-interval '40 days',now(),25,0)$$,'42501','Audit lookup is unavailable','audit lookup rejects ranges over 31 days');

reset role;
select is((select count(*) from public.audit_events where actor_user_id='1b100000-0000-4000-8000-000000000001' and action='consent_granted'),3::bigint,'all grants have content-free audit events');
select is((select count(*) from public.audit_events where actor_user_id='1b100000-0000-4000-8000-000000000001' and action='consent_revoked'),3::bigint,'all revocations have content-free audit events');
select is((select count(*) from public.audit_events where actor_user_id='1b100000-0000-4000-8000-000000000003' and action='admin_audit_lookup'),1::bigint,'successful admin lookup is audited');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name='audit_events' and column_name in ('payload','metadata','details','content')),0::bigint,'audit lookup source has no clinical payload');

select * from finish();
rollback;
