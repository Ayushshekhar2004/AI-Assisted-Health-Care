create or replace function public.record_safe_care_guidance(
  p_actor_user_id uuid,
  p_intake_session_id uuid,
  p_guidance jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_patient_id uuid;
  result_id uuid;
  guidance_disposition text := p_guidance->>'disposition';
begin
  select patients.id
  into actor_patient_id
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = p_actor_user_id
    and profiles.role = 'patient'
    and patients.onboarding_completed_at is not null;

  if actor_patient_id is null
    or p_guidance is null
    or jsonb_typeof(p_guidance) <> 'object'
    or pg_column_size(p_guidance) > 32768
    or not exists (
      select 1 from public.intake_sessions
      where intake_sessions.id = p_intake_session_id
        and intake_sessions.patient_id = actor_patient_id
        and intake_sessions.status = 'COMPLETED'
    )
    or exists (
      select 1 from public.appointments
      where appointments.intake_session_id = p_intake_session_id
        and appointments.patient_id = actor_patient_id
        and appointments.status not in ('REQUESTED','CONFIRMED')
    )
    or (
      exists (
        select 1 from public.triage_results
        where triage_results.intake_session_id = p_intake_session_id
          and triage_results.outcome = 'RED_FLAG'
      )
      and guidance_disposition <> 'EMERGENCY'
    )
  then
    raise insufficient_privilege using message = 'Safe care guidance is unavailable';
  end if;

  insert into public.safe_care_guidance_results (
    intake_session_id,
    patient_id,
    symptom_category,
    disposition,
    language,
    library_version,
    guidance_snapshot
  ) values (
    p_intake_session_id,
    actor_patient_id,
    p_guidance->>'symptom_category',
    guidance_disposition,
    (p_guidance->>'language')::public.preferred_language,
    p_guidance->>'library_version',
    p_guidance
  )
  on conflict (intake_session_id) do update
  set guidance_snapshot = safe_care_guidance_results.guidance_snapshot
  returning id into result_id;

  insert into public.audit_events (
    actor_user_id, action, target_type, target_id, outcome
  ) values (
    p_actor_user_id, 'safe_care_guidance_recorded', 'safe_care_guidance', result_id, 'success'
  );

  return result_id;
end;
$$;

revoke execute on function public.record_safe_care_guidance(uuid, uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.record_safe_care_guidance(uuid, uuid, jsonb)
to service_role;

comment on function public.record_safe_care_guidance(uuid, uuid, jsonb) is
  'Service-only idempotent persistence after patient ownership, completed intake, pre-response state, and red-flag checks.';
