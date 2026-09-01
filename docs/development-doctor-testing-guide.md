# Development Doctor Testing Guide

Development use only. Use synthetic identities and local Supabase data. Never use real doctor,
patient, registration, contact, or clinical information. Never put a password, Supabase key, or
other secret in this document or in SQL history.

## Prerequisites

- Application: http://localhost:3000
- Local Supabase Studio: http://127.0.0.1:54323
- Local Supabase and the Next.js application must be running.
- Public application sign-up creates patients only. Doctor and operations accounts must be
  provisioned through trusted local administration.

## 1. Create and provision a synthetic doctor

In Supabase Studio, open Authentication > Users > Add user. Create and auto-confirm a new account
using a synthetic email such as `doctor.dev@example.test` and a unique development-only password of
at least 12 characters.

Do not complete patient onboarding with this account. In Studio's SQL Editor, run:

```sql
do $$
declare
  doctor_auth_user_id uuid;
  doctor_profile_id uuid;
begin
  select id
  into doctor_auth_user_id
  from auth.users
  where lower(email) = lower('doctor.dev@example.test');

  if doctor_auth_user_id is null then
    raise exception 'Synthetic doctor auth user not found';
  end if;

  select id
  into doctor_profile_id
  from public.profiles
  where auth_user_id = doctor_auth_user_id
  for update;

  if exists (
    select 1
    from public.patients
    where profile_id = doctor_profile_id
      and onboarding_completed_at is not null
  ) then
    raise exception 'Do not convert an onboarded patient account';
  end if;

  delete from public.patients
  where profile_id = doctor_profile_id;

  update public.profiles
  set role = 'doctor', display_name = null
  where id = doctor_profile_id;

  insert into public.doctors (profile_id)
  values (doctor_profile_id);
end;
$$;
```

Sign in at http://localhost:3000/auth/login. Open
http://localhost:3000/doctor/onboarding and submit clearly synthetic professional details. Suggested
development values:

- Name: Dr Synthetic One
- Qualification: MBBS Test Credential
- Registration number: DEV-REG-001
- Council: Synthetic Medical Council
- State: Synthetic State
- Specialty: GENERAL_MEDICINE
- Languages: English and/or Hindi
- Fee: 500.00 INR
- City: Synthetic City

The account must remain `pending_verification` and non-bookable after submission.

## 2. Create and provision a synthetic operations account

In Supabase Studio, create and auto-confirm another new account such as
`operations.dev@example.test`. Do not complete patient onboarding. Run this in the SQL Editor:

```sql
do $$
declare
  operations_auth_user_id uuid;
  operations_profile_id uuid;
begin
  select id
  into operations_auth_user_id
  from auth.users
  where lower(email) = lower('operations.dev@example.test');

  if operations_auth_user_id is null then
    raise exception 'Synthetic operations auth user not found';
  end if;

  select id
  into operations_profile_id
  from public.profiles
  where auth_user_id = operations_auth_user_id
  for update;

  if exists (
    select 1
    from public.patients
    where profile_id = operations_profile_id
      and onboarding_completed_at is not null
  ) then
    raise exception 'Do not convert an onboarded patient account';
  end if;

  delete from public.patients
  where profile_id = operations_profile_id;

  update public.profiles
  set role = 'operations', display_name = null
  where id = operations_profile_id;
end;
$$;
```

## 3. Verify the doctor

1. Sign out of the doctor account.
2. Sign in as the operations account at http://localhost:3000/auth/login.
3. Open http://localhost:3000/admin/doctors.
4. Find the pending synthetic doctor.
5. Approve it with a reason such as `Synthetic credentials approved for local testing only`.

Approval must set the doctor to `verified`, make the doctor bookable, record the decision actor and
timestamp, and add a content-free audit event. A doctor cannot verify itself.

## 4. Test the doctor dashboard and appointment workflow

1. Sign in as the doctor at http://localhost:3000/auth/login.
2. Open the dashboard at http://localhost:3000/doctor.
3. Open http://localhost:3000/doctor/availability and add a future 30-minute slot.
4. In a separate browser profile or private window, create a synthetic patient through
   http://localhost:3000/auth/sign-up.
5. Complete patient onboarding using synthetic data.
6. Optionally complete an intake before booking so its structured result is attached to the
   appointment.
7. As the patient, open http://localhost:3000/patient/appointments and request the doctor's slot.
8. Return to the doctor browser and refresh http://localhost:3000/doctor.
9. Use `Today` for a slot today or `Upcoming after today` for a later slot.
10. Select `View appointment details` to test the assigned-doctor detail workflow.

The appointment initially has status `REQUESTED`. The current UI does not yet expose a dedicated
confirmation control, although authorized status-transition logic exists at the service and database
layers. Dashboard and assigned appointment-detail testing work with a requested appointment.

## Safety notes

- These SQL commands are for trusted local development administration only.
- Never expose role selection or these operations through an unauthenticated browser action.
- Never convert an account that has completed patient onboarding or contains patient data.
- Never use production credentials, production database exports, or real registration numbers.
- Keep `.env.local`, passwords, Supabase secret keys, and service-role keys out of Git and PDFs.
