begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('1a000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preference-patient@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('1a000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preference-doctor@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('1a000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preference-other@example.invalid', '', now(), '{}', '{}', now(), now());

delete from public.profiles where auth_user_id in (
  '1a000000-0000-4000-8000-000000000001',
  '1a000000-0000-4000-8000-000000000002',
  '1a000000-0000-4000-8000-000000000003'
);

insert into public.profiles (id, auth_user_id, role) values
  ('2a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', 'patient'),
  ('2a000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000002', 'doctor'),
  ('2a000000-0000-4000-8000-000000000003', '1a000000-0000-4000-8000-000000000003', 'patient');

insert into public.patients (id, profile_id) values
  ('3a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001'),
  ('3a000000-0000-4000-8000-000000000003', '2a000000-0000-4000-8000-000000000003');
insert into public.doctors (id, profile_id) values
  ('5a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000002');

insert into public.doctor_availability (id, doctor_id, starts_at, ends_at) values
  ('6a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000002', now() + interval '10 days', now() + interval '10 days 30 minutes'),
  ('6a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000002', now() + interval '11 days', now() + interval '11 days 30 minutes');

insert into public.appointments (
  id, doctor_availability_id, doctor_id, patient_id, starts_at, ends_at
) select
  fixture.appointment_id,
  availability.id,
  availability.doctor_id,
  '3a000000-0000-4000-8000-000000000001',
  availability.starts_at,
  availability.ends_at
from (
  values
    ('8a000000-0000-4000-8000-000000000001'::uuid, '6a000000-0000-4000-8000-000000000001'::uuid),
    ('8a000000-0000-4000-8000-000000000002'::uuid, '6a000000-0000-4000-8000-000000000002'::uuid)
) as fixture(appointment_id, availability_id)
join public.doctor_availability as availability
  on availability.id = fixture.availability_id;

select has_table(
  'public', 'patient_notification_preferences',
  'patient notification preferences table exists'
);
select is(
  (select count(*) from public.patient_notification_preferences where patient_id = '3a000000-0000-4000-8000-000000000001'),
  1::bigint,
  'preference row is provisioned with the patient'
);
select is(
  (select appointment_reminders_enabled from public.patient_notification_preferences where patient_id = '3a000000-0000-4000-8000-000000000001'),
  true,
  'appointment reminders default to enabled'
);

update public.appointments set status = 'CONFIRMED'
where id = '8a000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = '1a000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from public.patient_notification_preferences),
  1::bigint,
  'patient reads only their own preferences'
);
select results_eq(
  $$ update public.patient_notification_preferences
     set appointment_reminders_enabled = false
     returning appointment_reminders_enabled $$,
  $$ values (false) $$,
  'patient can opt out of non-essential appointment reminders'
);

reset role;
select is(
  (select delivery_status::text from public.notification_events
   where appointment_id = '8a000000-0000-4000-8000-000000000001'
     and event_type = 'APPOINTMENT_REMINDER'),
  'SKIPPED',
  'opting out suppresses an existing unsent reminder'
);
select is(
  (select delivery_status::text from public.notification_events
   where appointment_id = '8a000000-0000-4000-8000-000000000001'
     and event_type = 'APPOINTMENT_CONFIRMED'),
  'PENDING',
  'opting out does not suppress essential confirmation'
);

update public.appointments set status = 'CONFIRMED'
where id = '8a000000-0000-4000-8000-000000000002';
select is(
  (select count(*) from public.notification_events where appointment_id = '8a000000-0000-4000-8000-000000000002'),
  1::bigint,
  'confirmation still creates its essential event after opt-out'
);
select is(
  (select count(*) from public.notification_events
   where appointment_id = '8a000000-0000-4000-8000-000000000002'
     and event_type = 'APPOINTMENT_REMINDER'),
  0::bigint,
  'new reminders are not queued after opt-out'
);

update public.appointments set status = 'CANCELLED'
where id = '8a000000-0000-4000-8000-000000000002';
select is(
  (select count(*) from public.notification_events
   where appointment_id = '8a000000-0000-4000-8000-000000000002'
     and event_type = 'APPOINTMENT_CANCELLED'),
  2::bigint,
  'opt-out does not suppress essential cancellation events'
);

