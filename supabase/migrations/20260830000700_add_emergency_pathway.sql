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
      'triage_emergency_pathway_entered'
    )
  );

create unique index audit_events_emergency_pathway_once_idx
on public.audit_events (target_id, action)
where action = 'triage_emergency_pathway_entered';

create function public.enter_triage_emergency_pathway(p_triage_result_id uuid)
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
    from public.triage_results
    join public.intake_sessions
      on intake_sessions.id = triage_results.intake_session_id
    join public.patients
      on patients.id = intake_sessions.patient_id
    join public.profiles
      on profiles.id = patients.profile_id
    where triage_results.id = p_triage_result_id
      and triage_results.outcome = 'RED_FLAG'
      and profiles.auth_user_id = user_id
      and profiles.role = 'patient'
  ) then
    raise insufficient_privilege using message = 'Emergency pathway is unavailable';
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
    'triage_emergency_pathway_entered',
    'triage_result',
    p_triage_result_id,
    'success'
  )
  on conflict do nothing;
end;
$$;

revoke execute on function public.enter_triage_emergency_pathway(uuid)
from public, anon;
grant execute on function public.enter_triage_emergency_pathway(uuid)
to authenticated;

create function public.block_normal_routing_after_red_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.intake_sessions
    join public.triage_results
      on triage_results.intake_session_id = intake_sessions.id
    where intake_sessions.patient_id = new.patient_id
      and triage_results.outcome = 'RED_FLAG'
  ) then
    raise insufficient_privilege using message = 'Emergency pathway required';
  end if;
  return new;
end;
$$;

create trigger appointments_block_after_red_flag
before insert on public.appointments
for each row execute function public.block_normal_routing_after_red_flag();

create function public.block_intake_after_red_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.triage_results
    where triage_results.intake_session_id = new.intake_session_id
      and triage_results.outcome = 'RED_FLAG'
  ) then
    raise insufficient_privilege using message = 'Emergency pathway required';
  end if;
  return new;
end;
$$;

create trigger intake_messages_block_after_red_flag
before insert on public.intake_messages
for each row execute function public.block_intake_after_red_flag();

revoke execute on function public.block_normal_routing_after_red_flag()
from public, anon, authenticated, service_role;
revoke execute on function public.block_intake_after_red_flag()
from public, anon, authenticated, service_role;

comment on function public.enter_triage_emergency_pathway(uuid) is
  'Records one content-free audit event when the owning patient enters emergency guidance.';
comment on function public.block_normal_routing_after_red_flag() is
  'Database guard preventing new doctor appointment routing after a persistent red flag.';
comment on function public.block_intake_after_red_flag() is
  'Database guard stopping normal intake conversation after a persistent red flag.';
