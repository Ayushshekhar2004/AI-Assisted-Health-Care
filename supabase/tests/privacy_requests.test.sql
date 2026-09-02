begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('1d000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','privacy-patient-a@example.invalid','',now(),'{}','{}',now(),now()),
('1d000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','privacy-patient-b@example.invalid','',now(),'{}','{}',now(),now()),
('1d000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','privacy-operations@example.invalid','',now(),'{}','{}',now(),now()),
('1d000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','privacy-doctor@example.invalid','',now(),'{}','{}',now(),now());
delete from public.profiles where auth_user_id in ('1d000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000002','1d000000-0000-4000-8000-000000000003','1d000000-0000-4000-8000-000000000004');
insert into public.profiles(id,auth_user_id,role,display_name) values
('2d000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001','patient','Synthetic Privacy Patient A'),
('2d000000-0000-4000-8000-000000000002','1d000000-0000-4000-8000-000000000002','patient','Synthetic Privacy Patient B'),
('2d000000-0000-4000-8000-000000000003','1d000000-0000-4000-8000-000000000003','operations','Synthetic Privacy Operations'),
('2d000000-0000-4000-8000-000000000004','1d000000-0000-4000-8000-000000000004','doctor','Synthetic Privacy Doctor');
insert into public.patients(id,profile_id,preferred_language) values
('3d000000-0000-4000-8000-000000000001','2d000000-0000-4000-8000-000000000001','en'),
('3d000000-0000-4000-8000-000000000002','2d000000-0000-4000-8000-000000000002','en');
insert into public.doctors(id,profile_id,status,full_name,registration_number,registration_council,registration_state,verification_reason,verification_decided_at,verification_decided_by) values
('4d000000-0000-4000-8000-000000000004','2d000000-0000-4000-8000-000000000004','verified','Synthetic Privacy Doctor','PRIVACY-001','Synthetic Council','Synthetic State','Synthetic approval',now(),'1d000000-0000-4000-8000-000000000003');
insert into public.doctor_availability(id,doctor_id,starts_at,ends_at) values
('5d000000-0000-4000-8000-000000000001','4d000000-0000-4000-8000-000000000004',now()-interval '2 days',now()-interval '2 days'+interval '30 minutes');
insert into public.appointments(id,doctor_availability_id,doctor_id,patient_id,starts_at,ends_at,status)
select '6d000000-0000-4000-8000-000000000001',id,doctor_id,'3d000000-0000-4000-8000-000000000001',starts_at,ends_at,'COMPLETED'
from public.doctor_availability where id='5d000000-0000-4000-8000-000000000001';
insert into public.consultations(id,appointment_id,doctor_id,patient_id,subjective_history,examination_observations,assessment,plan,telemedicine_adequacy,status,finalized_at,finalized_by_doctor_id) values
('7d000000-0000-4000-8000-000000000001','6d000000-0000-4000-8000-000000000001','4d000000-0000-4000-8000-000000000004','3d000000-0000-4000-8000-000000000001','Synthetic history','Synthetic limitations','Synthetic assessment','Synthetic plan','ADEQUATE','FINALIZED',now()-interval '2 days','4d000000-0000-4000-8000-000000000004');
insert into public.prescriptions(id,appointment_id,consultation_id,patient_id,doctor_id,doctor_name,doctor_registration_number,doctor_registration_council,doctor_registration_state,status,finalized_at,finalized_by_doctor_id) values
('8d000000-0000-4000-8000-000000000001','6d000000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000001','3d000000-0000-4000-8000-000000000001','4d000000-0000-4000-8000-000000000004','Synthetic Privacy Doctor','PRIVACY-001','Synthetic Council','Synthetic State','FINAL',now()-interval '2 days','4d000000-0000-4000-8000-000000000004');

select has_table('public','privacy_requests','privacy request ledger exists');
select has_function('public','submit_privacy_request',array['privacy_request_type','text'],'patient submission function exists');
select has_function('public','list_own_privacy_requests',array[]::text[],'patient history function exists');
select has_function('public','list_privacy_requests_for_operations',array['integer','integer'],'operations queue function exists');
select has_function('public','transition_privacy_request',array['uuid','privacy_request_status','privacy_resolution_category'],'review transition function exists');

