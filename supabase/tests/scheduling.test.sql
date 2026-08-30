begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '11000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'scheduling-patient-one@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '11000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'scheduling-patient-two@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '11000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'scheduling-doctor@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '11000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'scheduling-other-doctor@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

delete from public.profiles
where auth_user_id in (
  '11000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000002',
  '11000000-0000-0000-0000-000000000003',
  '11000000-0000-0000-0000-000000000004'
);

insert into public.profiles (id, auth_user_id, role)
values
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'patient'),
  ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 'patient'),
  ('21000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000003', 'doctor'),
  ('21000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000004', 'doctor');

insert into public.patients (
  id,
  profile_id,
  preferred_language,
  date_of_birth,
  city,
  onboarding_completed_at
)
values
  (
    '31000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'en',
    '1990-01-01',
    'Synthetic City',
    now()
  ),
  (
    '31000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    'hi',
    '1991-01-01',
    'Synthetic City',
    now()
  );

insert into public.doctors (
  id,
  profile_id,
  status,
  full_name,
  qualification,
  registration_number,
  registration_council,
  registration_state,
  specialty,
  languages,
  teleconsultation_fee_paise,
  onboarding_completed_at,
  verification_reason,
  verification_decided_at,
  verification_decided_by,
  is_bookable
)
values
  (
    '51000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000003',
    'verified',
    'Dr Synthetic Scheduler',
    'Synthetic Medical Degree',
    'SYN-SCHEDULE-1',
    'Synthetic Medical Council',
    'Synthetic State',
    'General Medicine',
    array['en']::public.doctor_language[],
    75000,
    now(),
    'Synthetic verification approval.',
    now(),
    '11000000-0000-0000-0000-000000000003',
    true
  ),
  (
    '51000000-0000-0000-0000-000000000004',
    '21000000-0000-0000-0000-000000000004',
    'pending_verification',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    false
  );

insert into public.doctor_availability (id, doctor_id, starts_at, ends_at)
values
  (
    '61000000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000003',
    now() + interval '7 days',
    now() + interval '7 days 30 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000002',
    '51000000-0000-0000-0000-000000000003',
    now() + interval '8 days',
    now() + interval '8 days 30 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000003',
    '51000000-0000-0000-0000-000000000004',
    now() + interval '9 days',
    now() + interval '9 days 30 minutes'
  );

select ok(
  (select relrowsecurity from pg_class where oid = 'public.doctor_availability'::regclass),
  'doctor availability has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.appointments'::regclass),
  'appointments has RLS enabled'
);
select throws_ok(
  $$
    insert into public.doctor_availability (doctor_id, starts_at, ends_at)
    values (
      '51000000-0000-0000-0000-000000000003',
      now() + interval '7 days 15 minutes',
      now() + interval '7 days 45 minutes'
    )
  $$,
  '23P01',
  'conflicting key value violates exclusion constraint "doctor_availability_no_overlap"',
  'overlapping availability for one doctor is rejected'
);

