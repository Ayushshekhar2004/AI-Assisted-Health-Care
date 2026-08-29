begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

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
  );

select is(
  (
    select count(*)
    from public.profiles
    where auth_user_id in (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000004'
    )
      and role = 'patient'
  ),
  4::bigint,
  'new auth users are provisioned as patients only'
);

delete from public.profiles
where auth_user_id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004'
);

insert into public.profiles (id, auth_user_id, role)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'patient'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'patient'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'doctor'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'operations');

insert into public.patients (id, profile_id)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');

insert into public.doctors (id, profile_id, status)
values (
  '50000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000003',
  'verified'
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

select results_eq(
  $$
    insert into public.consent_records (patient_id, consent_type, status, policy_version)
    values (
      '30000000-0000-0000-0000-000000000001',
      'privacy_policy',
      'granted',
      'synthetic-v1'
    )
    returning status::text
  $$,
  $$ values ('granted') $$,
  'patient can append own consent decision'
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
  'new row violates row-level security policy for table "consent_records"',
  'patient cannot append consent for another patient'
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
