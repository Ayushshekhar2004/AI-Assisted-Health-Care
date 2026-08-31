begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('18000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'video-patient@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('18000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'video-doctor@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('18000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'video-other-patient@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('18000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'video-other-doctor@example.invalid', '', now(), '{}', '{}', now(), now());

delete from public.profiles where auth_user_id in (
  '18000000-0000-4000-8000-000000000001',
  '18000000-0000-4000-8000-000000000002',
  '18000000-0000-4000-8000-000000000003',
  '18000000-0000-4000-8000-000000000004'
);

insert into public.profiles (id, auth_user_id, role, display_name) values
  ('28000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000001', 'patient', 'Synthetic Video Patient'),
  ('28000000-0000-4000-8000-000000000002', '18000000-0000-4000-8000-000000000002', 'doctor', 'Synthetic Video Doctor'),
  ('28000000-0000-4000-8000-000000000003', '18000000-0000-4000-8000-000000000003', 'patient', 'Synthetic Other Patient'),
  ('28000000-0000-4000-8000-000000000004', '18000000-0000-4000-8000-000000000004', 'doctor', 'Synthetic Other Doctor');

insert into public.patients (id, profile_id, preferred_language) values
  ('38000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000001', 'en'),
  ('38000000-0000-4000-8000-000000000003', '28000000-0000-4000-8000-000000000003', 'en');
insert into public.doctors (id, profile_id) values
  ('58000000-0000-4000-8000-000000000002', '28000000-0000-4000-8000-000000000002'),
  ('58000000-0000-4000-8000-000000000004', '28000000-0000-4000-8000-000000000004');

insert into public.doctor_availability (id, doctor_id, starts_at, ends_at) values
  ('68000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000002', now() + interval '1 day', now() + interval '1 day 30 minutes'),
  ('68000000-0000-4000-8000-000000000002', '58000000-0000-4000-8000-000000000002', now() + interval '2 days', now() + interval '2 days 30 minutes'),
  ('68000000-0000-4000-8000-000000000003', '58000000-0000-4000-8000-000000000002', now() + interval '3 days', now() + interval '3 days 30 minutes');

insert into public.appointments (
  id, doctor_availability_id, doctor_id, patient_id, starts_at, ends_at, status
) select
  appointment_id, availability.id, availability.doctor_id,
  '38000000-0000-4000-8000-000000000001', availability.starts_at,
  availability.ends_at, appointment_status::public.appointment_status
from (
  values
    ('88000000-0000-4000-8000-000000000001'::uuid, '68000000-0000-4000-8000-000000000001'::uuid, 'CONFIRMED'),
    ('88000000-0000-4000-8000-000000000002'::uuid, '68000000-0000-4000-8000-000000000002'::uuid, 'REQUESTED'),
    ('88000000-0000-4000-8000-000000000003'::uuid, '68000000-0000-4000-8000-000000000003'::uuid, 'COMPLETED')
) as fixture(appointment_id, availability_id, appointment_status)
join public.doctor_availability as availability
  on availability.id = fixture.availability_id;

select has_function(
  'public', 'authorize_appointment_video_token', array['uuid'],
  'appointment video authorization function exists'
);

set local role anon;
select throws_ok(
  $$ select * from public.authorize_appointment_video_token('88000000-0000-4000-8000-000000000001') $$,
  '42501', 'permission denied for function authorize_appointment_video_token',
  'anonymous callers cannot request video authorization'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '18000000-0000-4000-8000-000000000001';
select is(
  (select participant_role from public.authorize_appointment_video_token('88000000-0000-4000-8000-000000000001')),
  'patient', 'assigned patient is authorized for a confirmed appointment'
);
select throws_ok(
  $$ select * from public.authorize_appointment_video_token('88000000-0000-4000-8000-000000000002') $$,
  '42501', 'Video consultation is unavailable',
  'requested appointments cannot issue video authorization'
);
select throws_ok(
  $$ select * from public.authorize_appointment_video_token('88000000-0000-4000-8000-000000000003') $$,
  '42501', 'Video consultation is unavailable',
  'completed appointments cannot issue video authorization'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '18000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from public.authorize_appointment_video_token('88000000-0000-4000-8000-000000000001') $$,
  '42501', 'Video consultation is unavailable',
  'another patient cannot join the appointment room'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '18000000-0000-4000-8000-000000000002';
select is(
  (select participant_role from public.authorize_appointment_video_token('88000000-0000-4000-8000-000000000001')),
  'doctor', 'assigned doctor is authorized for a confirmed appointment'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '18000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select * from public.authorize_appointment_video_token('88000000-0000-4000-8000-000000000001') $$,
  '42501', 'Video consultation is unavailable',
  'another doctor cannot join the appointment room'
);

reset role;
select ok(
  position('room' in pg_get_function_result('public.authorize_appointment_video_token(uuid)'::regprocedure)) = 0,
  'database authorization does not accept or return client-selected room permissions'
);
select is(
  (select count(*) from public.audit_events where action = 'appointment_video_token_issued' and target_id = '88000000-0000-4000-8000-000000000001'),
  2::bigint, 'only successful patient and doctor authorizations are audited'
);
select ok(
  exists(select 1 from public.audit_events where action = 'appointment_video_token_issued' and actor_user_id = '18000000-0000-4000-8000-000000000001'),
  'patient token authorization has a content-free audit event'
);
select ok(
  exists(select 1 from public.audit_events where action = 'appointment_video_token_issued' and actor_user_id = '18000000-0000-4000-8000-000000000002'),
  'doctor token authorization has a content-free audit event'
);

select has_function(
  'public', 'start_appointment_consultation', array['uuid'],
  'consultation start function exists'
);

set local role anon;
select throws_ok(
  $$ select public.start_appointment_consultation('88000000-0000-4000-8000-000000000001') $$,
  '42501', 'permission denied for function start_appointment_consultation',
  'anonymous callers cannot start a consultation'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '18000000-0000-4000-8000-000000000001';
select is(
  public.start_appointment_consultation('88000000-0000-4000-8000-000000000001'),
  'CONFIRMED'::public.appointment_status,
  'assigned patient can enter but cannot start the clinical encounter'
);
select is(
  (select status from public.appointments where id = '88000000-0000-4000-8000-000000000001'),
  'CONFIRMED'::public.appointment_status,
  'patient entry does not change appointment status'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '18000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select public.start_appointment_consultation('88000000-0000-4000-8000-000000000001') $$,
  '42501', 'Consultation is unavailable',
  'another doctor cannot start the consultation'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '18000000-0000-4000-8000-000000000002';
select is(
  public.start_appointment_consultation('88000000-0000-4000-8000-000000000001'),
  'IN_PROGRESS'::public.appointment_status,
  'assigned doctor starts the confirmed appointment'
);
select is(
  public.start_appointment_consultation('88000000-0000-4000-8000-000000000001'),
  'IN_PROGRESS'::public.appointment_status,
  'starting an in-progress appointment is idempotent'
);

reset role;
select is(
  (select count(*) from public.audit_events where action = 'appointment_status_transitioned' and target_id = '88000000-0000-4000-8000-000000000001'),
  1::bigint, 'the consultation start transition is audited exactly once'
);

set local role authenticated;
set local request.jwt.claim.sub = '18000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select public.start_appointment_consultation('88000000-0000-4000-8000-000000000002') $$,
  '42501', 'Consultation is unavailable',
  'a requested appointment cannot be started'
);

select * from finish();
rollback;
