create type public.preferred_language as enum ('en', 'hi');
create type public.patient_gender as enum ('woman', 'man', 'non_binary', 'prefer_not_to_say');

alter type public.consent_type add value if not exists 'teleconsultation';
alter type public.consent_type add value if not exists 'intake_processing';

alter table public.patients
  add column preferred_language public.preferred_language,
  add column date_of_birth date,
  add column gender public.patient_gender,
  add column city text,
  add column emergency_contact_name text,
  add column emergency_contact_phone text,
  add column onboarding_completed_at timestamptz,
  add constraint patients_date_of_birth_not_future check (
    date_of_birth is null or date_of_birth <= current_date
  ),
  add constraint patients_date_of_birth_supported_range check (
    date_of_birth is null or date_of_birth >= date '1900-01-01'
  ),
  add constraint patients_city_length check (
    city is null or char_length(btrim(city)) between 1 and 120
  ),
  add constraint patients_emergency_contact_name_length check (
    emergency_contact_name is null
    or char_length(btrim(emergency_contact_name)) between 1 and 120
  ),
  add constraint patients_emergency_contact_phone_format check (
    emergency_contact_phone is null
    or emergency_contact_phone ~ '^\+[1-9][0-9]{7,14}$'
  ),
  add constraint patients_emergency_contact_complete check (
    (emergency_contact_name is null) = (emergency_contact_phone is null)
  ),
  add constraint patients_onboarding_fields_complete check (
    onboarding_completed_at is null
    or (
      preferred_language is not null
      and date_of_birth is not null
      and city is not null
    )
  );

create function public.complete_patient_onboarding(
  p_preferred_language public.preferred_language,
  p_date_of_birth date,
  p_gender public.patient_gender,
  p_city text,
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_teleconsultation_consent boolean,
  p_intake_processing_consent boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_record_id uuid;
begin
  if (select auth.uid()) is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  if p_teleconsultation_consent is distinct from true
    or p_intake_processing_consent is distinct from true
  then
    raise check_violation using message = 'Required consent was not granted';
  end if;

  if p_date_of_birth is null
    or p_date_of_birth > current_date
    or p_date_of_birth < current_date - interval '120 years'
  then
    raise check_violation using message = 'Date of birth is outside the supported range';
  end if;

  if p_preferred_language is null then
    raise check_violation using message = 'Preferred language is required';
  end if;

  if p_city is null or char_length(btrim(p_city)) not between 1 and 120 then
    raise check_violation using message = 'City is invalid';
  end if;

  if (p_emergency_contact_name is null) <> (p_emergency_contact_phone is null) then
    raise check_violation using message = 'Emergency contact is incomplete';
  end if;

  if p_emergency_contact_name is not null
    and char_length(btrim(p_emergency_contact_name)) not between 1 and 120
  then
    raise check_violation using message = 'Emergency contact name is invalid';
  end if;

  if p_emergency_contact_phone is not null
    and p_emergency_contact_phone !~ '^\+[1-9][0-9]{7,14}$'
  then
    raise check_violation using message = 'Emergency contact phone is invalid';
  end if;

  select patients.id
  into patient_record_id
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = (select auth.uid())
    and profiles.role = 'patient'
    and patients.onboarding_completed_at is null
  for update of patients;

  if patient_record_id is null then
    raise insufficient_privilege using message = 'Patient onboarding is unavailable';
  end if;

  update public.patients
  set
    preferred_language = p_preferred_language,
    date_of_birth = p_date_of_birth,
    gender = p_gender,
    city = btrim(p_city),
    emergency_contact_name = nullif(btrim(p_emergency_contact_name), ''),
    emergency_contact_phone = nullif(btrim(p_emergency_contact_phone), ''),
    onboarding_completed_at = now()
  where id = patient_record_id;

  insert into public.consent_records (
    patient_id,
    consent_type,
    status,
    policy_version,
    effective_at
  )
  values
    (
      patient_record_id,
      'teleconsultation',
      'granted',
      'teleconsultation-v1',
      now()
    ),
    (
      patient_record_id,
      'intake_processing',
      'granted',
      'intake-processing-v1',
      now()
    );
end;
$$;

revoke execute on function public.complete_patient_onboarding(
  public.preferred_language,
  date,
  public.patient_gender,
  text,
  text,
  text,
  boolean,
  boolean
) from public, anon;

grant execute on function public.complete_patient_onboarding(
  public.preferred_language,
  date,
  public.patient_gender,
  text,
  text,
  text,
  boolean,
  boolean
) to authenticated;

comment on function public.complete_patient_onboarding(
  public.preferred_language,
  date,
  public.patient_gender,
  text,
  text,
  text,
  boolean,
  boolean
) is
  'Atomically stores a patient onboarding record and separate versioned consent decisions.';
