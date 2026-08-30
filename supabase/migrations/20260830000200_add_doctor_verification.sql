alter table public.doctors
  add column verification_reason text,
  add column verification_decided_at timestamptz,
  add column verification_decided_by uuid,
  add constraint doctors_verification_reason_length check (
    verification_reason is null
    or char_length(btrim(verification_reason)) between 5 and 500
  ),
  add constraint doctors_verification_decision_complete check (
    (
      status = 'pending_verification'
      and verification_reason is null
      and verification_decided_at is null
      and verification_decided_by is null
    )
    or (
      status in ('verified', 'rejected')
      and verification_reason is not null
      and verification_decided_at is not null
      and verification_decided_by is not null
    )
    or status = 'suspended'
  );

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  outcome text not null,
  created_at timestamptz not null default now(),
  constraint audit_events_action_allowed check (
    action in ('doctor_verification_approved', 'doctor_verification_rejected')
  ),
  constraint audit_events_target_type_allowed check (target_type = 'doctor'),
  constraint audit_events_outcome_allowed check (outcome = 'success')
);

create index audit_events_target_created_idx
on public.audit_events (target_type, target_id, created_at desc);

create index audit_events_actor_created_idx
on public.audit_events (actor_user_id, created_at desc);

alter table public.audit_events enable row level security;
revoke all on table public.audit_events from anon, authenticated;

create function public.transition_doctor_verification(
  p_doctor_id uuid,
  p_decision text,
  p_reason text,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  transition_action text;
  next_status public.doctor_status;
begin
  if not exists (
    select 1
    from public.profiles
    where profiles.auth_user_id = p_actor_user_id
      and profiles.role = 'operations'
  ) then
    raise insufficient_privilege using message = 'Verification is unavailable';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) not between 5 and 500 then
    raise check_violation using message = 'Verification reason is invalid';
  end if;

  if p_decision = 'approved' then
    next_status := 'verified';
    transition_action := 'doctor_verification_approved';
  elsif p_decision = 'rejected' then
    next_status := 'rejected';
    transition_action := 'doctor_verification_rejected';
  else
    raise check_violation using message = 'Verification decision is invalid';
  end if;

  update public.doctors
  set
    status = next_status,
    verification_reason = btrim(p_reason),
    verification_decided_at = now(),
    verification_decided_by = p_actor_user_id,
    is_bookable = (next_status = 'verified')
  where id = p_doctor_id
    and status = 'pending_verification'
    and onboarding_completed_at is not null;

  if not found then
    raise invalid_parameter_value using message = 'Doctor verification transition is unavailable';
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
    transition_action,
    'doctor',
    p_doctor_id,
    'success'
  );
end;
$$;

revoke execute on function public.transition_doctor_verification(uuid, text, text, uuid)
from public, anon, authenticated;

grant execute on function public.transition_doctor_verification(uuid, text, text, uuid)
to service_role;

comment on table public.audit_events is
  'Content-free security and compliance events. Clinical content and decision reasons are excluded.';

comment on function public.transition_doctor_verification(uuid, text, text, uuid) is
  'Service-only atomic doctor verification transition with mandatory audit event.';
