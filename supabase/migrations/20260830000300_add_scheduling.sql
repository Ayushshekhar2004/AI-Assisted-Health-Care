create extension if not exists btree_gist with schema extensions;

create type public.appointment_status as enum (
  'REQUESTED',
  'CONFIRMED',
  'CANCELLED',
  'IN_PROGRESS',
  'COMPLETED',
  'NO_SHOW',
  'REQUIRES_IN_PERSON'
);

create table public.doctor_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  availability_period tstzrange generated always as (
    tstzrange(starts_at, ends_at, '[)')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctor_availability_positive_duration check (ends_at > starts_at),
  constraint doctor_availability_max_duration check (
    ends_at <= starts_at + interval '24 hours'
  ),
  constraint doctor_availability_booking_identity unique (
    id,
    doctor_id,
    starts_at,
    ends_at
  ),
  constraint doctor_availability_no_overlap exclude using gist (
    doctor_id with =,
    availability_period with &&
  )
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  doctor_availability_id uuid not null,
  doctor_id uuid not null references public.doctors (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  booking_period tstzrange generated always as (
    tstzrange(starts_at, ends_at, '[)')
  ) stored,
  fee_paise integer,
  status public.appointment_status not null default 'REQUESTED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_positive_duration check (ends_at > starts_at),
  constraint appointments_max_duration check (ends_at <= starts_at + interval '24 hours'),
  constraint appointments_fee_range check (
    fee_paise is null or fee_paise between 0 and 100000000
  ),
  constraint appointments_match_availability foreign key (
    doctor_availability_id,
    doctor_id,
    starts_at,
    ends_at
  ) references public.doctor_availability (id, doctor_id, starts_at, ends_at) on delete restrict,
  constraint appointments_doctor_no_double_booking exclude using gist (
    doctor_id with =,
    booking_period with &&
  ) where (status in ('REQUESTED', 'CONFIRMED', 'IN_PROGRESS')),
  constraint appointments_patient_no_double_booking exclude using gist (
    patient_id with =,
    booking_period with &&
  ) where (status in ('REQUESTED', 'CONFIRMED', 'IN_PROGRESS'))
);

create index doctor_availability_doctor_starts_idx
on public.doctor_availability (doctor_id, starts_at);

create index appointments_doctor_starts_idx on public.appointments (doctor_id, starts_at);
create index appointments_patient_starts_idx on public.appointments (patient_id, starts_at);
create index appointments_status_starts_idx on public.appointments (status, starts_at);

create function public.enforce_appointment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.doctor_availability_id, new.doctor_id, new.patient_id, new.starts_at, new.ends_at)
    is distinct from
    (old.doctor_availability_id, old.doctor_id, old.patient_id, old.starts_at, old.ends_at)
  then
    raise check_violation using message = 'Appointment participants and schedule are immutable';
  end if;

  if new.status is distinct from old.status
    and not (
      (old.status = 'REQUESTED'
        and new.status in ('CONFIRMED', 'CANCELLED', 'REQUIRES_IN_PERSON'))
      or (old.status = 'CONFIRMED'
        and new.status in ('CANCELLED', 'IN_PROGRESS', 'NO_SHOW', 'REQUIRES_IN_PERSON'))
      or (old.status = 'IN_PROGRESS'
        and new.status in ('COMPLETED', 'REQUIRES_IN_PERSON'))
    )
  then
    raise check_violation using message = 'Invalid appointment status transition';
  end if;

  return new;
end;
$$;

create trigger doctor_availability_set_updated_at
before update on public.doctor_availability
for each row execute function public.set_updated_at();

create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

create trigger appointments_enforce_update
before update on public.appointments
for each row execute function public.enforce_appointment_update();

alter table public.doctor_availability enable row level security;
alter table public.appointments enable row level security;

revoke all on table public.doctor_availability from anon, authenticated;
revoke all on table public.appointments from anon, authenticated;
revoke execute on function public.enforce_appointment_update() from public, anon, authenticated;
grant select on table public.doctor_availability to authenticated;
grant select on table public.appointments to authenticated;

create function public.is_doctor_bookable(p_doctor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.doctors
    where doctors.id = p_doctor_id
      and doctors.status = 'verified'
      and doctors.is_bookable
  );
$$;

revoke execute on function public.is_doctor_bookable(uuid) from public, anon;
grant execute on function public.is_doctor_bookable(uuid) to authenticated;

create policy "Doctors can read their own availability"
on public.doctor_availability for select
to authenticated
using (
  doctor_id in (
    select doctors.id
    from public.doctors
    join public.profiles on profiles.id = doctors.profile_id
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'doctor'
  )
);

create policy "Patients can read verified doctor availability"
on public.doctor_availability for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'patient'
  )
  and (select public.is_doctor_bookable(doctor_availability.doctor_id))
);

create policy "Patients can read their own appointments"
on public.appointments for select
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

