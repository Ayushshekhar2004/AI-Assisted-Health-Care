alter type public.doctor_status rename value 'pending' to 'pending_verification';

create type public.doctor_language as enum ('en', 'hi');

alter table public.doctors
  add column full_name text,
  add column qualification text,
  add column registration_number text,
  add column registration_council text,
  add column registration_state text,
  add column specialty text,
  add column languages public.doctor_language[],
  add column teleconsultation_fee_paise integer,
  add column clinic_city text,
  add column clinic_address text,
  add column profile_photo_object_path text,
  add column onboarding_completed_at timestamptz,
  add column is_bookable boolean not null default false,
  add constraint doctors_full_name_length check (
    full_name is null or char_length(btrim(full_name)) between 2 and 120
  ),
  add constraint doctors_qualification_length check (
    qualification is null or char_length(btrim(qualification)) between 2 and 160
  ),
  add constraint doctors_registration_number_format check (
    registration_number is null or registration_number ~ '^[A-Za-z0-9./ -]{2,80}$'
  ),
  add constraint doctors_registration_council_length check (
    registration_council is null
    or char_length(btrim(registration_council)) between 2 and 120
  ),
  add constraint doctors_registration_state_length check (
    registration_state is null or char_length(btrim(registration_state)) between 2 and 120
  ),
  add constraint doctors_specialty_length check (
    specialty is null or char_length(btrim(specialty)) between 2 and 120
  ),
  add constraint doctors_languages_count check (
    languages is null or cardinality(languages) between 1 and 2
  ),
  add constraint doctors_languages_unique check (
    languages is null
    or (
      cardinality(array_positions(languages, 'en'::public.doctor_language)) <= 1
      and cardinality(array_positions(languages, 'hi'::public.doctor_language)) <= 1
    )
  ),
  add constraint doctors_fee_range check (
    teleconsultation_fee_paise is null
    or teleconsultation_fee_paise between 0 and 100000000
  ),
  add constraint doctors_clinic_city_length check (
    clinic_city is null or char_length(btrim(clinic_city)) between 1 and 120
  ),
  add constraint doctors_clinic_address_length check (
    clinic_address is null or char_length(btrim(clinic_address)) between 1 and 500
  ),
  add constraint doctors_profile_photo_path_private check (
    profile_photo_object_path is null
    or (
      char_length(profile_photo_object_path) between 3 and 255
      and profile_photo_object_path not like '/%'
      and profile_photo_object_path not like '%://%'
    )
  ),
  add constraint doctors_onboarding_fields_complete check (
    onboarding_completed_at is null
    or (
      full_name is not null
      and qualification is not null
      and registration_number is not null
      and registration_council is not null
      and registration_state is not null
      and specialty is not null
      and languages is not null
    )
  ),
  add constraint doctors_verified_before_bookable check (
    not is_bookable or status = 'verified'
  );

create unique index doctors_registration_identity_idx
on public.doctors (lower(registration_council), lower(registration_number))
where registration_council is not null and registration_number is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'doctor-profile-photos',
  'doctor-profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Doctors can upload their own profile photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'doctor-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.profiles
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'doctor'
  )
);

create policy "Doctors can read their own profile photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'doctor-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.profiles
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'doctor'
  )
);

create policy "Doctors can delete their own profile photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'doctor-profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.profiles
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'doctor'
  )
);

create function public.complete_doctor_onboarding(
  p_full_name text,
  p_qualification text,
  p_registration_number text,
  p_registration_council text,
  p_registration_state text,
  p_specialty text,
  p_languages public.doctor_language[],
  p_teleconsultation_fee_paise integer,
  p_clinic_city text,
  p_clinic_address text,
  p_profile_photo_object_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  doctor_record_id uuid;
  user_id uuid := (select auth.uid());
begin
  if user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  if p_full_name is null or char_length(btrim(p_full_name)) not between 2 and 120
    or p_qualification is null or char_length(btrim(p_qualification)) not between 2 and 160
    or p_registration_number is null
    or p_registration_number !~ '^[A-Za-z0-9./ -]{2,80}$'
    or p_registration_council is null
    or char_length(btrim(p_registration_council)) not between 2 and 120
    or p_registration_state is null
    or char_length(btrim(p_registration_state)) not between 2 and 120
    or p_specialty is null
    or char_length(btrim(p_specialty)) not between 2 and 120
  then
    raise check_violation using message = 'Doctor onboarding fields are invalid';
  end if;

  if p_languages is null
    or cardinality(p_languages) not between 1 and 2
    or cardinality(p_languages) <> (
      select count(distinct language) from unnest(p_languages) as language
    )
  then
    raise check_violation using message = 'Doctor languages are invalid';
  end if;

  if p_teleconsultation_fee_paise is not null
    and p_teleconsultation_fee_paise not between 0 and 100000000
  then
    raise check_violation using message = 'Teleconsultation fee is invalid';
  end if;

  if p_clinic_city is not null
    and char_length(btrim(p_clinic_city)) not between 1 and 120
  then
    raise check_violation using message = 'Clinic city is invalid';
  end if;

  if p_clinic_address is not null
    and char_length(btrim(p_clinic_address)) not between 1 and 500
  then
    raise check_violation using message = 'Clinic address is invalid';
  end if;

  if p_profile_photo_object_path is not null
    and (
      p_profile_photo_object_path not like user_id::text || '/%'
      or p_profile_photo_object_path like '%://%'
      or char_length(p_profile_photo_object_path) > 255
    )
  then
    raise check_violation using message = 'Profile photo path is invalid';
  end if;

  select doctors.id
  into doctor_record_id
  from public.doctors
  join public.profiles on profiles.id = doctors.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'doctor'
    and doctors.onboarding_completed_at is null
  for update of doctors;

  if doctor_record_id is null then
    raise insufficient_privilege using message = 'Doctor onboarding is unavailable';
  end if;

  update public.doctors
  set
    full_name = btrim(p_full_name),
    qualification = btrim(p_qualification),
    registration_number = btrim(p_registration_number),
    registration_council = btrim(p_registration_council),
    registration_state = btrim(p_registration_state),
    specialty = btrim(p_specialty),
    languages = p_languages,
    teleconsultation_fee_paise = p_teleconsultation_fee_paise,
    clinic_city = nullif(btrim(p_clinic_city), ''),
    clinic_address = nullif(btrim(p_clinic_address), ''),
    profile_photo_object_path = p_profile_photo_object_path,
    onboarding_completed_at = now(),
    status = 'pending_verification',
    is_bookable = false
  where id = doctor_record_id;
end;
$$;

revoke execute on function public.complete_doctor_onboarding(
  text,
  text,
  text,
  text,
  text,
  text,
  public.doctor_language[],
  integer,
  text,
  text,
  text
) from public, anon;

grant execute on function public.complete_doctor_onboarding(
  text,
  text,
  text,
  text,
  text,
  text,
  public.doctor_language[],
  integer,
  text,
  text,
  text
) to authenticated;

comment on function public.complete_doctor_onboarding(
  text,
  text,
  text,
  text,
  text,
  text,
  public.doctor_language[],
  integer,
  text,
  text,
  text
) is
  'Stores private doctor onboarding fields and enforces pending, non-bookable status.';
