create function public.is_valid_emergency_screening_answers(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null or jsonb_typeof(value) <> 'array' then false
    when jsonb_array_length(value) <> 9 then false
    else
      not exists (
        select 1
        from jsonb_array_elements(value) as answer
        where jsonb_typeof(answer) <> 'object'
          or not answer ?& array['questionId', 'answer']
          or answer - array['questionId', 'answer'] <> '{}'::jsonb
          or answer->>'questionId' not in (
            'severe_breathing_difficulty',
            'chest_pain',
            'chest_pain_concerning_features',
            'stroke_like_symptoms',
            'unconsciousness_or_confusion',
            'uncontrolled_bleeding',
            'severe_allergic_reaction',
            'suicidal_or_self_harm_emergency',
            'severe_trauma'
          )
          or answer->>'answer' not in ('yes', 'no', 'unknown')
      )
      and (
        select count(distinct answer->>'questionId')
        from jsonb_array_elements(value) as answer
      ) = 9
  end;
$$;

revoke execute on function public.is_valid_emergency_screening_answers(jsonb)
from public, anon, authenticated, service_role;

alter table public.triage_results
  add column explicit_answers jsonb,
  add constraint triage_results_explicit_answers_valid check (
    explicit_answers is null
    or public.is_valid_emergency_screening_answers(explicit_answers)
  );

create function public.record_triage_result_with_answers(
  p_actor_user_id uuid,
  p_intake_session_id uuid,
  p_rule_set_version text,
  p_outcome public.triage_outcome,
  p_matched_rule_codes text[],
  p_explicit_answers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_id uuid;
begin
  if not public.is_valid_emergency_screening_answers(p_explicit_answers) then
    raise check_violation using message = 'Triage answers are invalid';
  end if;

  result_id := public.record_triage_result(
    p_actor_user_id,
    p_intake_session_id,
    p_rule_set_version,
    p_outcome,
    p_matched_rule_codes
  );

  update public.triage_results
  set explicit_answers = p_explicit_answers
  where id = result_id;

  return result_id;
end;
$$;

revoke execute on function public.record_triage_result_with_answers(
  uuid, uuid, text, public.triage_outcome, text[], jsonb
) from public, anon, authenticated;
grant execute on function public.record_triage_result_with_answers(
  uuid, uuid, text, public.triage_outcome, text[], jsonb
) to service_role;

create table public.doctor_handoff_summaries (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete restrict,
  summary_version text not null,
  summary_data jsonb not null,
  generated_by uuid not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctor_handoff_summary_version_valid check (
    char_length(btrim(summary_version)) between 1 and 64
    and summary_version ~ '^[a-z0-9][a-z0-9._-]*$'
  ),
  constraint doctor_handoff_summary_data_valid check (
    jsonb_typeof(summary_data) = 'object'
    and pg_column_size(summary_data) <= 65536
    and summary_data ?& array[
      'chief_complaint',
      'timeline',
      'positives',
      'important_negatives',
      'relevant_history',
      'medications',
      'allergies',
      'red_flag_status',
      'routing_reason',
      'unanswered_questions',
      'patient_quotes'
    ]
    and summary_data - array[
      'chief_complaint',
      'timeline',
      'positives',
      'important_negatives',
      'relevant_history',
      'medications',
      'allergies',
      'red_flag_status',
      'routing_reason',
      'unanswered_questions',
      'patient_quotes'
    ] = '{}'::jsonb
    and not summary_data ?| array[
      'diagnosis',
      'prescription',
      'reasoning',
      'hidden_reasoning',
      'chain_of_thought',
      'confidence'
    ]
  ),
  constraint doctor_handoff_appointment_version_unique unique (
    appointment_id,
    summary_version
  )
);

create index doctor_handoff_appointment_generated_idx
on public.doctor_handoff_summaries (appointment_id, generated_at desc);

create trigger doctor_handoff_summaries_set_updated_at
before update on public.doctor_handoff_summaries
for each row execute function public.set_updated_at();

alter table public.doctor_handoff_summaries enable row level security;
revoke all on table public.doctor_handoff_summaries
from anon, authenticated, service_role;

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
      'doctor_appointment_transcript_viewed',
      'doctor_handoff_source_accessed',
      'doctor_handoff_generated',
      'doctor_handoff_viewed'
    )
  );

