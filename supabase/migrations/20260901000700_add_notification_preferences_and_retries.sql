alter table public.notification_events
  add column next_attempt_at timestamptz,
  add column lease_expires_at timestamptz,
  add column suppression_reason text,
  add constraint notification_events_suppression_reason_safe check (
    suppression_reason is null
    or suppression_reason ~ '^[A-Z0-9_]{1,80}$'
  );

update public.notification_events
set
  next_attempt_at = case
    when delivery_status = 'PENDING' then scheduled_for
    when delivery_status = 'FAILED' and delivery_attempts < 5 then updated_at
    else null
  end,
  lease_expires_at = case
    when delivery_status = 'PROCESSING' then updated_at + interval '5 minutes'
    else null
  end;

alter table public.notification_events
  drop constraint notification_events_attempts_valid,
  drop constraint notification_events_delivery_metadata_consistent,
  add constraint notification_events_attempts_valid check (
    delivery_attempts between 0 and 5
  ),
  add constraint notification_events_delivery_metadata_consistent check (
    (delivery_status = 'PENDING'
      and delivery_attempts = 0
      and next_attempt_at is not null
      and lease_expires_at is null
      and provider_message_id is null
      and error_code is null
      and suppression_reason is null
      and delivered_at is null)
    or (delivery_status = 'PROCESSING'
      and delivery_attempts between 1 and 5
      and next_attempt_at is null
      and lease_expires_at is not null
      and provider_message_id is null
      and error_code is null
      and suppression_reason is null
      and delivered_at is null)
    or (delivery_status = 'DELIVERED'
      and delivery_attempts between 1 and 5
      and next_attempt_at is null
      and lease_expires_at is null
      and provider_message_id is not null
      and error_code is null
      and suppression_reason is null
      and delivered_at is not null)
    or (delivery_status = 'FAILED'
      and delivery_attempts between 1 and 5
      and (delivery_attempts = 5 or next_attempt_at is not null)
      and lease_expires_at is null
      and provider_message_id is null
      and error_code is not null
      and suppression_reason is null
      and delivered_at is null)
    or (delivery_status = 'SKIPPED'
      and next_attempt_at is null
      and lease_expires_at is null
      and provider_message_id is null
      and error_code is null
      and suppression_reason = 'RECIPIENT_OPTED_OUT'
      and delivered_at is null
      and event_type = 'APPOINTMENT_REMINDER')
  );

drop index public.notification_events_due_idx;
create index notification_events_due_idx
on public.notification_events (next_attempt_at, created_at)
where delivery_status in ('PENDING', 'FAILED');

create table public.patient_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null unique references public.patients (id) on delete cascade,
  appointment_reminders_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.patient_notification_preferences (patient_id)
select patients.id from public.patients
on conflict (patient_id) do nothing;

create trigger patient_notification_preferences_set_updated_at
before update on public.patient_notification_preferences
for each row execute function public.set_updated_at();

alter table public.patient_notification_preferences enable row level security;
revoke all on table public.patient_notification_preferences from public, anon, authenticated;
grant select on table public.patient_notification_preferences to authenticated;
grant update (appointment_reminders_enabled)
on table public.patient_notification_preferences to authenticated;
grant select, insert, update on table public.patient_notification_preferences to service_role;

create policy "Patients read their own notification preferences"
on public.patient_notification_preferences for select
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

create policy "Patients update their own notification preferences"
on public.patient_notification_preferences for update
to authenticated
using (
  patient_id in (
    select patients.id
    from public.patients
    join public.profiles on profiles.id = patients.profile_id
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'patient'
  )
)
with check (
  patient_id in (
    select patients.id
    from public.patients
    join public.profiles on profiles.id = patients.profile_id
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'patient'
  )
);

create function public.provision_patient_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.patient_notification_preferences (patient_id)
  values (new.id)
  on conflict (patient_id) do nothing;
  return new;
end;
$$;

create trigger patients_provision_notification_preferences
after insert on public.patients
for each row execute function public.provision_patient_notification_preferences();

create function public.suppress_opted_out_appointment_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.appointment_reminders_enabled and not new.appointment_reminders_enabled then
    update public.notification_events
    set
      delivery_status = 'SKIPPED',
      next_attempt_at = null,
      lease_expires_at = null,
      provider_message_id = null,
      error_code = null,
      suppression_reason = 'RECIPIENT_OPTED_OUT',
      delivered_at = null
    where recipient_profile_id = (
        select patients.profile_id
        from public.patients
        where patients.id = new.patient_id
      )
      and event_type = 'APPOINTMENT_REMINDER'
      and delivery_status in ('PENDING', 'FAILED');
  end if;
  return new;
end;
$$;

create trigger patient_preferences_suppress_reminders
after update of appointment_reminders_enabled
on public.patient_notification_preferences
for each row execute function public.suppress_opted_out_appointment_reminders();