create policy "Doctors can read their own appointments"
on public.appointments for select
to authenticated
using (
  doctor_id in (
    select doctors.id
    from public.doctors
    join public.profiles on profiles.id = doctors.profile_id
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'doctor'
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
      'appointment_status_transitioned'
    )
  ),
  add constraint audit_events_target_type_allowed check (
    target_type in ('doctor', 'doctor_availability', 'appointment')
  );

create function public.create_doctor_availability(
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_doctor_id uuid;
  new_availability_id uuid;
begin
  if user_id is null
    or p_starts_at is null
    or p_ends_at is null
    or p_starts_at <= now()
    or p_ends_at <= p_starts_at
    or p_ends_at > p_starts_at + interval '24 hours'
  then
    raise invalid_parameter_value using message = 'Availability is invalid';
  end if;

  select doctors.id
  into actor_doctor_id
  from public.doctors
  join public.profiles on profiles.id = doctors.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'doctor'
    and doctors.status = 'verified'
    and doctors.is_bookable;

  if actor_doctor_id is null then
    raise insufficient_privilege using message = 'Availability is unavailable';
  end if;

  insert into public.doctor_availability (doctor_id, starts_at, ends_at)
  values (actor_doctor_id, p_starts_at, p_ends_at)
  returning id into new_availability_id;

  insert into public.audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome
  )
  values (
    user_id,
    'doctor_availability_created',
    'doctor_availability',
    new_availability_id,
    'success'
  );

  return new_availability_id;
end;
$$;

create function public.delete_doctor_availability(p_availability_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  deleted_availability_id uuid;
begin
  if user_id is null then
    raise insufficient_privilege using message = 'Availability is unavailable';
  end if;

  delete from public.doctor_availability
  using public.doctors, public.profiles
  where doctor_availability.id = p_availability_id
    and doctor_availability.doctor_id = doctors.id
    and doctors.profile_id = profiles.id
    and profiles.auth_user_id = user_id
    and profiles.role = 'doctor'
    and doctor_availability.starts_at > now()
    and not exists (
      select 1
      from public.appointments
      where appointments.doctor_availability_id = doctor_availability.id
    )
  returning doctor_availability.id into deleted_availability_id;

  if deleted_availability_id is null then
    raise invalid_parameter_value using message = 'Availability is unavailable';
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
    'doctor_availability_deleted',
    'doctor_availability',
    deleted_availability_id,
    'success'
  );
end;
$$;

create function public.list_bookable_availability()
returns table (
  availability_id uuid,
  doctor_name text,
  specialty text,
  fee_paise integer,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles
    join public.patients on patients.profile_id = profiles.id
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'patient'
      and patients.status = 'active'
      and patients.onboarding_completed_at is not null
  ) then
    raise insufficient_privilege using message = 'Availability is unavailable';
  end if;

  return query
  select
    doctor_availability.id,
    doctors.full_name,
    doctors.specialty,
    doctors.teleconsultation_fee_paise,
    doctor_availability.starts_at,
    doctor_availability.ends_at
  from public.doctor_availability
  join public.doctors on doctors.id = doctor_availability.doctor_id
  where doctor_availability.starts_at > now()
    and doctors.status = 'verified'
    and doctors.is_bookable
    and not exists (
      select 1
      from public.appointments
      where appointments.doctor_availability_id = doctor_availability.id
        and appointments.status in ('REQUESTED', 'CONFIRMED', 'IN_PROGRESS')
    )
  order by doctor_availability.starts_at;
end;
$$;

