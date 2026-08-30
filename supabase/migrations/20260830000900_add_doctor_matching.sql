alter table public.audit_events drop constraint audit_events_action_allowed;
alter table public.audit_events drop constraint audit_events_target_type_allowed;
alter table public.audit_events
  add constraint audit_events_action_allowed check (
    action in (
      'doctor_verification_approved',
      'doctor_verification_rejected',
      'doctor_availability_created',
      'doctor_availability_deleted',
      'appointment_requested',
      'appointment_status_transitioned',
      'intake_session_started',
      'intake_message_added',
      'intake_patient_message_added',
      'intake_assistant_turn_recorded',
      'triage_no_red_flag_recorded',
      'triage_red_flag_detected',
      'triage_emergency_pathway_entered',
      'specialty_routing_recorded',
      'doctor_match_searched'
    )
  ),
  add constraint audit_events_target_type_allowed check (
    target_type in (
      'doctor',
      'doctor_availability',
      'appointment',
      'intake_session',
      'triage_result',
      'specialty_routing_result',
      'patient'
    )
  );

drop function if exists public.find_matching_doctors(
  text,
  public.doctor_language,
  text,
  timestamptz,
  timestamptz
);

drop function if exists public.find_matching_doctors(text, timestamptz, timestamptz);

create function public.find_matching_doctors(
  p_consultation_mode text,
  p_available_from timestamptz,
  p_available_until timestamptz
)
returns table (
  doctor_id uuid,
  doctor_name text,
  qualification text,
  registration_number text,
  specialty text,
  consultation_languages public.doctor_language[],
  fee_paise integer,
  clinic_city text,
  consultation_mode text,
  routing_decision_source text,
  next_slots jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_patient_id uuid;
  actor_patient_city text;
  actor_consultation_language public.doctor_language;
  routing_specialty text;
  routing_source text;
  allowed_specialties constant text[] := array[
    'GENERAL_MEDICINE', 'PEDIATRICS', 'OBSTETRICS_GYNECOLOGY',
    'DERMATOLOGY', 'ORTHOPEDICS', 'OTORHINOLARYNGOLOGY',
    'OPHTHALMOLOGY', 'PSYCHIATRY', 'CARDIOLOGY', 'NEUROLOGY',
    'PULMONOLOGY', 'GASTROENTEROLOGY'
  ];
begin
  if user_id is null
    or p_consultation_mode is null
    or p_consultation_mode not in ('TELECONSULTATION', 'IN_PERSON')
    or p_available_from is null
    or p_available_until is null
    or p_available_until <= greatest(p_available_from, now())
    or p_available_until > p_available_from + interval '90 days'
  then
    raise invalid_parameter_value using message = 'Doctor matching criteria are invalid';
  end if;

  select patients.id, patients.city, patients.preferred_language::text::public.doctor_language
  into actor_patient_id, actor_patient_city, actor_consultation_language
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'patient'
    and patients.status = 'active'
    and patients.onboarding_completed_at is not null;

  if actor_patient_id is null then
    raise insufficient_privilege using message = 'Doctor matching is unavailable';
  end if;

  if exists (
    select 1
    from public.intake_sessions
    join public.triage_results
      on triage_results.intake_session_id = intake_sessions.id
    where intake_sessions.patient_id = actor_patient_id
      and triage_results.outcome = 'RED_FLAG'
  ) then
    raise insufficient_privilege using message = 'Emergency pathway required';
  end if;

  select
    specialty_routing_results.routing_result->>'recommended_specialty',
    specialty_routing_results.routing_result->>'decision_source'
  into routing_specialty, routing_source
  from public.specialty_routing_results
  join public.intake_sessions
    on intake_sessions.id = specialty_routing_results.intake_session_id
  where intake_sessions.patient_id = actor_patient_id
  order by specialty_routing_results.created_at desc, specialty_routing_results.id desc
  limit 1;

  if routing_specialty is null
    or routing_specialty <> all(allowed_specialties)
    or routing_source not in ('AI', 'DETERMINISTIC_FALLBACK')
  then
    raise invalid_parameter_value using message = 'Routing is unavailable';
  end if;

  insert into public.audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome
  )
  values (
    user_id,
    'doctor_match_searched',
    'patient',
    actor_patient_id,
    'success'
  );

  return query
  select
    doctors.id,
    doctors.full_name,
    doctors.qualification,
    doctors.registration_number,
    routing_specialty,
    doctors.languages,
    doctors.teleconsultation_fee_paise,
    case
      when p_consultation_mode = 'IN_PERSON' then doctors.clinic_city
      else null
    end,
    p_consultation_mode,
    routing_source,
    next_slots.slots
  from public.doctors
  cross join lateral (
    select
      jsonb_agg(
        jsonb_build_object(
          'id', available_slots.id,
          'startsAt', available_slots.starts_at,
          'endsAt', available_slots.ends_at
        )
        order by available_slots.starts_at, available_slots.id
      ) as slots,
      min(available_slots.starts_at) as earliest_start
    from (
      select availability.id, availability.starts_at, availability.ends_at
      from public.doctor_availability as availability
      where availability.doctor_id = doctors.id
        and availability.starts_at >= greatest(p_available_from, now())
        and availability.starts_at < p_available_until
        and not exists (
          select 1
          from public.appointments
          where appointments.doctor_availability_id = availability.id
            and appointments.status in ('REQUESTED', 'CONFIRMED', 'IN_PROGRESS')
        )
      order by availability.starts_at, availability.id
      limit 3
    ) as available_slots
  ) as next_slots
  where doctors.status = 'verified'
    and doctors.is_bookable
    and doctors.onboarding_completed_at is not null
    and next_slots.slots is not null
    and actor_consultation_language = any(doctors.languages)
    and upper(regexp_replace(btrim(doctors.specialty), '[^[:alnum:]]+', '_', 'g')) = routing_specialty
    and (
      p_consultation_mode = 'TELECONSULTATION'
      or (
        doctors.clinic_city is not null
        and lower(btrim(doctors.clinic_city)) = lower(btrim(actor_patient_city))
      )
    )
  order by next_slots.earliest_start, doctors.id
  limit 5;
end;
$$;

revoke execute on function public.find_matching_doctors(
  text,
  timestamptz,
  timestamptz
) from public, anon;
grant execute on function public.find_matching_doctors(
  text,
  timestamptz,
  timestamptz
) to authenticated;

comment on function public.find_matching_doctors(
  text,
  timestamptz,
  timestamptz
) is
  'Returns at most five verified, bookable doctors with three open slots. Specialty, language, and city are derived from owned patient/routing data; ranking uses availability and stable ID only.';
