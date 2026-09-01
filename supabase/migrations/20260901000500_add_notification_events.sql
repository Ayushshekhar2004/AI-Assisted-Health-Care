create type public.notification_event_type as enum (
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_REMINDER',
  'APPOINTMENT_CANCELLED',
  'DOCTOR_READY'
);

create type public.notification_delivery_status as enum (
  'PENDING',
  'PROCESSING',
  'DELIVERED',
  'FAILED'
);

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete restrict,
  recipient_profile_id uuid not null references public.profiles (id) on delete restrict,
  event_type public.notification_event_type not null,
  delivery_status public.notification_delivery_status not null default 'PENDING',
  scheduled_for timestamptz not null default now(),
  delivery_attempts integer not null default 0,
  provider_message_id text,
  error_code text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_events_once_per_recipient unique (
    appointment_id,
    recipient_profile_id,
    event_type
  ),
  constraint notification_events_attempts_valid check (
    delivery_attempts between 0 and 10
  ),
  constraint notification_events_provider_id_safe check (
    provider_message_id is null
    or provider_message_id ~ '^[A-Za-z0-9._:-]{1,160}$'
  ),
  constraint notification_events_error_code_safe check (
    error_code is null or error_code ~ '^[A-Z0-9_]{1,80}$'
  ),
  constraint notification_events_delivery_metadata_consistent check (
    (delivery_status = 'PENDING'
      and delivery_attempts = 0
      and provider_message_id is null
      and error_code is null
      and delivered_at is null)
    or (delivery_status = 'PROCESSING'
      and delivery_attempts between 1 and 10
      and provider_message_id is null
      and error_code is null
      and delivered_at is null)
    or (delivery_status = 'DELIVERED'
      and delivery_attempts between 1 and 10
      and provider_message_id is not null
      and error_code is null
      and delivered_at is not null)
    or (delivery_status = 'FAILED'
      and delivery_attempts between 1 and 10
      and provider_message_id is null
      and error_code is not null
      and delivered_at is null)
  )
);

create index notification_events_due_idx
on public.notification_events (scheduled_for, created_at)
where delivery_status = 'PENDING';

create index notification_events_recipient_created_idx
on public.notification_events (recipient_profile_id, created_at desc);

create trigger notification_events_set_updated_at
before update on public.notification_events
for each row execute function public.set_updated_at();

alter table public.notification_events enable row level security;
revoke all on table public.notification_events from public, anon, authenticated;
grant select on table public.notification_events to authenticated;
grant select, insert, update on table public.notification_events to service_role;

create policy "Users read only their own notification events"
on public.notification_events for select
to authenticated
using (
  recipient_profile_id in (
    select profiles.id
    from public.profiles
    where profiles.auth_user_id = (select auth.uid())
  )
);

create function public.enqueue_appointment_notification_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_profile_id uuid;
  doctor_profile_id uuid;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select patients.profile_id
  into patient_profile_id
  from public.patients
  where patients.id = new.patient_id;

  select doctors.profile_id
  into doctor_profile_id
  from public.doctors
  where doctors.id = new.doctor_id;

  if patient_profile_id is null or doctor_profile_id is null then
    raise check_violation using message = 'Appointment notification recipients are unavailable';
  end if;

  if new.status = 'CONFIRMED' then
    insert into public.notification_events (
      appointment_id,
      recipient_profile_id,
      event_type,
      scheduled_for
    ) values
      (new.id, patient_profile_id, 'APPOINTMENT_CONFIRMED', now()),
      (
        new.id,
        patient_profile_id,
        'APPOINTMENT_REMINDER',
        greatest(now(), new.starts_at - interval '24 hours')
      )
    on conflict (appointment_id, recipient_profile_id, event_type) do nothing;
  elsif new.status = 'CANCELLED' then
    insert into public.notification_events (
      appointment_id,
      recipient_profile_id,
      event_type,
      scheduled_for
    ) values
      (new.id, patient_profile_id, 'APPOINTMENT_CANCELLED', now()),
      (new.id, doctor_profile_id, 'APPOINTMENT_CANCELLED', now())
    on conflict (appointment_id, recipient_profile_id, event_type) do nothing;
  elsif new.status = 'IN_PROGRESS' then
    insert into public.notification_events (
      appointment_id,
      recipient_profile_id,
      event_type,
      scheduled_for
    ) values (
      new.id,
      patient_profile_id,
      'DOCTOR_READY',
      now()
    )
    on conflict (appointment_id, recipient_profile_id, event_type) do nothing;
  end if;

  return new;
end;
$$;

create trigger appointments_enqueue_notification_events
after insert or update of status on public.appointments
for each row execute function public.enqueue_appointment_notification_events();

create function public.claim_notification_events(
  p_appointment_id uuid,
  p_limit integer
)
returns setof public.notification_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise invalid_parameter_value using message = 'Notification claim is unavailable';
  end if;

  return query
  with due as (
    select notification_events.id
    from public.notification_events
    where notification_events.delivery_status = 'PENDING'
      and notification_events.scheduled_for <= now()
      and (
        p_appointment_id is null
        or notification_events.appointment_id = p_appointment_id
      )
    order by notification_events.scheduled_for, notification_events.created_at
    for update skip locked
    limit p_limit
  )
  update public.notification_events
  set
    delivery_status = 'PROCESSING',
    delivery_attempts = notification_events.delivery_attempts + 1
  from due
  where notification_events.id = due.id
  returning notification_events.*;
end;
$$;

create function public.finish_notification_event(
  p_event_id uuid,
  p_succeeded boolean,
  p_provider_message_id text,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_id is null or p_succeeded is null
    or (p_succeeded and (
      p_provider_message_id is null
      or p_provider_message_id !~ '^[A-Za-z0-9._:-]{1,160}$'
      or p_error_code is not null
    ))
    or (not p_succeeded and (
      p_provider_message_id is not null
      or p_error_code is null
      or p_error_code !~ '^[A-Z0-9_]{1,80}$'
    ))
  then
    raise invalid_parameter_value using message = 'Notification completion is unavailable';
  end if;

  update public.notification_events
  set
    delivery_status = case
      when p_succeeded then 'DELIVERED'::public.notification_delivery_status
      else 'FAILED'::public.notification_delivery_status
    end,
    provider_message_id = case when p_succeeded then p_provider_message_id else null end,
    error_code = case when p_succeeded then null else p_error_code end,
    delivered_at = case when p_succeeded then now() else null end
  where id = p_event_id
    and delivery_status = 'PROCESSING';

  if not found then
    raise invalid_parameter_value using message = 'Notification completion is unavailable';
  end if;
end;
$$;

revoke execute on function public.enqueue_appointment_notification_events()
from public, anon, authenticated;
revoke execute on function public.claim_notification_events(uuid, integer)
from public, anon, authenticated;
revoke execute on function public.finish_notification_event(uuid, boolean, text, text)
from public, anon, authenticated;

grant execute on function public.claim_notification_events(uuid, integer)
to service_role;
grant execute on function public.finish_notification_event(uuid, boolean, text, text)
to service_role;

comment on table public.notification_events is
  'Private, content-free appointment notification delivery events. Message content comes only from allow-listed server templates.';
comment on function public.enqueue_appointment_notification_events() is
  'Queues idempotent appointment logistics notifications from trusted appointment state transitions.';
comment on function public.claim_notification_events(uuid, integer) is
  'Service-role-only claim of due notification events using row locks.';
comment on function public.finish_notification_event(uuid, boolean, text, text) is
  'Service-role-only completion using safe provider metadata without message content.';