set local role authenticated; set local request.jwt.claim.sub='1d000000-0000-4000-8000-000000000001';
select isnt(public.submit_privacy_request('ACCOUNT_DEACTIVATION_OR_DELETION','Synthetic account privacy review request.'),null::uuid,'patient submits a deletion/deactivation review request');
select isnt(public.submit_privacy_request('DATA_EXPORT','Synthetic export request.'),null::uuid,'patient submits an export request');
select isnt(public.submit_privacy_request('RECORD_CORRECTION','Synthetic correction request.'),null::uuid,'patient submits a correction request');
select isnt(public.submit_privacy_request('GRIEVANCE','Synthetic privacy grievance.'),null::uuid,'patient submits a grievance');
select is((select count(*) from public.list_own_privacy_requests()),4::bigint,'patient sees own four requests');
select throws_ok($$select count(*) from public.privacy_requests$$,'42501','permission denied for table privacy_requests','patient cannot bypass functions to browse ledger');

set local request.jwt.claim.sub='1d000000-0000-4000-8000-000000000002';
select is((select count(*) from public.list_own_privacy_requests()),0::bigint,'other patient cannot read requests by IDOR');
select throws_ok($$select count(*) from public.privacy_requests$$,'42501','permission denied for table privacy_requests','other patient cannot browse request details');
set local request.jwt.claim.sub='1d000000-0000-4000-8000-000000000004';
select throws_ok($$select public.submit_privacy_request('DATA_EXPORT','Synthetic unauthorized request.')$$,'42501','Privacy request is unavailable','doctor cannot submit a patient privacy request');
select throws_ok($$select * from public.list_privacy_requests_for_operations(25,0)$$,'42501','Privacy request queue is unavailable','doctor cannot browse review queue');

set local request.jwt.claim.sub='1d000000-0000-4000-8000-000000000003';
select is((select count(*) from public.list_privacy_requests_for_operations(25,0)),4::bigint,'operations sees reviewed queue through authorized function');
select throws_ok($$select count(*) from public.privacy_requests$$,'42501','permission denied for table privacy_requests','operations cannot directly browse sensitive request table');
select is((select bool_and(protected_records_retained) from public.list_privacy_requests_for_operations(25,0)),true,'every request explicitly protects retained records');
select throws_ok($$select public.transition_privacy_request((select id from public.list_privacy_requests_for_operations(25,0) where request_type='ACCOUNT_DEACTIVATION_OR_DELETION'),'RESOLVED','ACCOUNT_DEACTIVATION_REVIEWED')$$,'23514','Privacy request transition is unavailable','queued request cannot skip reviewed state');
select lives_ok($$select public.transition_privacy_request((select id from public.list_privacy_requests_for_operations(25,0) where request_type='ACCOUNT_DEACTIVATION_OR_DELETION'),'UNDER_REVIEW',null)$$,'operations begins deletion request review');
select throws_ok($$select public.transition_privacy_request((select id from public.list_privacy_requests_for_operations(25,0) where request_type='ACCOUNT_DEACTIVATION_OR_DELETION'),'RESOLVED','EXPORT_PROVIDED')$$,'23514','Privacy request transition is unavailable','mismatched resolution category is rejected');
select lives_ok($$select public.transition_privacy_request((select id from public.list_privacy_requests_for_operations(25,0) where request_type='ACCOUNT_DEACTIVATION_OR_DELETION'),'RESOLVED','ACCOUNT_DEACTIVATION_REVIEWED')$$,'operations records reviewed account outcome');
select is((select count(*) from public.consultations where id='7d000000-0000-4000-8000-000000000001'),0::bigint,'operations still cannot browse finalized consultation directly');

reset role;
select is((select count(*) from public.consultations where id='7d000000-0000-4000-8000-000000000001'),1::bigint,'finalized consultation survives account request processing');
select is((select count(*) from public.prescriptions where id='8d000000-0000-4000-8000-000000000001'),1::bigint,'finalized prescription survives account request processing');
select is((select protected_records_retained from public.privacy_requests where request_type='ACCOUNT_DEACTIVATION_OR_DELETION'),true,'resolved account request retains protected records');
select is((select status::text from public.privacy_requests where request_type='ACCOUNT_DEACTIVATION_OR_DELETION'),'RESOLVED','reviewed request reaches controlled terminal status');
select is((select count(*) from public.audit_events where action='privacy_request_submitted'),4::bigint,'submissions create content-free audit events');
select is((select count(*) from public.audit_events where action='privacy_request_status_changed'),2::bigint,'review transitions create content-free audit events');
select is((select count(*) from public.audit_events where action='admin_privacy_request_queue_viewed')>=1,true,'queue access is audited without request details');
select is((select count(*) from public.audit_events where action like 'privacy_%' and target_type='privacy_request'),6::bigint,'privacy audit events contain identifiers rather than request text');

select * from finish();
rollback;
