begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
('19000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','note-patient@example.invalid','',now(),'{}','{}',now(),now()),
('19000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','note-doctor@example.invalid','',now(),'{}','{}',now(),now()),
('19000000-0000-4000-8000-000000000003','00000000-0000-0000-8000-000000000000','authenticated','authenticated','note-other-doctor@example.invalid','',now(),'{}','{}',now(),now()),
('19000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','note-pending-doctor@example.invalid','',now(),'{}','{}',now(),now());

delete from public.profiles where auth_user_id in (
'19000000-0000-4000-8000-000000000001',
'19000000-0000-4000-8000-000000000002',
'19000000-0000-4000-8000-000000000003',
'19000000-0000-4000-8000-000000000004'
);

insert into public.profiles (id, auth_user_id, role, display_name) values
('29000000-0000-4000-8000-000000000001','19000000-0000-4000-8000-000000000001','patient','Synthetic Note Patient'),
('29000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000002','doctor','Synthetic Note Doctor'),
('29000000-0000-4000-8000-000000000003','19000000-0000-4000-8000-000000000003','doctor','Synthetic Other Doctor'),
('29000000-0000-4000-8000-000000000004','19000000-0000-4000-8000-000000000004','doctor','Synthetic Pending Doctor');

insert into public.patients (id, profile_id, preferred_language) values
('39000000-0000-4000-8000-000000000001','29000000-0000-4000-8000-000000000001','en');
insert into public.doctors (id, profile_id, status, verification_reason, verification_decided_at, verification_decided_by) values
('59000000-0000-4000-8000-000000000002','29000000-0000-4000-8000-000000000002','verified','Synthetic approval',now(),'19000000-0000-4000-8000-000000000002'),
('59000000-0000-4000-8000-000000000003','29000000-0000-4000-8000-000000000003','verified','Synthetic approval',now(),'19000000-0000-4000-8000-000000000003'),
('59000000-0000-4000-8000-000000000004','29000000-0000-4000-8000-000000000004','pending_verification',null,null,null);

insert into public.doctor_availability (id, doctor_id, starts_at, ends_at) values
('69000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000002',now()+interval '1 day',now()+interval '1 day 30 minutes'),
('69000000-0000-4000-8000-000000000002','59000000-0000-4000-8000-000000000004',now()+interval '2 days',now()+interval '2 days 30 minutes');
insert into public.appointments (id, doctor_availability_id, doctor_id, patient_id, starts_at, ends_at, status)
select fixture.appointment_id, availability.id, availability.doctor_id, '39000000-0000-4000-8000-000000000001', availability.starts_at, availability.ends_at, 'IN_PROGRESS'
from (values
('89000000-0000-4000-8000-000000000001'::uuid,'69000000-0000-4000-8000-000000000001'::uuid),
('89000000-0000-4000-8000-000000000002'::uuid,'69000000-0000-4000-8000-000000000002'::uuid)
) fixture(appointment_id, availability_id)
join public.doctor_availability availability on availability.id=fixture.availability_id;

select has_table('public','consultations','consultations table exists');
select has_function('public','save_consultation_draft',array['uuid','text','text','text','text','text','telemedicine_adequacy'],'draft function exists');
select has_function('public','finalize_consultation',array['uuid','text','text','text','text','text','telemedicine_adequacy'],'finalize function exists');
select has_function('public','get_own_consultation',array['uuid'],'read function exists');

set local role anon;
select throws_ok($$select public.save_consultation_draft('89000000-0000-4000-8000-000000000001','','','','','',null)$$,'42501','permission denied for function save_consultation_draft','anonymous cannot save notes');

reset role; set local role authenticated; set local request.jwt.claim.sub='19000000-0000-4000-8000-000000000001';
select throws_ok($$select public.save_consultation_draft('89000000-0000-4000-8000-000000000001','','','','','',null)$$,'42501','Consultation note is unavailable','patient cannot create a draft');

reset role; set local role authenticated; set local request.jwt.claim.sub='19000000-0000-4000-8000-000000000003';
select throws_ok($$select public.save_consultation_draft('89000000-0000-4000-8000-000000000001','','','','','',null)$$,'42501','Consultation note is unavailable','unassigned verified doctor cannot create a draft');
select throws_ok($$select * from public.get_consultation_ai_draft_source('89000000-0000-4000-8000-000000000001')$$,'42501','Consultation AI draft is unavailable','unassigned doctor cannot access AI draft source');

reset role; set local role authenticated; set local request.jwt.claim.sub='19000000-0000-4000-8000-000000000004';
select throws_ok($$select public.save_consultation_draft('89000000-0000-4000-8000-000000000002','','','','','',null)$$,'42501','Consultation note is unavailable','assigned pending doctor cannot create a draft');