create function public.get_doctor_handoff_source(p_appointment_id uuid)
returns table (
  structured_data jsonb,
  explicit_answers jsonb,
  triage_outcome public.triage_outcome,
  matched_rule_codes text[],
  rule_set_version text,
  routing_reason text
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
    raise insufficient_privilege using message = 'Doctor handoff is unavailable';
  end if;

  insert into public.audit_events (
    actor_user_id, action, target_type, target_id, outcome
  ) values (
    user_id,
    'doctor_handoff_source_accessed',
    'appointment',
    p_appointment_id,
    'success'
  );

  return query
  select
    intake_structured.structured_data,
    latest_triage.explicit_answers,
    latest_triage.outcome,
    latest_triage.matched_rule_codes,
    latest_triage.rule_set_version,
    latest_routing.routing_reason
  from public.appointments
  join public.intake_sessions
    on intake_sessions.id = appointments.intake_session_id
  join public.intake_structured
    on intake_structured.intake_session_id = intake_sessions.id
  join lateral (
    select
      triage_results.explicit_answers,
      triage_results.outcome,
      triage_results.matched_rule_codes,
      triage_results.rule_set_version
    from public.triage_results
    where triage_results.intake_session_id = intake_sessions.id
      and triage_results.explicit_answers is not null
    order by triage_results.evaluated_at desc, triage_results.id desc
    limit 1
  ) as latest_triage on true
  left join lateral (
    select
      specialty_routing_results.routing_result->>'rationale_for_doctor'
        as routing_reason
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

create function public.record_doctor_handoff(
  p_actor_user_id uuid,
  p_appointment_id uuid,
  p_summary_version text,
  p_summary_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_doctor_id uuid;
  handoff_id uuid;
begin
  select doctors.id
  into actor_doctor_id
  from public.doctors
  join public.profiles on profiles.id = doctors.profile_id
  where profiles.auth_user_id = p_actor_user_id
    and profiles.role = 'doctor';

  if actor_doctor_id is null
    or not exists (
      select 1
      from public.appointments
      where appointments.id = p_appointment_id
        and appointments.doctor_id = actor_doctor_id
    )
    or p_summary_version <> 'doctor-handoff-v1'
  then
    raise insufficient_privilege using message = 'Doctor handoff is unavailable';
  end if;

  insert into public.doctor_handoff_summaries (
    appointment_id,
    summary_version,
    summary_data,
    generated_by
  ) values (
    p_appointment_id,
    p_summary_version,
    p_summary_data,
    p_actor_user_id
  )
  on conflict (appointment_id, summary_version) do nothing
  returning id into handoff_id;

  if handoff_id is null then
    select id into handoff_id
    from public.doctor_handoff_summaries
    where appointment_id = p_appointment_id
      and summary_version = p_summary_version;
  end if;

  insert into public.audit_events (
    actor_user_id, action, target_type, target_id, outcome
  ) values (
    p_actor_user_id,
    'doctor_handoff_generated',
    'appointment',
    p_appointment_id,
    'success'
  );

  return handoff_id;
end;
$$;

create function public.get_doctor_handoff(p_appointment_id uuid)
returns table (
  summary_version text,
  summary_data jsonb,
  generated_at timestamptz
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
    raise insufficient_privilege using message = 'Doctor handoff is unavailable';
  end if;

  insert into public.audit_events (
    actor_user_id, action, target_type, target_id, outcome
  ) values (
    user_id,
    'doctor_handoff_viewed',
    'appointment',
    p_appointment_id,
    'success'
  );

  return query
  select
    doctor_handoff_summaries.summary_version,
    doctor_handoff_summaries.summary_data,
    doctor_handoff_summaries.generated_at
  from public.doctor_handoff_summaries
  where doctor_handoff_summaries.appointment_id = p_appointment_id
  order by doctor_handoff_summaries.generated_at desc,
    doctor_handoff_summaries.id desc
  limit 1;
end;
$$;

revoke execute on function public.get_doctor_handoff_source(uuid)
from public, anon;
grant execute on function public.get_doctor_handoff_source(uuid)
to authenticated;

revoke execute on function public.get_doctor_handoff(uuid)
from public, anon;
grant execute on function public.get_doctor_handoff(uuid)
to authenticated;

revoke execute on function public.record_doctor_handoff(
  uuid, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_doctor_handoff(
  uuid, uuid, text, jsonb
) to service_role;

comment on column public.triage_results.explicit_answers is
  'Controlled direct patient answers used to preserve explicitly asked negatives; never inferred from model output.';
comment on table public.doctor_handoff_summaries is
  'Versioned doctor-facing handoffs generated from structured intake and controlled recorded safety answers, without hidden reasoning.';
