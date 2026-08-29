create type public.profile_role as enum ('patient', 'doctor', 'operations');
create type public.patient_status as enum ('active', 'inactive');
create type public.doctor_status as enum ('pending', 'verified', 'suspended', 'rejected');
create type public.consent_type as enum (
  'terms_of_service',
  'privacy_policy',
  'data_processing',
  'care_coordination'
);
create type public.consent_status as enum ('granted', 'withdrawn');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  role public.profile_role not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) between 1 and 120
  )
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  status public.patient_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  status public.doctor_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete restrict,
  consent_type public.consent_type not null,
  status public.consent_status not null,
  policy_version text not null,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consent_records_policy_version_not_blank check (
    char_length(btrim(policy_version)) between 1 and 64
  )
);

create index patients_profile_id_idx on public.patients (profile_id);
create index doctors_profile_id_idx on public.doctors (profile_id);
create index consent_records_patient_id_idx on public.consent_records (patient_id);
create index consent_records_patient_type_created_idx
  on public.consent_records (patient_id, consent_type, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger patients_set_updated_at
before update on public.patients
for each row execute function public.set_updated_at();

create trigger doctors_set_updated_at
before update on public.doctors
for each row execute function public.set_updated_at();

create trigger consent_records_set_updated_at
before update on public.consent_records
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.doctors enable row level security;
alter table public.consent_records enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.patients from anon, authenticated;
revoke all on table public.doctors from anon, authenticated;
revoke all on table public.consent_records from anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.patients to authenticated;
grant update (status) on table public.patients to authenticated;
grant select on table public.doctors to authenticated;
grant select, insert on table public.consent_records to authenticated;

create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (auth_user_id = (select auth.uid()));

create policy "Patients can read their own patient record"
on public.patients for select
to authenticated
using (
  profile_id in (
    select profiles.id
    from public.profiles
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'patient'
  )
);

create policy "Patients can update their own patient record"
on public.patients for update
to authenticated
using (
  profile_id in (
    select profiles.id
    from public.profiles
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'patient'
  )
)
with check (
  profile_id in (
    select profiles.id
    from public.profiles
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'patient'
  )
);

create policy "Doctors can read their own doctor record"
on public.doctors for select
to authenticated
using (
  profile_id in (
    select profiles.id
    from public.profiles
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'doctor'
  )
);

create policy "Patients can read their own consent records"
on public.consent_records for select
to authenticated
using (
  patient_id in (
    select patients.id
    from public.patients
    join public.profiles on profiles.id = patients.profile_id
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'patient'
  )
);

create policy "Patients can add their own consent records"
on public.consent_records for insert
to authenticated
with check (
  patient_id in (
    select patients.id
    from public.patients
    join public.profiles on profiles.id = patients.profile_id
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'patient'
  )
);

comment on table public.consent_records is
  'Append-only patient consent decisions. Withdrawals are recorded as new rows.';