set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.doctor_availability),
  2::bigint,
  'patient sees availability only for a verified bookable doctor'
);
select is(
  (select count(*) from public.list_bookable_availability()),
  2::bigint,
  'onboarded patient can list minimum fields for bookable slots'
);
select throws_ok(
  $$
    insert into public.appointments (
      doctor_availability_id,
      doctor_id,
      patient_id,
      starts_at,
      ends_at
    )
    values (
      '61000000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000003',
      '31000000-0000-0000-0000-000000000001',
      now() + interval '7 days',
      now() + interval '7 days 30 minutes'
    )
  $$,
  '42501',
  'permission denied for table appointments',
  'patient cannot bypass the booking function with a direct insert'
);
select lives_ok(
  $$ select public.request_appointment('61000000-0000-0000-0000-000000000001') $$,
  'active patient can request a verified doctor availability slot'
);
select results_eq(
  $$ select status::text, fee_paise from public.appointments $$,
  $$ values ('REQUESTED', 75000) $$,
  'new appointment starts requested and snapshots the server-derived fee'
);
select is((select count(*) from public.appointments), 1::bigint, 'patient sees own appointment');
select throws_ok(
  $$
    select public.transition_appointment_status(
      (select id from public.appointments limit 1),
      'CONFIRMED'
    )
  $$,
  '42501',
  'Appointment transition is unavailable',
  'patient cannot confirm an appointment'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-0000-0000-000000000002';

select throws_ok(
  $$ select public.request_appointment('61000000-0000-0000-0000-000000000001') $$,
  '23P01',
  'conflicting key value violates exclusion constraint "appointments_doctor_no_double_booking"',
  'a concurrent active booking for the doctor slot is rejected'
);
select is((select count(*) from public.appointments), 0::bigint, 'other patient cannot read booking');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-0000-0000-000000000003';

select is((select count(*) from public.appointments), 1::bigint, 'assigned doctor sees appointment');
select lives_ok(
  $$
    select public.create_doctor_availability(
      now() + interval '10 days',
      now() + interval '10 days 30 minutes'
    )
  $$,
  'verified doctor can create own future availability'
);
select lives_ok(
  $$
    select public.delete_doctor_availability(
      (
        select id
        from public.doctor_availability
        where starts_at > now() + interval '9 days 12 hours'
        limit 1
      )
    )
  $$,
  'doctor can remove own unbooked future availability'
);
select lives_ok(
  $$
    select public.transition_appointment_status(
      (select id from public.appointments limit 1),
      'CONFIRMED'
    )
  $$,
  'doctor can confirm a requested appointment'
);
select throws_ok(
  $$
    select public.transition_appointment_status(
      (select id from public.appointments limit 1),
      'COMPLETED'
    )
  $$,
  '42501',
  'Appointment transition is unavailable',
  'doctor cannot skip directly from confirmed to completed'
);
select lives_ok(
  $$
    select public.transition_appointment_status(
      (select id from public.appointments limit 1),
      'IN_PROGRESS'
    )
  $$,
  'doctor can start a confirmed appointment'
);
select lives_ok(
  $$
    select public.transition_appointment_status(
      (select id from public.appointments limit 1),
      'COMPLETED'
    )
  $$,
  'doctor can complete an in-progress appointment'
);
select throws_ok(
  $$
    select public.transition_appointment_status(
      (select id from public.appointments limit 1),
      'CONFIRMED'
    )
  $$,
  '42501',
  'Appointment transition is unavailable',
  'completed appointment is terminal'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-0000-0000-000000000004';

select is((select count(*) from public.appointments), 0::bigint, 'unassigned doctor sees no appointments');
select throws_ok(
  $$
    select public.create_doctor_availability(
      now() + interval '11 days',
      now() + interval '11 days 30 minutes'
    )
  $$,
  '42501',
  'Availability is unavailable',
  'unverified doctor cannot create availability'
);
select throws_ok(
  $$ select public.delete_doctor_availability('61000000-0000-0000-0000-000000000002') $$,
  '22023',
  'Availability is unavailable',
  'doctor cannot delete another doctor availability'
);

reset role;

insert into public.intake_sessions (id, patient_id)
values (
  '71000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001'
);
insert into public.triage_results (
  intake_session_id,
  rule_set_version,
  outcome,
  matched_rule_codes
)
values (
  '71000000-0000-0000-0000-000000000001',
  'red-flags-v1.0.0',
  'RED_FLAG',
  array['SEVERE_TRAUMA']
);
insert into public.doctor_availability (id, doctor_id, starts_at, ends_at)
values (
  '61000000-0000-0000-0000-000000000099',
  '51000000-0000-0000-0000-000000000003',
  now() + interval '12 days',
  now() + interval '12 days 30 minutes'
);

set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select public.request_appointment('61000000-0000-0000-0000-000000000099') $$,
  '42501',
  'Emergency pathway required',
  'database blocks normal doctor routing after a red flag'
);

reset role;

select is(
  (
    select count(*)
    from public.audit_events
    where target_type = 'appointment'
  ),
  4::bigint,
  'request and successful transitions create content-free audit events'
);
select is(
  (
    select count(*)
    from public.audit_events
    where target_type = 'doctor_availability'
  ),
  2::bigint,
  'availability creation and deletion create content-free audit events'
);
select results_eq(
  $$
    select status::text
    from public.appointments
  $$,
  $$ values ('COMPLETED') $$,
  'appointment finishes in completed status'
);
select throws_ok(
  $$
    update public.appointments
    set status = 'CONFIRMED'
    where status = 'COMPLETED'
  $$,
  '23514',
  'Invalid appointment status transition',
  'database trigger rejects invalid transitions even for privileged writes'
);
select is(
  (
    select count(*)
    from public.appointments
    where status in ('REQUESTED', 'CONFIRMED', 'IN_PROGRESS')
  ),
  0::bigint,
  'no active reservation remains after completion'
);

select * from finish();
rollback;
