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
      'intake_voice_session_issued'
    )
  );

create function public.record_intake_voice_session_issued(p_intake_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
begin
  if user_id is null or not exists (
    select 1
    from public.intake_sessions
    join public.patients on patients.id = intake_sessions.patient_id
    join public.profiles on profiles.id = patients.profile_id
    where intake_sessions.id = p_intake_session_id
      and intake_sessions.status = 'ACTIVE'
      and profiles.auth_user_id = user_id
      and profiles.role = 'patient'
      and patients.status = 'active'
      and patients.onboarding_completed_at is not null
      and not exists (
        select 1
        from public.triage_results
        where triage_results.intake_session_id = intake_sessions.id
          and triage_results.outcome = 'RED_FLAG'
      )
  ) then
    raise insufficient_privilege using message = 'Voice input is unavailable';
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
    'intake_voice_session_issued',
    'intake_session',
    p_intake_session_id,
    'success'
  );
end;
$$;

revoke execute on function public.record_intake_voice_session_issued(uuid)
from public, anon;
grant execute on function public.record_intake_voice_session_issued(uuid)
to authenticated;

comment on function public.record_intake_voice_session_issued(uuid) is
  'Records a content-free event after issuing voice transcription access for an authenticated patient owned active intake without a red flag.';
