begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('19000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notification-patient@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('19000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notification-doctor@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('19000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notification-other@example.invalid', '', now(), '{}', '{}', now(), now());

delete from public.profiles where auth_user_id in (
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000002',
  '19000000-0000-4000-8000-000000000003'
);

insert into public.profiles (id, auth_user_id, role, display_name) values
  ('29000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000001', 'patient', 'Synthetic Notification Patient'),
  ('29000000-0000-4000-8000-000000000002', '19000000-0000-4000-8000-000000000002', 'doctor', 'Synthetic Notification Doctor'),
  ('29000000-0000-4000-8000-000000000003', '19000000-0000-4000-8000-000000000003', 'patient', 'Synthetic Other Patient');

insert into public.patients (id, profile_id, preferred_language) values
  ('39000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 'en'),
  ('39000000-0000-4000-8000-000000000003', '29000000-0000-4000-8000-000000000003', 'en');
insert into public.doctors (id, profile_id) values
  ('59000000-0000-4000-8000-000000000002', '29000000-0000-4000-8000-000000000002');

insert into public.doctor_availability (id, doctor_id, starts_at, ends_at) values
  ('69000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000002', now() + interval '2 days', now() + interval '2 days 30 minutes'),
  ('69000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000002', now() + interval '3 days', now() + interval '3 days 30 minutes'),
  ('69000000-0000-4000-8000-000000000003', '59000000-0000-4000-8000-000000000002', now() + interval '4 days', now() + interval '4 days 30 minutes');

insert into public.appointments (
  id, doctor_availability_id, doctor_id, patient_id, starts_at, ends_at
) select
  fixture.appointment_id,
  availability.id,
  availability.doctor_id,
  '39000000-0000-4000-8000-000000000001',
  availability.starts_at,
  availability.ends_at
from (
  values
    ('89000000-0000-4000-8000-000000000001'::uuid, '69000000-0000-4000-8000-000000000001'::uuid),
    ('89000000-0000-4000-8000-000000000002'::uuid, '69000000-0000-4000-8000-000000000002'::uuid),
    ('89000000-0000-4000-8000-000000000003'::uuid, '69000000-0000-4000-8000-000000000003'::uuid)
) as fixture(appointment_id, availability_id)
join public.doctor_availability as availability
  on availability.id = fixture.availability_id;

select has_table('public', 'notification_events', 'notification events table exists');
select has_trigger(
  'public', 'appointments', 'appointments_enqueue_notification_events',
  'appointment notification trigger exists'
);

update public.appointments set status = 'CONFIRMED'
where id = '89000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from public.notification_events where appointment_id = '89000000-0000-4000-8000-000000000001'),
  2::bigint,
  'confirmation queues confirmation and reminder events'
);
select ok(
  exists(
    select 1 from public.notification_events
    where appointment_id = '89000000-0000-4000-8000-000000000001'
      and recipient_profile_id = '29000000-0000-4000-8000-000000000001'
      and event_type = 'APPOINTMENT_CONFIRMED'
  ),
  'confirmation is addressed only to the patient profile'
);
select ok(
  exists(
    select 1 from public.notification_events
    where appointment_id = '89000000-0000-4000-8000-000000000001'
      and event_type = 'APPOINTMENT_REMINDER'
      and scheduled_for > now()
  ),
  'reminder is scheduled for future delivery'
);

update public.appointments set status = 'CANCELLED'
where id = '89000000-0000-4000-8000-000000000002';
select is(
  (select count(*) from public.notification_events where appointment_id = '89000000-0000-4000-8000-000000000002'),
  2::bigint,
  'cancellation queues one event per participant'
);
select is(
  (
    select count(distinct recipient_profile_id)
    from public.notification_events
    where appointment_id = '89000000-0000-4000-8000-000000000002'
      and event_type = 'APPOINTMENT_CANCELLED'
  ),
  2::bigint,
  'cancellation addresses the assigned patient and doctor only'
);

update public.appointments set status = 'CONFIRMED'
where id = '89000000-0000-4000-8000-000000000003';
update public.appointments set status = 'IN_PROGRESS'
where id = '89000000-0000-4000-8000-000000000003';
select is(
  (
    select count(*) from public.notification_events
    where appointment_id = '89000000-0000-4000-8000-000000000003'
      and event_type = 'DOCTOR_READY'
  ),
  1::bigint,
  'consultation start queues one doctor-ready event'
);
select ok(
  exists(
    select 1 from public.notification_events
    where appointment_id = '89000000-0000-4000-8000-000000000003'
      and event_type = 'DOCTOR_READY'
      and recipient_profile_id = '29000000-0000-4000-8000-000000000001'
  ),
  'doctor-ready notification is addressed only to the patient'
);

set local role anon;
select throws_ok(
  $$ select * from public.notification_events $$,
  '42501', 'permission denied for table notification_events',
  'anonymous users cannot read notification events'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '19000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from public.notification_events),
  6::bigint,
  'patient reads only their own notification events'
);
select is(
  (
    select count(*) from public.notification_events
    where recipient_profile_id = '29000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'patient cannot read the doctor notification event'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '19000000-0000-4000-8000-000000000002';
select is(
  (select count(*) from public.notification_events),
  1::bigint,
  'doctor reads only their own cancellation event'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '19000000-0000-4000-8000-000000000003';
select is(
  (select count(*) from public.notification_events),
  0::bigint,
  'unrelated patient cannot browse notification events'
);
select throws_ok(
  $$ insert into public.notification_events (appointment_id, recipient_profile_id, event_type)
     values ('89000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000003', 'APPOINTMENT_CONFIRMED') $$,
  '42501', 'permission denied for table notification_events',
  'authenticated users cannot create notification events'
);
select throws_ok(
  $$ update public.notification_events set delivery_status = 'DELIVERED' $$,
  '42501', 'permission denied for table notification_events',
  'authenticated users cannot mutate delivery state'
);
select throws_ok(
  $$ select * from public.claim_notification_events(null, 50) $$,
  '42501', 'permission denied for function claim_notification_events',
  'authenticated users cannot claim notifications'
);

reset role; set local role service_role;
select is(
  (
    select count(*)
    from public.claim_notification_events(
      '89000000-0000-4000-8000-000000000001',
      50
    )
  ),
  1::bigint,
  'service role claims only the due confirmation event'
);
select is(
  (
    select delivery_status::text from public.notification_events
    where appointment_id = '89000000-0000-4000-8000-000000000001'
      and event_type = 'APPOINTMENT_CONFIRMED'
  ),
  'PROCESSING',
  'claim marks the event processing'
);
select lives_ok(
  $$ select public.finish_notification_event(
       (select id from public.notification_events
        where appointment_id = '89000000-0000-4000-8000-000000000001'
          and event_type = 'APPOINTMENT_CONFIRMED'),
       true,
       'development-safe-id',
       null
     ) $$,
  'service role can complete a claimed event'
);
select is(
  (
    select delivery_status::text from public.notification_events
    where appointment_id = '89000000-0000-4000-8000-000000000001'
      and event_type = 'APPOINTMENT_CONFIRMED'
  ),
  'DELIVERED',
  'successful completion marks the event delivered'
);
select is(
  (
    select provider_message_id from public.notification_events
    where appointment_id = '89000000-0000-4000-8000-000000000001'
      and event_type = 'APPOINTMENT_CONFIRMED'
  ),
  'development-safe-id',
  'only safe provider metadata is retained'
);
select is(
  (
    select count(*)
    from public.claim_notification_events(
      '89000000-0000-4000-8000-000000000001',
      50
    )
  ),
  0::bigint,
  'delivered and future events are not reclaimed'
);
select throws_ok(
  $$ select public.finish_notification_event(
       '79000000-0000-4000-8000-000000000099', true, 'safe-id', null
     ) $$,
  '22023', 'Notification completion is unavailable',
  'unknown events cannot be completed'
);

reset role;
select hasnt_column(
  'public', 'notification_events', 'subject',
  'notification events do not persist message subjects'
);
select hasnt_column(
  'public', 'notification_events', 'preview',
  'notification events do not persist message previews'
);

select * from finish();
rollback;