reset role; set local role authenticated; set local request.jwt.claim.sub='19000000-0000-4000-8000-000000000002';
select isnt(public.save_consultation_draft('89000000-0000-4000-8000-000000000001','Synthetic history','Remote limitations','','','','ADEQUATE'),null::uuid,'assigned verified doctor saves a draft');
select is((select count(*) from public.consultations where appointment_id='89000000-0000-4000-8000-000000000001'),1::bigint,'assigned doctor RLS can read the draft');
select is((select count(*) from public.get_consultation_ai_draft_source('89000000-0000-4000-8000-000000000001')),1::bigint,'assigned verified doctor accesses reviewed intake source');
select throws_ok($$select public.record_consultation_ai_draft('19000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000001','AI history','AI limitations','AI assessment','AI plan','','model','model-v1','prompt-v1')$$,'42501','permission denied for function record_consultation_ai_draft','browser-authenticated doctor cannot claim AI provenance');

reset role; set local role service_role;
select isnt(public.record_consultation_ai_draft('19000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000001','AI history','AI limitations','AI assessment','AI plan','','model','model-v1','prompt-v1'),null::uuid,'server-only workflow stores an editable AI draft');
reset role;
select is((select ai_prompt_version from public.consultations where appointment_id='89000000-0000-4000-8000-000000000001'),'prompt-v1','AI draft provenance is stored');

reset role; set local role authenticated; set local request.jwt.claim.sub='19000000-0000-4000-8000-000000000001';
select is((select count(*) from public.consultations where appointment_id='89000000-0000-4000-8000-000000000001'),0::bigint,'patient RLS hides draft notes');
select is((select count(*) from public.get_own_consultation('89000000-0000-4000-8000-000000000001')),0::bigint,'patient RPC hides draft notes');

reset role; set local role authenticated; set local request.jwt.claim.sub='19000000-0000-4000-8000-000000000002';
select throws_ok($$select public.finalize_consultation('89000000-0000-4000-8000-000000000001','Synthetic history','Remote limitations','','Synthetic plan','', 'ADEQUATE')$$,'23514','Final consultation note is incomplete','incomplete note cannot be finalized');
select isnt(public.finalize_consultation('89000000-0000-4000-8000-000000000001','Synthetic history','Remote limitations','Synthetic assessment','Synthetic plan','Synthetic follow-up','ADEQUATE'),null::uuid,'assigned verified doctor finalizes a complete note');

reset role;
select is((select status from public.appointments where id='89000000-0000-4000-8000-000000000001'),'COMPLETED'::public.appointment_status,'adequate finalized note completes appointment');
select is((select finalized_by_doctor_id from public.consultations where appointment_id='89000000-0000-4000-8000-000000000001'),'59000000-0000-4000-8000-000000000002'::uuid,'finalized note stores the assigned doctor identity');

set local role authenticated; set local request.jwt.claim.sub='19000000-0000-4000-8000-000000000001';
select is((select count(*) from public.consultations where appointment_id='89000000-0000-4000-8000-000000000001'),1::bigint,'patient RLS allows finalized note');
select is((select assessment from public.get_own_consultation('89000000-0000-4000-8000-000000000001')),'Synthetic assessment','assigned patient reads finalized note');
select throws_ok($$update public.consultations set assessment='Changed' where appointment_id='89000000-0000-4000-8000-000000000001'$$,'42501',null,'patient cannot modify finalized note');

reset role; set local role authenticated; set local request.jwt.claim.sub='19000000-0000-4000-8000-000000000002';
select throws_ok($$select public.finalize_consultation('89000000-0000-4000-8000-000000000001','Synthetic history','Remote limitations','Synthetic assessment','Synthetic plan','','ADEQUATE')$$,'42501','Consultation note is unavailable','finalization cannot be repeated after appointment closure');

reset role;
select is((select count(*) from public.audit_events where action='consultation_draft_saved' and target_id='89000000-0000-4000-8000-000000000001'),1::bigint,'draft save is audited without note content');
select is((select count(*) from public.audit_events where action='consultation_finalized' and target_id='89000000-0000-4000-8000-000000000001'),1::bigint,'finalization is audited');
select is((select count(*) from public.audit_events where action='consultation_viewed' and target_id='89000000-0000-4000-8000-000000000001'),1::bigint,'patient finalized-note view is audited');
select is((select count(*) from public.audit_events where action='consultation_ai_draft_generated' and target_id='89000000-0000-4000-8000-000000000001'),1::bigint,'AI draft generation is audited without note content');

select * from finish();
rollback;
