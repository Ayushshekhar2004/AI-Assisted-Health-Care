create function public.start_appointment_consultation(p_appointment_id uuid)
returns public.appointment_status
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
begin
  if user_id is null then
    raise insufficient_privilege using message = 'Consultation is unavailable';
  end if;

  select profiles.role, patients.id, doctors.id
  into actor_role, actor_patient_id, actor_doctor_id
  from public.profiles
  left join public.patients on patients.profile_id = profiles.id
  left join public.doctors on doctors.profile_id = profiles.id
  where profiles.auth_user_id = user_id;

  select * into current_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found
    or current_appointment.status not in ('CONFIRMED', 'IN_PROGRESS')
    or not (
      (actor_role = 'patient' and actor_patient_id = current_appointment.patient_id)
      or (actor_role = 'doctor' and actor_doctor_id = current_appointment.doctor_id)
    )
  then
    raise insufficient_privilege using message = 'Consultation is unavailable';
  end if;

  -- A patient may enter the room, but only the assigned doctor starts the
  -- clinical encounter. Repeated calls are intentionally idempotent.
  if current_appointment.status = 'CONFIRMED'
    and actor_role = 'doctor'
    and actor_doctor_id = current_appointment.doctor_id
  then
    update public.appointments
    set status = 'IN_PROGRESS'
    where id = current_appointment.id;

    insert into public.audit_events (
      actor_user_id, action, target_type, target_id, outcome
    ) values (
      user_id, 'appointment_status_transitioned', 'appointment',
      current_appointment.id, 'success'
    );

    return 'IN_PROGRESS';
  end if;

  return current_appointment.status;
end;
$$;

revoke execute on function public.start_appointment_consultation(uuid)
from public, anon;
grant execute on function public.start_appointment_consultation(uuid)
to authenticated;

comment on function public.start_appointment_consultation(uuid) is
  'Allows assigned participants to enter a live consultation and only the assigned doctor to idempotently transition CONFIRMED to IN_PROGRESS.';
