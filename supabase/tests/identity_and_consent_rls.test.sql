begin;

create extension if not exists pgtap with schema extensions;

select plan(47);

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
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'patient-one@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'patient-two@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'doctor-one@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'operations-one@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'doctor-two@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

select is(
  (
    select count(*)
    from public.profiles
    where auth_user_id in (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000004',
      '10000000-0000-0000-0000-000000000005'
    )
      and role = 'patient'
  ),
  5::bigint,
  'new auth users are provisioned as patients only'
);

delete from public.profiles
where auth_user_id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005'
);

insert into public.profiles (id, auth_user_id, role)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'patient'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'patient'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'doctor'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'operations'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'doctor');

insert into public.patients (id, profile_id)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');

insert into public.doctors (id, profile_id)
values (
  '50000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000003'
);

insert into public.doctors (
  id,
  profile_id,
  full_name,
  qualification,
  registration_number,
  registration_council,
  registration_state,
  specialty,
  languages,
  onboarding_completed_at
)
values (
  '50000000-0000-0000-0000-000000000005',
  '20000000-0000-0000-0000-000000000005',
  'Dr Synthetic Reviewer Two',
  'Synthetic Medical Degree',
  'SYN-DOCTOR-2',
  'Synthetic Medical Council',
  'Synthetic State',
  'General Medicine',
  array['en']::public.doctor_language[],
  now()
);

select results_eq(
  $$
    select status::text, is_bookable
    from public.doctors
    where id = '50000000-0000-0000-0000-000000000003'
  $$,
  $$ values ('pending_verification', false) $$,
  'new doctors default to pending verification and non-bookable'
);

