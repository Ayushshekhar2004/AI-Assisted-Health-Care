create function public.is_valid_handoff_source_trace(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null or jsonb_typeof(value) <> 'array' then false
    when jsonb_array_length(value) not between 1 and 200 then false
    else not exists (
      select 1 from jsonb_array_elements(value) as trace
      where jsonb_typeof(trace) <> 'object'
        or not trace ?& array[
          'item_key', 'source_kind', 'source_field', 'recorded_answer'
        ]
        or trace - array[
          'item_key', 'source_kind', 'source_field', 'recorded_answer'
        ] <> '{}'::jsonb
        or trace->>'item_key' !~ '^[a-z][a-z0-9_.]{0,119}$'
        or trace->>'source_field' !~ '^[a-z][a-z0-9_.]{0,119}$'
        or trace->>'source_kind' not in (
          'STRUCTURED_INTAKE', 'EXPLICIT_SCREENING_ANSWER',
          'DETERMINISTIC_TRIAGE', 'SPECIALTY_ROUTING'
        )
        or (
          trace->'recorded_answer' <> 'null'::jsonb
          and trace->>'recorded_answer' not in ('yes', 'no', 'unknown')
        )
    )
  end;
$$;

revoke execute on function public.is_valid_handoff_source_trace(jsonb)
from public, anon, authenticated, service_role;

alter table public.doctor_handoff_summaries
  drop constraint doctor_handoff_summary_data_valid;

alter table public.doctor_handoff_summaries
  add constraint doctor_handoff_summary_data_valid check (
    jsonb_typeof(summary_data) = 'object'
    and pg_column_size(summary_data) <= 65536
    and summary_data ?& array[
      'chief_complaint', 'timeline', 'positives', 'important_negatives',
      'relevant_history', 'medications', 'allergies', 'red_flag_status',
      'routing_reason', 'unanswered_questions', 'patient_quotes'
    ]
    and not summary_data ?| array[
      'diagnosis', 'prescription', 'reasoning', 'hidden_reasoning',
      'chain_of_thought', 'confidence'
    ]
    and (
      (
        summary_version = 'doctor-handoff-v1'
        and summary_data - array[
          'chief_complaint', 'timeline', 'positives', 'important_negatives',
          'relevant_history', 'medications', 'allergies', 'red_flag_status',
          'routing_reason', 'unanswered_questions', 'patient_quotes'
        ] = '{}'::jsonb
      )
      or (
        summary_version = 'doctor-handoff-v2'
        and summary_data ? 'source_trace'
        and public.is_valid_handoff_source_trace(summary_data->'source_trace')
        and summary_data - array[
          'chief_complaint', 'timeline', 'positives', 'important_negatives',
          'relevant_history', 'medications', 'allergies', 'red_flag_status',
          'routing_reason', 'unanswered_questions', 'patient_quotes',
          'source_trace'
        ] = '{}'::jsonb
      )
    )
  );

create table public.doctor_handoff_feedback (
  id uuid primary key default gen_random_uuid(),
  handoff_summary_id uuid not null references public.doctor_handoff_summaries (id) on delete restrict,
  item_key text not null,
  feedback_type text not null default 'INACCURATE',
  reported_by uuid not null,
  created_at timestamptz not null default now(),
  constraint doctor_handoff_feedback_item_key_valid check (
    item_key ~ '^[a-z][a-z0-9_.]{0,119}$'
  ),
  constraint doctor_handoff_feedback_type_valid check (
    feedback_type = 'INACCURATE'
  ),
  constraint doctor_handoff_feedback_unique unique (
    handoff_summary_id, item_key, feedback_type, reported_by
  )
);

create index doctor_handoff_feedback_summary_idx
on public.doctor_handoff_feedback (handoff_summary_id, created_at desc);

alter table public.doctor_handoff_feedback enable row level security;
revoke all on table public.doctor_handoff_feedback
from anon, authenticated, service_role;

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
      'doctor_handoff_viewed', 'doctor_handoff_marked_inaccurate'
    )
  );