create or replace function public.enqueue_appointment_notification_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_profile_id uuid;
  doctor_profile_id uuid;
  reminders_enabled boolean;
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
      scheduled_for,
      next_attempt_at
    ) values (
      new.id,
      patient_profile_id,
      'APPOINTMENT_CONFIRMED',
      now(),
      now()
    )
    on conflict (appointment_id, recipient_profile_id, event_type) do nothing;

    select patient_notification_preferences.appointment_reminders_enabled
    into reminders_enabled
    from public.patient_notification_preferences
    where patient_notification_preferences.patient_id = new.patient_id;

    if coalesce(reminders_enabled, true) then
      insert into public.notification_events (
        appointment_id,
        recipient_profile_id,
        event_type,
        scheduled_for,
        next_attempt_at
      ) values (
        new.id,
        patient_profile_id,
        'APPOINTMENT_REMINDER',
        greatest(now(), new.starts_at - interval '24 hours'),
        greatest(now(), new.starts_at - interval '24 hours')
      )
      on conflict (appointment_id, recipient_profile_id, event_type) do nothing;
    end if;
  elsif new.status = 'CANCELLED' then
    insert into public.notification_events (
      appointment_id,
      recipient_profile_id,
      event_type,
      scheduled_for,
      next_attempt_at
    ) values
      (new.id, patient_profile_id, 'APPOINTMENT_CANCELLED', now(), now()),
      (new.id, doctor_profile_id, 'APPOINTMENT_CANCELLED', now(), now())
    on conflict (appointment_id, recipient_profile_id, event_type) do nothing;
  elsif new.status = 'IN_PROGRESS' then
    insert into public.notification_events (
      appointment_id,
      recipient_profile_id,
      event_type,
      scheduled_for,
      next_attempt_at
    ) values (
      new.id,
      patient_profile_id,
      'DOCTOR_READY',
      now(),
      now()
    )
    on conflict (appointment_id, recipient_profile_id, event_type) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.claim_notification_events(
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

  update public.notification_events
  set
    delivery_status = 'SKIPPED',
    next_attempt_at = null,
    lease_expires_at = null,
    provider_message_id = null,
    error_code = null,
    suppression_reason = 'RECIPIENT_OPTED_OUT',
    delivered_at = null
  where event_type = 'APPOINTMENT_REMINDER'
    and delivery_status in ('PENDING', 'FAILED')
    and exists (
      select 1
      from public.patient_notification_preferences
      join public.patients
        on patients.id = patient_notification_preferences.patient_id
      where patients.profile_id = notification_events.recipient_profile_id
        and not patient_notification_preferences.appointment_reminders_enabled
    );

  return query
  with due as (
    select notification_events.id
    from public.notification_events
    where (
        (
          notification_events.delivery_status in ('PENDING', 'FAILED')
          and notification_events.next_attempt_at <= now()
        )
        or (
          notification_events.delivery_status = 'PROCESSING'
          and notification_events.lease_expires_at <= now()
        )
      )
      and notification_events.delivery_attempts < 5
      and (
        p_appointment_id is null
        or notification_events.appointment_id = p_appointment_id
      )
    order by
      coalesce(notification_events.next_attempt_at, notification_events.lease_expires_at),
      notification_events.created_at
    for update skip locked
    limit p_limit
  )
  update public.notification_events
  set
    delivery_status = 'PROCESSING',
    delivery_attempts = notification_events.delivery_attempts + 1,
    next_attempt_at = null,
    lease_expires_at = now() + interval '5 minutes',
    provider_message_id = null,
    error_code = null,
    suppression_reason = null,
    delivered_at = null
  from due
  where notification_events.id = due.id
  returning notification_events.*;
end;
$$;

create or replace function public.finish_notification_event(
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
    delivered_at = case when p_succeeded then now() else null end,
    next_attempt_at = case
      when p_succeeded or delivery_attempts >= 5 then null
      when delivery_attempts = 1 then now() + interval '1 minute'
      when delivery_attempts = 2 then now() + interval '5 minutes'
      when delivery_attempts = 3 then now() + interval '30 minutes'
      else now() + interval '2 hours'
    end,
    lease_expires_at = null,
    suppression_reason = null
  where id = p_event_id
    and delivery_status = 'PROCESSING';

  if not found then
    raise invalid_parameter_value using message = 'Notification completion is unavailable';
  end if;
end;
$$;

revoke execute on function public.provision_patient_notification_preferences()
from public, anon, authenticated;
revoke execute on function public.suppress_opted_out_appointment_reminders()
from public, anon, authenticated;
revoke execute on function public.claim_notification_events(uuid, integer)
from public, anon, authenticated;
revoke execute on function public.finish_notification_event(uuid, boolean, text, text)
from public, anon, authenticated;
grant execute on function public.claim_notification_events(uuid, integer)
to service_role;
grant execute on function public.finish_notification_event(uuid, boolean, text, text)
to service_role;

comment on table public.patient_notification_preferences is
  'Patient-owned opt-out preferences for non-essential notification categories.';
comment on column public.notification_events.next_attempt_at is
  'Bounded server-controlled retry schedule; never derived from webhook payloads.';
comment on column public.notification_events.lease_expires_at is
  'Processing lease used to safely recover work after a crashed job.';
comment on column public.notification_events.suppression_reason is
  'Allow-listed reason for suppressing a non-essential event without storing message content.';

