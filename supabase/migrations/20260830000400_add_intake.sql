create type public.intake_session_status as enum ('ACTIVE', 'COMPLETED', 'ABANDONED');
create type public.intake_message_role as enum ('patient', 'assistant');

create table public.intake_sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete restrict,
  status public.intake_session_status not null default 'ACTIVE',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_sessions_completion_consistent check (
    (status = 'COMPLETED' and completed_at is not null)
    or (status <> 'COMPLETED' and completed_at is null)
  )
);

create unique index intake_sessions_one_active_per_patient_idx
on public.intake_sessions (patient_id)
where status = 'ACTIVE';

create index intake_sessions_patient_created_idx
on public.intake_sessions (patient_id, created_at desc);

create table public.intake_messages (
  id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null references public.intake_sessions (id) on delete restrict,
  sequence_number integer not null,
  role public.intake_message_role not null,
  text_content text not null,
  created_at timestamptz not null default now(),
  constraint intake_messages_text_length check (
    char_length(btrim(text_content)) between 1 and 4000
  ),
  constraint intake_messages_sequence_positive check (sequence_number > 0),
  constraint intake_messages_session_sequence_unique unique (
    intake_session_id,
    sequence_number
  )
);

create index intake_messages_session_created_idx
on public.intake_messages (intake_session_id, created_at);

create table public.intake_structured (
  id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null unique
    references public.intake_sessions (id) on delete restrict,
  schema_version text not null,
  structured_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_structured_schema_version_length check (
    char_length(btrim(schema_version)) between 1 and 64
  ),
  constraint intake_structured_data_is_object check (
    jsonb_typeof(structured_data) = 'object'
  ),
  constraint intake_structured_data_size check (
    pg_column_size(structured_data) <= 65536
  )
);

create trigger intake_sessions_set_updated_at
before update on public.intake_sessions
for each row execute function public.set_updated_at();

create trigger intake_structured_set_updated_at
before update on public.intake_structured
for each row execute function public.set_updated_at();

alter table public.intake_sessions enable row level security;
alter table public.intake_messages enable row level security;
alter table public.intake_structured enable row level security;

revoke all on table public.intake_sessions from anon, authenticated;
revoke all on table public.intake_messages from anon, authenticated;
revoke all on table public.intake_structured from anon, authenticated;

grant select on table public.intake_sessions to authenticated;
grant select on table public.intake_messages to authenticated;
grant select on table public.intake_structured to authenticated;

create policy "Patients can read their own intake sessions"
on public.intake_sessions for select
to authenticated
using (
  patient_id in (
    select patients.id
    from public.patients
    join public.profiles on profiles.id = patients.profile_id
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'patient'
  )
);

create policy "Patients can read their own intake messages"
on public.intake_messages for select
to authenticated
using (
  intake_session_id in (
    select intake_sessions.id
    from public.intake_sessions
  )
);

create policy "Patients can read their own structured intake"
on public.intake_structured for select
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
      'intake_message_added'
    )
  ),
  add constraint audit_events_target_type_allowed check (
    target_type in ('doctor', 'doctor_availability', 'appointment', 'intake_session')
  );

create function public.start_intake_session()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_patient_id uuid;
  active_session_id uuid;
begin
  select patients.id
  into actor_patient_id
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'patient'
    and patients.status = 'active'
    and patients.onboarding_completed_at is not null
  for update of patients;

  if actor_patient_id is null then
    raise insufficient_privilege using message = 'Intake is unavailable';
  end if;

  select intake_sessions.id
  into active_session_id
  from public.intake_sessions
  where intake_sessions.patient_id = actor_patient_id
    and intake_sessions.status = 'ACTIVE';

  if active_session_id is not null then
    return active_session_id;
  end if;

  insert into public.intake_sessions (patient_id)
  values (actor_patient_id)
  returning id into active_session_id;

  insert into public.intake_messages (
    intake_session_id,
    sequence_number,
    role,
    text_content
  )
  values (
    active_session_id,
    1,
    'assistant',
    'Please describe what brings you here today. This intake assistant does not diagnose or prescribe.'
  );

  insert into public.audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome
  )
  values (user_id, 'intake_session_started', 'intake_session', active_session_id, 'success');

  return active_session_id;
end;
$$;

create function public.add_intake_message(
  p_intake_session_id uuid,
  p_text_content text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_patient_id uuid;
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

  insert into public.intake_messages (
    intake_session_id,
    sequence_number,
    role,
    text_content
  )
  values (
    p_intake_session_id,
    next_sequence_number + 1,
    'assistant',
    'Thank you. Your response has been recorded. You can add more information when ready.'
  );

  insert into public.audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome
  )
  values (user_id, 'intake_message_added', 'intake_session', p_intake_session_id, 'success');
end;
$$;

revoke execute on function public.start_intake_session() from public, anon;
grant execute on function public.start_intake_session() to authenticated;

revoke execute on function public.add_intake_message(uuid, text) from public, anon;
grant execute on function public.add_intake_message(uuid, text) to authenticated;

comment on table public.intake_sessions is
  'Patient-owned intake lifecycle records protected by row-level security.';
comment on table public.intake_messages is
  'Visible patient and assistant text only. Hidden model reasoning must never be stored.';
comment on table public.intake_structured is
  'Versioned structured intake output. No automated clinical extraction is implemented yet.';
comment on function public.start_intake_session() is
  'Starts or returns the authenticated onboarded patient active intake session.';
comment on function public.add_intake_message(uuid, text) is
  'Appends visible patient and deterministic assistant text to an owned active intake session.';