set local role authenticated;
set local request.jwt.claim.sub = '1a000000-0000-4000-8000-000000000003';
select is(
  (select count(*) from public.patient_notification_preferences),
  1::bigint,
  'another patient reads only their own preference row'
);
select is_empty(
  $$ update public.patient_notification_preferences
     set appointment_reminders_enabled = false
     where patient_id = '3a000000-0000-4000-8000-000000000001'
     returning patient_id $$,
  'another patient cannot update notification preferences'
);

reset role; set local role authenticated;
set local request.jwt.claim.sub = '1a000000-0000-4000-8000-000000000002';
select is(
  (select count(*) from public.patient_notification_preferences),
  0::bigint,
  'doctor cannot browse patient notification preferences'
);

reset role; set local role anon;
select throws_ok(
  $$ select * from public.patient_notification_preferences $$,
  '42501', 'permission denied for table patient_notification_preferences',
  'anonymous users cannot read notification preferences'
);

reset role; set local role service_role;
select throws_ok(
  $$ insert into public.notification_events (
       appointment_id, recipient_profile_id, event_type, scheduled_for,
       next_attempt_at
     ) values (
       '8a000000-0000-4000-8000-000000000001',
       '2a000000-0000-4000-8000-000000000001',
       'APPOINTMENT_CONFIRMED', now(), now()
     ) $$,
  '23505',
  'duplicate key value violates unique constraint "notification_events_once_per_recipient"',
  'duplicate webhook or job cannot create the same event twice'
);
select is(
  (select count(*) from public.claim_notification_events('8a000000-0000-4000-8000-000000000001', 1)),
  1::bigint,
  'first worker claims the due essential event'
);
select is(
  (select count(*) from public.claim_notification_events('8a000000-0000-4000-8000-000000000001', 1)),
  0::bigint,
  'a duplicate worker cannot claim an active lease'
);
select lives_ok(
  $$ select public.finish_notification_event(
       (select id from public.notification_events
        where appointment_id = '8a000000-0000-4000-8000-000000000001'
          and event_type = 'APPOINTMENT_CONFIRMED'),
       false, null, 'PROVIDER_ERROR'
     ) $$,
  'provider failures are recorded for bounded retry'
);
select ok(
  exists(
    select 1 from public.notification_events
    where appointment_id = '8a000000-0000-4000-8000-000000000001'
      and event_type = 'APPOINTMENT_CONFIRMED'
      and delivery_status = 'FAILED'
      and next_attempt_at > now()
  ),
  'first failure schedules retry with backoff'
);
select is(
  (select count(*) from public.claim_notification_events('8a000000-0000-4000-8000-000000000001', 1)),
  0::bigint,
  'event cannot be retried before its backoff expires'
);

update public.notification_events
set next_attempt_at = now() - interval '1 second'
where appointment_id = '8a000000-0000-4000-8000-000000000001'
  and event_type = 'APPOINTMENT_CONFIRMED';
select is(
  (select count(*) from public.claim_notification_events('8a000000-0000-4000-8000-000000000001', 1)),
  1::bigint,
  'event becomes claimable after backoff'
);
select is(
  (select delivery_attempts from public.notification_events
   where appointment_id = '8a000000-0000-4000-8000-000000000001'
     and event_type = 'APPOINTMENT_CONFIRMED'),
  2,
  'retry increments the bounded attempt counter'
);

update public.notification_events
set lease_expires_at = now() - interval '1 second'
where appointment_id = '8a000000-0000-4000-8000-000000000001'
  and event_type = 'APPOINTMENT_CONFIRMED';
select is(
  (select count(*) from public.claim_notification_events('8a000000-0000-4000-8000-000000000001', 1)),
  1::bigint,
  'expired processing lease is safely reclaimed after a crashed job'
);
select is(
  (select delivery_attempts from public.notification_events
   where appointment_id = '8a000000-0000-4000-8000-000000000001'
     and event_type = 'APPOINTMENT_CONFIRMED'),
  3,
  'stale lease recovery remains within the attempt limit'
);
select lives_ok(
  $$ select public.finish_notification_event(
       (select id from public.notification_events
        where appointment_id = '8a000000-0000-4000-8000-000000000001'
          and event_type = 'APPOINTMENT_CONFIRMED'),
       true, 'development-idempotent-result', null
     ) $$,
  'recovered event can be completed successfully'
);
select is(
  (select delivery_status::text from public.notification_events
   where appointment_id = '8a000000-0000-4000-8000-000000000001'
     and event_type = 'APPOINTMENT_CONFIRMED'),
  'DELIVERED',
  'completed event cannot be claimed again'
);

select * from finish();
rollback;

