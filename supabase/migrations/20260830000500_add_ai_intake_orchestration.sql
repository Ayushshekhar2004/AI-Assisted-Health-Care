drop function public.add_intake_message(uuid, text);

alter table public.intake_structured
  add constraint intake_structured_forbidden_fields check (
    not structured_data ?| array[
      'diagnosis',
      'prescription',
      'reasoning',
      'hidden_reasoning',
      'chain_of_thought'
    ]
  );

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
      'intake_assistant_turn_recorded'
    )
  );

create function public.add_intake_patient_message(
  p_intake_session_id uuid,
  p_text_content text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_patient_id uuid;
  last_message_role public.intake_message_role;
  last_message_text text;
  next_sequence_number integer;
begin
  if p_text_content is null
    or char_length(btrim(p_text_content)) not between 1 and 4000
  then
    raise check_violation using message = 'Intake message is invalid';
  end if;

  select patients.id
  into actor_patient_id
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'patient'
    and patients.status = 'active'
    and patients.onboarding_completed_at is not null;

  if actor_patient_id is null then
    raise insufficient_privilege using message = 'Intake is unavailable';
  end if;

  perform 1
  from public.intake_sessions
  where intake_sessions.id = p_intake_session_id
    and intake_sessions.patient_id = actor_patient_id
    and intake_sessions.status = 'ACTIVE'
  for update;

  if not found then
    raise insufficient_privilege using message = 'Intake is unavailable';
  end if;

  select intake_messages.role, intake_messages.text_content
  into last_message_role, last_message_text
  from public.intake_messages
  where intake_messages.intake_session_id = p_intake_session_id
  order by intake_messages.sequence_number desc
  limit 1;

  if last_message_role = 'patient' then
    if last_message_text = btrim(p_text_content) then
      return false;
    end if;
    raise check_violation using message = 'Previous intake response is pending';
  end if;

  select coalesce(max(intake_messages.sequence_number), 0) + 1
  into next_sequence_number
  from public.intake_messages
  where intake_messages.intake_session_id = p_intake_session_id;

  insert into public.intake_messages (
    intake_session_id,
    sequence_number,
    role,
    text_content
  )
  values (
    p_intake_session_id,
    next_sequence_number,
    'patient',
    btrim(p_text_content)
  );

  insert into public.audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome
  )
  values (
    user_id,
    'intake_patient_message_added',
    'intake_session',
    p_intake_session_id,
    'success'
  );

  return true;
end;
$$;

create function public.record_intake_assistant_turn(
  p_actor_user_id uuid,
  p_intake_session_id uuid,
  p_assistant_text text,
  p_structured_data jsonb,
  p_schema_version text,
  p_intake_complete boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_patient_id uuid;
  last_message_role public.intake_message_role;
  next_sequence_number integer;
begin
  if p_assistant_text is null
    or char_length(btrim(p_assistant_text)) not between 1 and 4000
    or p_schema_version is null
    or char_length(btrim(p_schema_version)) not between 1 and 64
    or p_structured_data is null
    or jsonb_typeof(p_structured_data) <> 'object'
    or pg_column_size(p_structured_data) > 65536
    or p_structured_data ?| array[
      'diagnosis',
      'prescription',
      'reasoning',
      'hidden_reasoning',
      'chain_of_thought'
    ]
  then
    raise check_violation using message = 'Assistant intake turn is invalid';
  end if;

  select patients.id
  into actor_patient_id
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = p_actor_user_id
    and profiles.role = 'patient'
    and patients.status = 'active'
    and patients.onboarding_completed_at is not null;

  if actor_patient_id is null then
    raise insufficient_privilege using message = 'Intake is unavailable';
  end if;

  perform 1
  from public.intake_sessions
  where intake_sessions.id = p_intake_session_id
    and intake_sessions.patient_id = actor_patient_id
    and intake_sessions.status = 'ACTIVE'
  for update;

  if not found then
    raise insufficient_privilege using message = 'Intake is unavailable';
  end if;

  select intake_messages.role
  into last_message_role
  from public.intake_messages
  where intake_messages.intake_session_id = p_intake_session_id
  order by intake_messages.sequence_number desc
  limit 1;

  if last_message_role is distinct from 'patient' then
    raise check_violation using message = 'Assistant intake turn is unavailable';
  end if;

  select coalesce(max(intake_messages.sequence_number), 0) + 1
  into next_sequence_number
  from public.intake_messages
  where intake_messages.intake_session_id = p_intake_session_id;

  insert into public.intake_messages (
    intake_session_id,
    sequence_number,
    role,
    text_content
  )
  values (
    p_intake_session_id,
    next_sequence_number,
    'assistant',
    btrim(p_assistant_text)
  );

  insert into public.intake_structured (
    intake_session_id,
    schema_version,
    structured_data
  )
  values (
    p_intake_session_id,
    btrim(p_schema_version),
    p_structured_data
  )
  on conflict (intake_session_id) do update
  set
    schema_version = excluded.schema_version,
    structured_data = excluded.structured_data;

  if p_intake_complete then
    update public.intake_sessions
    set
      status = 'COMPLETED',
      completed_at = now()
    where id = p_intake_session_id;
  end if;

  insert into public.audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome
  )
  values (
    p_actor_user_id,
    'intake_assistant_turn_recorded',
    'intake_session',
    p_intake_session_id,
    'success'
  );
end;
$$;

revoke execute on function public.add_intake_patient_message(uuid, text)
from public, anon;
grant execute on function public.add_intake_patient_message(uuid, text)
to authenticated;

revoke execute on function public.record_intake_assistant_turn(
  uuid,
  uuid,
  text,
  jsonb,
  text,
  boolean
) from public, anon, authenticated;
grant execute on function public.record_intake_assistant_turn(
  uuid,
  uuid,
  text,
  jsonb,
  text,
  boolean
) to service_role;

comment on function public.add_intake_patient_message(uuid, text) is
  'Appends only patient-authored visible text and safely supports retry after model failure.';
comment on function public.record_intake_assistant_turn(
  uuid,
  uuid,
  text,
  jsonb,
  text,
  boolean
) is
  'Service-only persistence for a Zod-validated visible assistant turn and structured snapshot.';
