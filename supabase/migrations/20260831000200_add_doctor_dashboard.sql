alter table public.intake_sessions
  add constraint intake_sessions_id_patient_unique unique (id, patient_id);

alter table public.appointments
  add column intake_session_id uuid,
  add constraint appointments_intake_belongs_to_patient foreign key (
    intake_session_id,
    patient_id
  ) references public.intake_sessions (id, patient_id) on delete restrict;

create index appointments_intake_session_idx
on public.appointments (intake_session_id)
where intake_session_id is not null;

create or replace function public.enforce_appointment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.doctor_availability_id,
    new.doctor_id,
    new.patient_id,
    new.starts_at,
    new.ends_at,
    new.intake_session_id
  ) is distinct from (
    old.doctor_availability_id,
    old.doctor_id,
    old.patient_id,
    old.starts_at,
    old.ends_at,
    old.intake_session_id
  ) then
    raise check_violation using message = 'Appointment participants and schedule are immutable';
  end if;

  if new.status is distinct from old.status
    and not (
      (old.status = 'REQUESTED'
        and new.status in ('CONFIRMED', 'CANCELLED', 'REQUIRES_IN_PERSON'))
      or (old.status = 'CONFIRMED'
        and new.status in ('CANCELLED', 'IN_PROGRESS', 'NO_SHOW', 'REQUIRES_IN_PERSON'))
      or (old.status = 'IN_PROGRESS'
        and new.status in ('COMPLETED', 'REQUIRES_IN_PERSON'))
    )
  then
    raise check_violation using message = 'Invalid appointment status transition';
  end if;

  return new;
end;
$$;

create function public.attach_latest_intake_to_appointment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.intake_session_id is null then
    select intake_sessions.id
    into new.intake_session_id
    from public.intake_sessions
    where intake_sessions.patient_id = new.patient_id
      and intake_sessions.status <> 'ABANDONED'
    order by intake_sessions.created_at desc, intake_sessions.id desc
    limit 1;
  end if;

  return new;
end;
$$;

create trigger appointments_attach_latest_intake
before insert on public.appointments
for each row execute function public.attach_latest_intake_to_appointment();

revoke execute on function public.attach_latest_intake_to_appointment()
from public, anon, authenticated;

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
      'doctor_dashboard_viewed'
    )
  );

create function public.list_doctor_dashboard_appointments(
  p_from timestamptz,
  p_until timestamptz,
  p_status public.appointment_status,
  p_limit integer,
  p_offset integer
)
returns table (
  appointment_id uuid,
  patient_display_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  patient_language public.preferred_language,
  appointment_status public.appointment_status,
  intake_state text,
  urgency text,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_doctor_id uuid;
begin
  if user_id is null
    or p_from is null
    or p_until is null
    or p_until <= p_from
    or p_until > p_from + interval '1 year 1 day'
    or p_limit is null
    or p_offset is null
    or p_limit not between 1 and 25
    or p_offset not between 0 and 10000
  then
    raise invalid_parameter_value using message = 'Doctor dashboard is unavailable';
  end if;

  select doctors.id
  into actor_doctor_id
  from public.doctors
  join public.profiles on profiles.id = doctors.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'doctor';

  if actor_doctor_id is null then
    raise insufficient_privilege using message = 'Doctor dashboard is unavailable';
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
    'doctor_dashboard_viewed',
    'doctor',
    actor_doctor_id,
    'success'
  );

  return query
  select
    appointments.id,
    coalesce(nullif(btrim(patient_profiles.display_name), ''), 'Patient'),
    appointments.starts_at,
    appointments.ends_at,
    patients.preferred_language,
    appointments.status,
    case
      when intake_sessions.id is null then 'NOT_STARTED'
      when intake_sessions.status = 'ACTIVE' then 'IN_PROGRESS'
      when intake_sessions.status = 'COMPLETED' then 'COMPLETED'
      else 'INCOMPLETE'
    end,
    coalesce(latest_routing.urgency, 'NOT_ASSESSED'),
    count(*) over ()
  from public.appointments
  join public.patients on patients.id = appointments.patient_id
  join public.profiles as patient_profiles on patient_profiles.id = patients.profile_id
  left join public.intake_sessions on intake_sessions.id = appointments.intake_session_id
  left join lateral (
    select specialty_routing_results.routing_result->>'urgency' as urgency
    from public.specialty_routing_results
    where specialty_routing_results.intake_session_id = intake_sessions.id
      and specialty_routing_results.routing_result->>'urgency' in (
        'ROUTINE', 'SOON', 'URGENT', 'EMERGENCY'
      )
    order by specialty_routing_results.created_at desc,
      specialty_routing_results.id desc
    limit 1
  ) as latest_routing on true
  where appointments.doctor_id = actor_doctor_id
    and appointments.starts_at >= p_from
    and appointments.starts_at < p_until
    and (p_status is null or appointments.status = p_status)
  order by appointments.starts_at, appointments.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke execute on function public.list_doctor_dashboard_appointments(
  timestamptz,
  timestamptz,
  public.appointment_status,
  integer,
  integer
) from public, anon;
grant execute on function public.list_doctor_dashboard_appointments(
  timestamptz,
  timestamptz,
  public.appointment_status,
  integer,
  integer
) to authenticated;

comment on column public.appointments.intake_session_id is
  'The patient intake associated at booking time; null when no intake was available.';
comment on function public.list_doctor_dashboard_appointments(
  timestamptz,
  timestamptz,
  public.appointment_status,
  integer,
  integer
) is
  'Returns a paginated minimum-data appointment projection only for the authenticated doctor and records content-free access auditing.';
