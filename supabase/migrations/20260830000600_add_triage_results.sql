create type public.triage_outcome as enum ('NO_RED_FLAG', 'RED_FLAG');

create table public.triage_results (
  id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null
    references public.intake_sessions (id) on delete restrict,
  rule_set_version text not null,
  outcome public.triage_outcome not null,
  matched_rule_codes text[] not null default '{}',
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint triage_results_rule_set_version_valid check (
    char_length(btrim(rule_set_version)) between 1 and 64
    and rule_set_version ~ '^[a-z0-9][a-z0-9._-]*$'
  ),
  constraint triage_results_matched_codes_bounded check (
    cardinality(matched_rule_codes) <= 100
    and array_position(matched_rule_codes, null) is null
  ),
  constraint triage_results_outcome_consistent check (
    (outcome = 'RED_FLAG' and cardinality(matched_rule_codes) > 0)
    or (outcome = 'NO_RED_FLAG' and cardinality(matched_rule_codes) = 0)
  )
);

create index triage_results_session_evaluated_idx
on public.triage_results (intake_session_id, evaluated_at desc);

create index triage_results_open_red_flag_idx
on public.triage_results (intake_session_id, evaluated_at desc)
where outcome = 'RED_FLAG';

create trigger triage_results_set_updated_at
before update on public.triage_results
for each row execute function public.set_updated_at();

alter table public.triage_results enable row level security;

revoke all on table public.triage_results from anon, authenticated, service_role;
grant select on table public.triage_results to authenticated;

create policy "Patients can read their own triage results"
on public.triage_results for select
to authenticated
using (
  intake_session_id in (
    select intake_sessions.id
    from public.intake_sessions
  )
);

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
      'triage_red_flag_detected'
    )
  ),
  add constraint audit_events_target_type_allowed check (
    target_type in (
      'doctor',
      'doctor_availability',
      'appointment',
      'intake_session',
      'triage_result'
    )
  );

create function public.record_triage_result(
  p_actor_user_id uuid,
  p_intake_session_id uuid,
  p_rule_set_version text,
  p_outcome public.triage_outcome,
  p_matched_rule_codes text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_patient_id uuid;
  result_id uuid;
  audit_action text;
begin
  if p_rule_set_version is null
    or char_length(btrim(p_rule_set_version)) not between 1 and 64
    or btrim(p_rule_set_version) !~ '^[a-z0-9][a-z0-9._-]*$'
    or p_matched_rule_codes is null
    or cardinality(p_matched_rule_codes) > 100
    or array_position(p_matched_rule_codes, null) is not null
    or exists (
      select 1
      from unnest(p_matched_rule_codes) as code
      where code !~ '^[A-Z][A-Z0-9_]{0,79}$'
    )
    or (
      p_outcome = 'RED_FLAG'
      and cardinality(p_matched_rule_codes) = 0
    )
    or (
      p_outcome = 'NO_RED_FLAG'
      and cardinality(p_matched_rule_codes) <> 0
    )
  then
    raise check_violation using message = 'Triage result is invalid';
  end if;

  select patients.id
  into actor_patient_id
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = p_actor_user_id
    and profiles.role = 'patient'
    and patients.status = 'active';

  if actor_patient_id is null then
    raise insufficient_privilege using message = 'Triage is unavailable';
  end if;

  perform 1
  from public.intake_sessions
  where intake_sessions.id = p_intake_session_id
    and intake_sessions.patient_id = actor_patient_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'Triage is unavailable';
  end if;

  if p_outcome = 'NO_RED_FLAG' and exists (
    select 1
    from public.triage_results
    where triage_results.intake_session_id = p_intake_session_id
      and triage_results.outcome = 'RED_FLAG'
  ) then
    raise check_violation using message = 'Red-flag escalation must remain active';
  end if;

  insert into public.triage_results (
    intake_session_id,
    rule_set_version,
    outcome,
    matched_rule_codes
  )
  values (
    p_intake_session_id,
    btrim(p_rule_set_version),
    p_outcome,
    p_matched_rule_codes
  )
  returning id into result_id;

  audit_action := case p_outcome
    when 'RED_FLAG' then 'triage_red_flag_detected'
    else 'triage_no_red_flag_recorded'
  end;

  insert into public.audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome
  )
  values (
    p_actor_user_id,
    audit_action,
    'triage_result',
    result_id,
    'success'
  );

  return result_id;
end;
$$;

revoke execute on function public.record_triage_result(
  uuid,
  uuid,
  text,
  public.triage_outcome,
  text[]
) from public, anon, authenticated;
grant execute on function public.record_triage_result(
  uuid,
  uuid,
  text,
  public.triage_outcome,
  text[]
) to service_role;

comment on table public.triage_results is
  'Versioned deterministic triage outcomes. Stores rule codes only, never raw intake content.';
comment on function public.record_triage_result(
  uuid,
  uuid,
  text,
  public.triage_outcome,
  text[]
) is
  'Service-only triage persistence that verifies patient ownership, audits the result, and cannot clear a prior red flag.';