insert into public.consent_records (id, patient_id, consent_type, status, policy_version)
values
  (
    '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    'privacy_policy',
    'granted',
    'synthetic-v1'
  );

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.patients'::regclass),
  'patients has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.doctors'::regclass),
  'doctors has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.consent_records'::regclass),
  'consent_records has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass),
  'audit_events has RLS enabled'
);
select is(
  (select public from storage.buckets where id = 'doctor-profile-photos'),
  false,
  'doctor profile photo bucket is private'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select is((select count(*) from public.profiles), 1::bigint, 'patient sees only own profile');
select is((select count(*) from public.patients), 1::bigint, 'patient sees only own patient record');
select is((select count(*) from public.doctors), 0::bigint, 'patient sees no doctor records');
select is(
  (select count(*) from public.consent_records),
  0::bigint,
  'patient cannot see another patient consent'
);

select throws_ok(
  $$
    select public.complete_patient_onboarding(
      'hi',
      '1990-05-20',
      null,
      'Synthetic City',
      null,
      null,
      false,
      true
    )
  $$,
  '23514',
  'Required consent was not granted',
  'onboarding requires both consent decisions'
);

select lives_ok(
  $$
    select public.complete_patient_onboarding(
      'hi',
      '1990-05-20',
      null,
      'Synthetic City',
      'Synthetic Contact',
      '+911234567890',
      true,
      true
    )
  $$,
  'patient can complete own onboarding'
);

select results_eq(
  $$
    select
      preferred_language::text,
      date_of_birth::text,
      coalesce(gender::text, ''),
      city,
      emergency_contact_name,
      emergency_contact_phone,
      onboarding_completed_at is not null
    from public.patients
  $$,
  $$
    values (
      'hi',
      '1990-05-20',
      '',
      'Synthetic City',
      'Synthetic Contact',
      '+911234567890',
      true
    )
  $$,
  'onboarding fields are stored on the patient record'
);

select results_eq(
  $$
    select consent_type::text, policy_version, effective_at is not null
    from public.consent_records
    order by consent_type
  $$,
  $$
    values
      ('intake_processing', 'intake-processing-v1', true),
      ('teleconsultation', 'teleconsultation-v1', true)
  $$,
  'versioned consent decisions are stored separately with timestamps'
);

select throws_ok(
  $$
    select public.complete_patient_onboarding(
      'en',
      '1990-05-20',
      'prefer_not_to_say',
      'Synthetic City',
      null,
      null,
      true,
      true
    )
  $$,
  '42501',
  'Patient onboarding is unavailable',
  'completed onboarding cannot be replayed'
);

select throws_ok(
  $$
    select public.complete_doctor_onboarding(
      'Dr Synthetic Patient',
      'Synthetic Degree',
      'SYN-PATIENT-1',
      'Synthetic Council',
      'Synthetic State',
      'General Medicine',
      array['en']::public.doctor_language[],
      null,
      null,
      null,
      null
    )
  $$,
  '42501',
  'Doctor onboarding is unavailable',
  'patient cannot complete doctor onboarding'
);

select results_eq(
  $$
    update public.patients
    set status = 'inactive'
    where id = '30000000-0000-0000-0000-000000000001'
    returning status::text
  $$,
  $$ values ('inactive') $$,
  'patient can update own patient status'
);

select is_empty(
  $$
    update public.patients
    set status = 'inactive'
    where id = '30000000-0000-0000-0000-000000000002'
    returning id
  $$,
  'patient cannot update another patient record'
);

select throws_ok(
  $$
    insert into public.consent_records (patient_id, consent_type, status, policy_version)
    values (
      '30000000-0000-0000-0000-000000000001',
      'privacy_policy',
      'granted',
      'synthetic-v1'
    )
  $$,
  '42501',
  'permission denied for table consent_records',
  'patient cannot bypass the version-validated consent decision function'
);

select throws_ok(
  $$
    insert into public.consent_records (patient_id, consent_type, status, policy_version)
    values (
      '30000000-0000-0000-0000-000000000002',
      'privacy_policy',
      'withdrawn',
      'synthetic-v1'
    )
  $$,
  '42501',
  'permission denied for table consent_records',
  'patient cannot directly append consent for another patient'
);

select throws_ok(
  $$ update public.profiles set role = 'operations' where true $$,
  '42501',
  'permission denied for table profiles',
  'authenticated users cannot change profile roles'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';

select is((select count(*) from public.profiles), 1::bigint, 'doctor sees only own profile');
select is((select count(*) from public.doctors), 1::bigint, 'doctor sees only own doctor record');
select is((select count(*) from public.patients), 0::bigint, 'doctor has no blanket patient access');
select is(
  (select count(*) from public.consent_records),
  0::bigint,
  'doctor has no blanket consent access'
);
select is_empty(
  $$
    update public.patients
    set status = 'inactive'
    where id = '30000000-0000-0000-0000-000000000001'
    returning id
  $$,
  'doctor cannot update patient records'
);
select throws_ok(
  $$
    select public.complete_patient_onboarding(
      'en',
      '1985-04-10',
      null,
      'Synthetic City',
      null,
      null,
      true,
      true
    )
  $$,
  '42501',
  'Patient onboarding is unavailable',
  'doctor cannot complete patient onboarding'
);
select lives_ok(
  $$
    select public.complete_doctor_onboarding(
      'Dr Synthetic Clinician',
      'Synthetic Medical Degree',
      'SYN-DOCTOR-1',
      'Synthetic Medical Council',
      'Synthetic State',
      'General Medicine',
      array['en', 'hi']::public.doctor_language[],
      75000,
      'Synthetic City',
      '100 Synthetic Clinic Road',
      '10000000-0000-0000-0000-000000000003/profile.webp'
    )
  $$,
  'doctor can complete own onboarding'
);
select results_eq(
  $$
    select
      full_name,
      registration_number,
      languages::text,
      teleconsultation_fee_paise,
      status::text,
      is_bookable,
      profile_photo_object_path,
      onboarding_completed_at is not null
    from public.doctors
  $$,
  $$
    values (
      'Dr Synthetic Clinician',
      'SYN-DOCTOR-1',
      '{en,hi}',
      75000,
      'pending_verification',
      false,
      '10000000-0000-0000-0000-000000000003/profile.webp',
      true
    )
  $$,
  'doctor onboarding remains pending verification and non-bookable'
);
select throws_ok(
  $$
    select public.complete_doctor_onboarding(
      'Dr Synthetic Clinician',
      'Synthetic Medical Degree',
      'SYN-DOCTOR-1',
      'Synthetic Medical Council',
      'Synthetic State',
      'General Medicine',
      array['en']::public.doctor_language[],
      null,
      null,
      null,
      null
    )
  $$,
  '42501',
  'Doctor onboarding is unavailable',
  'completed doctor onboarding cannot be replayed'
);
select throws_ok(
  $$
    select public.transition_doctor_verification(
      '50000000-0000-0000-0000-000000000003',
      'approved',
      'Self approval is forbidden.',
      '10000000-0000-0000-0000-000000000003'
    )
  $$,
  '42501',
  'permission denied for function transition_doctor_verification',
  'doctor cannot self-verify'
);

reset role;
select throws_ok(
  $$
    update public.doctors
    set is_bookable = true
    where id = '50000000-0000-0000-0000-000000000003'
  $$,
  '23514',
  null,
  'pending doctor cannot be made bookable'
);

set local role service_role;
select lives_ok(
  $$
    select public.transition_doctor_verification(
      '50000000-0000-0000-0000-000000000003',
      'approved',
      'Registration and qualification verified.',
      '10000000-0000-0000-0000-000000000004'
    )
  $$,
  'service-only admin transition can approve a pending doctor'
);
select results_eq(
  $$
    select
      status::text,
      verification_reason,
      verification_decided_at is not null,
      verification_decided_by,
      is_bookable
    from public.doctors
    where id = '50000000-0000-0000-0000-000000000003'
  $$,
  $$
    values (
      'verified',
      'Registration and qualification verified.',
      true,
      '10000000-0000-0000-0000-000000000004'::uuid,
      true
    )
  $$,
  'approval stores reason, timestamp, actor, and verified bookability'
);
select results_eq(
  $$
    select actor_user_id, action, target_type, target_id, outcome, created_at is not null
    from public.audit_events
    where action = 'doctor_verification_approved'
      and target_id = '50000000-0000-0000-0000-000000000003'
  $$,
  $$
    values (
      '10000000-0000-0000-0000-000000000004'::uuid,
      'doctor_verification_approved',
      'doctor',
      '50000000-0000-0000-0000-000000000003'::uuid,
      'success',
      true
    )
  $$,
  'verification transition appends a content-free audit event'
);
select lives_ok(
  $$
    select public.transition_doctor_verification(
      '50000000-0000-0000-0000-000000000005',
      'rejected',
      'Registration evidence could not be validated.',
      '10000000-0000-0000-0000-000000000004'
    )
  $$,
  'service-only admin transition can reject a pending doctor'
);
select results_eq(
  $$
    select
      status::text,
      verification_reason,
      verification_decided_at is not null,
      verification_decided_by,
      is_bookable
    from public.doctors
    where id = '50000000-0000-0000-0000-000000000005'
  $$,
  $$
    values (
      'rejected',
      'Registration evidence could not be validated.',
      true,
      '10000000-0000-0000-0000-000000000004'::uuid,
      false
    )
  $$,
  'rejection stores reason, timestamp, actor, and remains non-bookable'
);
select results_eq(
  $$
    select action, target_id, outcome, created_at is not null
    from public.audit_events
    where target_id = '50000000-0000-0000-0000-000000000005'
  $$,
  $$
    values (
      'doctor_verification_rejected',
      '50000000-0000-0000-0000-000000000005'::uuid,
      'success',
      true
    )
  $$,
  'rejection appends its own content-free audit event'
);
select throws_ok(
  $$
    select public.transition_doctor_verification(
      '50000000-0000-0000-0000-000000000003',
      'rejected',
      'A completed transition cannot be replayed.',
      '10000000-0000-0000-0000-000000000004'
    )
  $$,
  '22023',
  'Doctor verification transition is unavailable',
  'completed verification transition cannot be replayed'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';

select is((select count(*) from public.profiles), 1::bigint, 'operations user sees only own profile');
select is((select count(*) from public.patients), 0::bigint, 'operations client cannot read patients');
select is((select count(*) from public.doctors), 0::bigint, 'operations client cannot read doctors');
select is(
  (select count(*) from public.consent_records),
  0::bigint,
  'operations client cannot read consent records'
);
select throws_ok(
  $$ select * from public.audit_events $$,
  '42501',
  'permission denied for table audit_events',
  'operations client cannot read audit events directly'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  'permission denied for table profiles',
  'anonymous users cannot read profiles'
);

select * from finish();
rollback;
