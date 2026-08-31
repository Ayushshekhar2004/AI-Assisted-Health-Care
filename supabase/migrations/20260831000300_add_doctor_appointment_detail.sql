alter table public.audit_events drop constraint audit_events_action_allowed;
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
      'doctor_match_searched',
      'intake_voice_session_issued',
      'doctor_dashboard_viewed',
      'doctor_appointment_detail_viewed',
      'doctor_appointment_transcript_viewed'
    )
  );

create function public.get_doctor_appointment_detail(p_appointment_id uuid)
returns table (
  appointment_id uuid,
  patient_display_name text,
  patient_age_years integer,
  patient_gender public.patient_gender,
  patient_city text,
  patient_language public.preferred_language,
  starts_at timestamptz,
  ends_at timestamptz,
  appointment_status public.appointment_status,
  intake_state text,
  structured_data jsonb,
  triage_outcome public.triage_outcome,
  matched_rule_codes text[],
  triage_rule_set_version text,
  triage_evaluated_at timestamptz,
  routing_result jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_doctor_id uuid;
begin
  select doctors.id
  into actor_doctor_id
  from public.doctors
  join public.profiles on profiles.id = doctors.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'doctor';

  if p_appointment_id is null
    or actor_doctor_id is null
    or not exists (
      select 1
      from public.appointments
      where appointments.id = p_appointment_id
        and appointments.doctor_id = actor_doctor_id
    )
  then
    raise insufficient_privilege using message = 'Appointment detail is unavailable';
  end if;

  insert into public.audit_events (
    actor_user_id, action, target_type, target_id, outcome
  ) values (
    user_id,
    'doctor_appointment_detail_viewed',
    'appointment',
    p_appointment_id,
    'success'
  );

  return query
  select
    appointments.id,
    coalesce(nullif(btrim(patient_profiles.display_name), ''), 'Patient'),
    extract(year from age(current_date, patients.date_of_birth))::integer,
    patients.gender,
    patients.city,
    patients.preferred_language,
    appointments.starts_at,
    appointments.ends_at,
    appointments.status,
    case
      when intake_sessions.id is null then 'NOT_STARTED'
      when intake_sessions.status = 'ACTIVE' then 'IN_PROGRESS'
      when intake_sessions.status = 'COMPLETED' then 'COMPLETED'
      else 'INCOMPLETE'
    end,
    intake_structured.structured_data,
    latest_triage.outcome,
    coalesce(latest_triage.matched_rule_codes, '{}'::text[]),
    latest_triage.rule_set_version,
    latest_triage.evaluated_at,
    latest_routing.routing_result
  from public.appointments
  join public.patients on patients.id = appointments.patient_id
  join public.profiles as patient_profiles on patient_profiles.id = patients.profile_id
  left join public.intake_sessions on intake_sessions.id = appointments.intake_session_id
  left join public.intake_structured
    on intake_structured.intake_session_id = intake_sessions.id
  left join lateral (
    select
      triage_results.outcome,
      triage_results.matched_rule_codes,
      triage_results.rule_set_version,
      triage_results.evaluated_at
    from public.triage_results
    where triage_results.intake_session_id = intake_sessions.id
    order by triage_results.evaluated_at desc, triage_results.id desc
    limit 1
  ) as latest_triage on true
  left join lateral (
    select jsonb_build_object(
      'recommended_specialty', specialty_routing_results.routing_result->'recommended_specialty',
      'alternate_specialty', specialty_routing_results.routing_result->'alternate_specialty',
      'urgency', specialty_routing_results.routing_result->'urgency',
      'rationale_for_doctor', specialty_routing_results.routing_result->'rationale_for_doctor',
      'missing_information', specialty_routing_results.routing_result->'missing_information',
      'decision_source', specialty_routing_results.routing_result->'decision_source',
      'fallback_reasons', specialty_routing_results.routing_result->'fallback_reasons'
    ) as routing_result
    from public.specialty_routing_results
    where specialty_routing_results.intake_session_id = intake_sessions.id
    order by specialty_routing_results.created_at desc,
      specialty_routing_results.id desc
    limit 1
  ) as latest_routing on true
  where appointments.id = p_appointment_id
    and appointments.doctor_id = actor_doctor_id;
end;
$$;

create function public.get_doctor_appointment_transcript(p_appointment_id uuid)
returns table (
  message_id uuid,
  message_role public.intake_message_role,
  text_content text,
  created_at timestamptz,
  sequence_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_doctor_id uuid;
  associated_intake_session_id uuid;
begin
  select doctors.id
  into actor_doctor_id
  from public.doctors
  join public.profiles on profiles.id = doctors.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'doctor';

  select appointments.intake_session_id
  into associated_intake_session_id
  from public.appointments
  where appointments.id = p_appointment_id
    and appointments.doctor_id = actor_doctor_id;

  if p_appointment_id is null
    or actor_doctor_id is null
    or not found
  then
    raise insufficient_privilege using message = 'Appointment transcript is unavailable';
  end if;

  insert into public.audit_events (
    actor_user_id, action, target_type, target_id, outcome
  ) values (
    user_id,
    'doctor_appointment_transcript_viewed',
    'appointment',
    p_appointment_id,
    'success'
  );

  if associated_intake_session_id is null then
    return;
  end if;

  return query
  select
    intake_messages.id,
    intake_messages.role,
    intake_messages.text_content,
    intake_messages.created_at,
    intake_messages.sequence_number
  from public.intake_messages
  where intake_messages.intake_session_id = associated_intake_session_id
  order by intake_messages.sequence_number;
end;
$$;

revoke execute on function public.get_doctor_appointment_detail(uuid)
from public, anon;
grant execute on function public.get_doctor_appointment_detail(uuid)
to authenticated;

revoke execute on function public.get_doctor_appointment_transcript(uuid)
from public, anon;
grant execute on function public.get_doctor_appointment_transcript(uuid)
to authenticated;

comment on function public.get_doctor_appointment_detail(uuid) is
  'Returns a minimum appointment-linked patient and clinical summary only to the assigned authenticated doctor, with content-free auditing.';
comment on function public.get_doctor_appointment_transcript(uuid) is
  'Returns visible intake messages only for an appointment assigned to the authenticated doctor, after an explicit separately audited request.';