create function public.list_patient_appointments()
returns table (
  appointment_id uuid,
  doctor_name text,
  fee_paise integer,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.appointment_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_patient_id uuid;
begin
  select patients.id
  into actor_patient_id
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = (select auth.uid())
    and profiles.role = 'patient';

  if actor_patient_id is null then
    raise insufficient_privilege using message = 'Appointments are unavailable';
  end if;

  return query
  select
    appointments.id,
    doctors.full_name,
    appointments.fee_paise,
    appointments.starts_at,
    appointments.ends_at,
    appointments.status
  from public.appointments
  join public.doctors on doctors.id = appointments.doctor_id
  where appointments.patient_id = actor_patient_id
  order by appointments.starts_at desc;
end;
$$;

create function public.request_appointment(p_doctor_availability_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  requesting_patient_id uuid;
  selected_availability public.doctor_availability%rowtype;
  new_appointment_id uuid;
begin
  if user_id is null then
    raise insufficient_privilege using message = 'Appointment request is unavailable';
  end if;

  select patients.id
  into requesting_patient_id
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'patient'
    and patients.status = 'active'
    and patients.onboarding_completed_at is not null;

  if requesting_patient_id is null then
    raise insufficient_privilege using message = 'Appointment request is unavailable';
  end if;

  select doctor_availability.*
  into selected_availability
  from public.doctor_availability
  join public.doctors on doctors.id = doctor_availability.doctor_id
  where doctor_availability.id = p_doctor_availability_id
    and doctor_availability.starts_at > now()
    and doctors.status = 'verified'
    and doctors.is_bookable;

  if not found then
    raise invalid_parameter_value using message = 'Appointment request is unavailable';
  end if;

  insert into public.appointments (
    doctor_availability_id,
    doctor_id,
    patient_id,
    starts_at,
    ends_at,
    fee_paise
  )
  values (
    selected_availability.id,
    selected_availability.doctor_id,
    requesting_patient_id,
    selected_availability.starts_at,
    selected_availability.ends_at,
    (
      select doctors.teleconsultation_fee_paise
      from public.doctors
      where doctors.id = selected_availability.doctor_id
    )
  )
  returning id into new_appointment_id;

  insert into public.audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome
  )
  values (user_id, 'appointment_requested', 'appointment', new_appointment_id, 'success');

  return new_appointment_id;
end;
$$;

create function public.transition_appointment_status(
  p_appointment_id uuid,
  p_next_status public.appointment_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  current_appointment public.appointments%rowtype;
  actor_role public.profile_role;
  actor_patient_id uuid;
  actor_doctor_id uuid;
  transition_allowed boolean := false;
begin
  if user_id is null then
    raise insufficient_privilege using message = 'Appointment transition is unavailable';
  end if;

  select profiles.role, patients.id, doctors.id
  into actor_role, actor_patient_id, actor_doctor_id
  from public.profiles
  left join public.patients on patients.profile_id = profiles.id
  left join public.doctors on doctors.profile_id = profiles.id
  where profiles.auth_user_id = user_id;

  select *
  into current_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found or p_next_status = current_appointment.status then
    raise invalid_parameter_value using message = 'Appointment transition is unavailable';
  end if;

  if actor_role = 'patient'
    and actor_patient_id = current_appointment.patient_id
    and p_next_status = 'CANCELLED'
    and current_appointment.status in ('REQUESTED', 'CONFIRMED')
  then
    transition_allowed := true;
  elsif actor_role = 'doctor'
    and actor_doctor_id = current_appointment.doctor_id
    and (
      (current_appointment.status = 'REQUESTED'
        and p_next_status in ('CONFIRMED', 'CANCELLED', 'REQUIRES_IN_PERSON'))
      or (current_appointment.status = 'CONFIRMED'
        and p_next_status in ('CANCELLED', 'IN_PROGRESS', 'NO_SHOW', 'REQUIRES_IN_PERSON'))
      or (current_appointment.status = 'IN_PROGRESS'
        and p_next_status in ('COMPLETED', 'REQUIRES_IN_PERSON'))
    )
  then
    transition_allowed := true;
  end if;

  if not transition_allowed then
    raise insufficient_privilege using message = 'Appointment transition is unavailable';
  end if;

  update public.appointments
  set status = p_next_status
  where id = current_appointment.id;

  insert into public.audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome
  )
  values (
    user_id,
    'appointment_status_transitioned',
    'appointment',
    current_appointment.id,
    'success'
  );
end;
$$;

revoke execute on function public.request_appointment(uuid) from public, anon;
grant execute on function public.request_appointment(uuid) to authenticated;

revoke execute on function public.create_doctor_availability(timestamptz, timestamptz)
from public, anon;
grant execute on function public.create_doctor_availability(timestamptz, timestamptz)
to authenticated;

revoke execute on function public.delete_doctor_availability(uuid) from public, anon;
grant execute on function public.delete_doctor_availability(uuid) to authenticated;

revoke execute on function public.list_bookable_availability() from public, anon;
grant execute on function public.list_bookable_availability() to authenticated;

revoke execute on function public.list_patient_appointments() from public, anon;
grant execute on function public.list_patient_appointments() to authenticated;

revoke execute on function public.transition_appointment_status(
  uuid,
  public.appointment_status
) from public, anon;
grant execute on function public.transition_appointment_status(
  uuid,
  public.appointment_status
) to authenticated;

comment on table public.doctor_availability is
  'Private scheduling availability. Overlapping windows for one doctor are rejected.';
comment on table public.appointments is
  'Patient-doctor bookings with database-enforced status transitions and overlap protection.';
comment on function public.request_appointment(uuid) is
  'Atomically derives patient, doctor, schedule, and fee for an authenticated patient booking.';
comment on function public.create_doctor_availability(timestamptz, timestamptz) is
  'Creates availability only for the authenticated verified and bookable doctor.';
comment on function public.delete_doctor_availability(uuid) is
  'Deletes only the authenticated doctor own future unbooked availability.';
comment on function public.list_bookable_availability() is
  'Returns the minimum booking fields for verified doctors to an onboarded active patient.';
comment on function public.list_patient_appointments() is
  'Returns only the authenticated patient own appointments with minimum doctor display fields.';
comment on function public.is_doctor_bookable(uuid) is
  'Returns only whether an opaque doctor identifier is currently eligible for booking.';
comment on function public.transition_appointment_status(uuid, public.appointment_status) is
  'Applies role-aware appointment status transitions and records a content-free audit event.';
