alter table public.audit_events drop constraint audit_events_action_allowed;
alter table public.audit_events
  add constraint audit_events_action_allowed check (
    action in (
      'doctor_verification_approved', 'doctor_verification_rejected',
      'doctor_availability_created', 'doctor_availability_deleted',
      'appointment_requested', 'appointment_status_transitioned',
      'intake_session_started', 'intake_message_added',
      'intake_patient_message_added', 'intake_assistant_turn_recorded',
      'triage_no_red_flag_recorded', 'triage_red_flag_detected',
      'triage_emergency_pathway_entered', 'specialty_routing_recorded',
      'doctor_match_searched', 'intake_voice_session_issued',
      'doctor_dashboard_viewed', 'doctor_appointment_detail_viewed',
      'doctor_appointment_transcript_viewed',
      'doctor_handoff_source_accessed', 'doctor_handoff_generated',
      'doctor_handoff_viewed', 'doctor_handoff_marked_inaccurate',
      'appointment_video_token_issued'
    )
  );

create function public.authorize_appointment_video_token(p_appointment_id uuid)
returns table (participant_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  authorized_role text;
begin
  select case
    when patient_profiles.auth_user_id = user_id
      and patient_profiles.role = 'patient' then 'patient'
    when doctor_profiles.auth_user_id = user_id
      and doctor_profiles.role = 'doctor' then 'doctor'
    else null
  end
  into authorized_role
  from public.appointments
  join public.patients on patients.id = appointments.patient_id
  join public.profiles as patient_profiles
    on patient_profiles.id = patients.profile_id
  join public.doctors on doctors.id = appointments.doctor_id
  join public.profiles as doctor_profiles
    on doctor_profiles.id = doctors.profile_id
  where appointments.id = p_appointment_id
    and appointments.status in ('CONFIRMED', 'IN_PROGRESS');

  if authorized_role is null then
    raise insufficient_privilege using message = 'Video consultation is unavailable';
  end if;

  insert into public.audit_events (
    actor_user_id, action, target_type, target_id, outcome
  ) values (
    user_id, 'appointment_video_token_issued', 'appointment',
    p_appointment_id, 'success'
  );

  return query select authorized_role;
end;
$$;

revoke execute on function public.authorize_appointment_video_token(uuid)
from public, anon;
grant execute on function public.authorize_appointment_video_token(uuid)
to authenticated;

comment on function public.authorize_appointment_video_token(uuid) is
  'Authorizes only the assigned patient or doctor for confirmed/in-progress appointment video and records a content-free audit event.';