create or replace function public.record_doctor_handoff(
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
      select 1 from public.appointments
      where appointments.id = p_appointment_id
        and appointments.doctor_id = actor_doctor_id
    )
    or p_summary_version not in ('doctor-handoff-v1', 'doctor-handoff-v2')
  then
    raise insufficient_privilege using message = 'Doctor handoff is unavailable';
  end if;

  insert into public.doctor_handoff_summaries (
    appointment_id, summary_version, summary_data, generated_by
  ) values (
    p_appointment_id, p_summary_version, p_summary_data, p_actor_user_id
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
    p_actor_user_id, 'doctor_handoff_generated', 'appointment',
    p_appointment_id, 'success'
  );
  return handoff_id;
end;
$$;

create function public.mark_doctor_handoff_inaccurate(
  p_appointment_id uuid,
  p_summary_version text,
  p_item_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_doctor_id uuid;
  handoff_id uuid;
  feedback_id uuid;
begin
  select doctors.id into actor_doctor_id
  from public.doctors
  join public.profiles on profiles.id = doctors.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'doctor';

  select doctor_handoff_summaries.id into handoff_id
  from public.doctor_handoff_summaries
  join public.appointments
    on appointments.id = doctor_handoff_summaries.appointment_id
  where doctor_handoff_summaries.appointment_id = p_appointment_id
    and doctor_handoff_summaries.summary_version = p_summary_version
    and appointments.doctor_id = actor_doctor_id
    and exists (
      select 1
      from jsonb_array_elements(
        coalesce(doctor_handoff_summaries.summary_data->'source_trace', '[]'::jsonb)
      ) as trace
      where trace->>'item_key' = p_item_key
    );

  if handoff_id is null then
    raise insufficient_privilege using message = 'Doctor handoff feedback is unavailable';
  end if;

  insert into public.doctor_handoff_feedback (
    handoff_summary_id, item_key, reported_by
  ) values (
    handoff_id, p_item_key, user_id
  )
  on conflict (handoff_summary_id, item_key, feedback_type, reported_by)
  do nothing
  returning id into feedback_id;

  if feedback_id is null then
    select id into feedback_id
    from public.doctor_handoff_feedback
    where handoff_summary_id = handoff_id
      and item_key = p_item_key
      and feedback_type = 'INACCURATE'
      and reported_by = user_id;
  else
    insert into public.audit_events (
      actor_user_id, action, target_type, target_id, outcome
    ) values (
      user_id, 'doctor_handoff_marked_inaccurate', 'appointment',
      p_appointment_id, 'success'
    );
  end if;

  return feedback_id;
end;
$$;

create function public.get_doctor_handoff_inaccurate_items(
  p_appointment_id uuid,
  p_summary_version text
)
returns table (item_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_doctor_id uuid;
begin
  select doctors.id into actor_doctor_id
  from public.doctors
  join public.profiles on profiles.id = doctors.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'doctor';

  if actor_doctor_id is null or not exists (
    select 1 from public.appointments
    where appointments.id = p_appointment_id
      and appointments.doctor_id = actor_doctor_id
  ) then
    raise insufficient_privilege using message = 'Doctor handoff feedback is unavailable';
  end if;

  return query
  select doctor_handoff_feedback.item_key
  from public.doctor_handoff_feedback
  join public.doctor_handoff_summaries
    on doctor_handoff_summaries.id = doctor_handoff_feedback.handoff_summary_id
  where doctor_handoff_summaries.appointment_id = p_appointment_id
    and doctor_handoff_summaries.summary_version = p_summary_version
    and doctor_handoff_feedback.reported_by = user_id
  order by doctor_handoff_feedback.created_at, doctor_handoff_feedback.id;
end;
$$;

revoke execute on function public.mark_doctor_handoff_inaccurate(uuid, text, text)
from public, anon;
grant execute on function public.mark_doctor_handoff_inaccurate(uuid, text, text)
to authenticated;

revoke execute on function public.get_doctor_handoff_inaccurate_items(uuid, text)
from public, anon;
grant execute on function public.get_doctor_handoff_inaccurate_items(uuid, text)
to authenticated;

comment on table public.doctor_handoff_feedback is
  'Append-only doctor feedback keyed to an immutable handoff item; it never rewrites source or summary content.';
