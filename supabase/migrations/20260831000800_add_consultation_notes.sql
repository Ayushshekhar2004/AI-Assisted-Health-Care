create type public.consultation_note_status as enum ('DRAFT', 'FINALIZED');
create type public.telemedicine_adequacy as enum ('ADEQUATE', 'REQUIRES_IN_PERSON');

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id) on delete restrict,
  doctor_id uuid not null references public.doctors (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  subjective_history text not null default '',
  examination_observations text not null default '',
  assessment text not null default '',
  plan text not null default '',
  follow_up text not null default '',
  telemedicine_adequacy public.telemedicine_adequacy,
  status public.consultation_note_status not null default 'DRAFT',
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consultations_content_lengths check (
    char_length(subjective_history) <= 8000
    and char_length(examination_observations) <= 8000
    and char_length(assessment) <= 8000
    and char_length(plan) <= 8000
    and char_length(follow_up) <= 4000
  ),
  constraint consultations_finalization_complete check (
    (status = 'DRAFT' and finalized_at is null)
    or (
      status = 'FINALIZED'
      and finalized_at is not null
      and telemedicine_adequacy is not null
      and char_length(btrim(subjective_history)) > 0
      and char_length(btrim(examination_observations)) > 0
      and char_length(btrim(assessment)) > 0
      and char_length(btrim(plan)) > 0
    )
  )
);

create index consultations_doctor_created_idx
on public.consultations (doctor_id, created_at desc);
create index consultations_patient_finalized_idx
on public.consultations (patient_id, finalized_at desc)
where status = 'FINALIZED';

create trigger consultations_set_updated_at
before update on public.consultations
for each row execute function public.set_updated_at();

create function public.prevent_finalized_consultation_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'FINALIZED' then
    raise check_violation using message = 'Finalized consultation cannot be changed';
  end if;
  if (new.appointment_id, new.doctor_id, new.patient_id) is distinct from
     (old.appointment_id, old.doctor_id, old.patient_id) then
    raise check_violation using message = 'Consultation participants are immutable';
  end if;
  return new;
end;
$$;

create trigger consultations_prevent_finalized_changes
before update on public.consultations
for each row execute function public.prevent_finalized_consultation_changes();

alter table public.consultations enable row level security;
revoke all on table public.consultations from anon, authenticated;
grant select on table public.consultations to authenticated;
revoke execute on function public.prevent_finalized_consultation_changes()
from public, anon, authenticated;

create policy consultations_assigned_verified_doctor_read
on public.consultations for select to authenticated
using (
  exists (
    select 1 from public.doctors
    join public.profiles on profiles.id = doctors.profile_id
    where doctors.id = consultations.doctor_id
      and doctors.status = 'verified'
      and profiles.role = 'doctor'
      and profiles.auth_user_id = (select auth.uid())
  )
);

create policy consultations_patient_finalized_read
on public.consultations for select to authenticated
using (
  status = 'FINALIZED'
  and exists (
    select 1 from public.patients
    join public.profiles on profiles.id = patients.profile_id
    where patients.id = consultations.patient_id
      and profiles.role = 'patient'
      and profiles.auth_user_id = (select auth.uid())
  )
);

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
      'doctor_handoff_viewed', 'doctor_handoff_marked_inaccurate',
      'appointment_video_token_issued', 'consultation_draft_saved',
      'consultation_finalized', 'consultation_viewed'
    )
  );

create function public.save_consultation_draft(
  p_appointment_id uuid,
  p_subjective_history text,
  p_examination_observations text,
  p_assessment text,
  p_plan text,
  p_follow_up text,
  p_telemedicine_adequacy public.telemedicine_adequacy
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  selected_appointment public.appointments%rowtype;
  actor_doctor_id uuid;
  consultation_id uuid;
begin
  select doctors.id into actor_doctor_id
  from public.doctors
  join public.profiles on profiles.id = doctors.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'doctor'
    and doctors.status = 'verified';

  select * into selected_appointment from public.appointments
  where id = p_appointment_id for update;

  if actor_doctor_id is null
    or not found
    or selected_appointment.doctor_id <> actor_doctor_id
    or selected_appointment.status <> 'IN_PROGRESS'
  then
    raise insufficient_privilege using message = 'Consultation note is unavailable';
  end if;

  insert into public.consultations (
    appointment_id, doctor_id, patient_id, subjective_history,
    examination_observations, assessment, plan, follow_up,
    telemedicine_adequacy
  ) values (
    selected_appointment.id, selected_appointment.doctor_id,
    selected_appointment.patient_id, coalesce(p_subjective_history, ''),
    coalesce(p_examination_observations, ''), coalesce(p_assessment, ''),
    coalesce(p_plan, ''), coalesce(p_follow_up, ''), p_telemedicine_adequacy
  )
  on conflict (appointment_id) do update set
    subjective_history = excluded.subjective_history,
    examination_observations = excluded.examination_observations,
    assessment = excluded.assessment,
    plan = excluded.plan,
    follow_up = excluded.follow_up,
    telemedicine_adequacy = excluded.telemedicine_adequacy
  where consultations.status = 'DRAFT'
  returning id into consultation_id;

  if consultation_id is null then
    raise invalid_parameter_value using message = 'Consultation note is unavailable';
  end if;

  insert into public.audit_events (actor_user_id, action, target_type, target_id, outcome)
  values (user_id, 'consultation_draft_saved', 'appointment', selected_appointment.id, 'success');
  return consultation_id;
end;
$$;

create function public.finalize_consultation(
  p_appointment_id uuid,
  p_subjective_history text,
  p_examination_observations text,
  p_assessment text,
  p_plan text,
  p_follow_up text,
  p_telemedicine_adequacy public.telemedicine_adequacy
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  selected_appointment public.appointments%rowtype;
  actor_doctor_id uuid;
  consultation_id uuid;
begin
  if p_telemedicine_adequacy is null
    or char_length(btrim(coalesce(p_subjective_history, ''))) = 0
    or char_length(btrim(coalesce(p_examination_observations, ''))) = 0
    or char_length(btrim(coalesce(p_assessment, ''))) = 0
    or char_length(btrim(coalesce(p_plan, ''))) = 0
  then
    raise check_violation using message = 'Final consultation note is incomplete';
  end if;

  select doctors.id into actor_doctor_id
  from public.doctors
  join public.profiles on profiles.id = doctors.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'doctor'
    and doctors.status = 'verified';

  select * into selected_appointment from public.appointments
  where id = p_appointment_id for update;

  if actor_doctor_id is null
    or not found
    or selected_appointment.doctor_id <> actor_doctor_id
    or selected_appointment.status <> 'IN_PROGRESS'
  then
    raise insufficient_privilege using message = 'Consultation note is unavailable';
  end if;

  insert into public.consultations (
    appointment_id, doctor_id, patient_id, subjective_history,
    examination_observations, assessment, plan, follow_up,
    telemedicine_adequacy, status, finalized_at
  ) values (
    selected_appointment.id, selected_appointment.doctor_id,
    selected_appointment.patient_id, btrim(p_subjective_history),
    btrim(p_examination_observations), btrim(p_assessment), btrim(p_plan),
    btrim(coalesce(p_follow_up, '')), p_telemedicine_adequacy,
    'FINALIZED', now()
  )
  on conflict (appointment_id) do update set
    subjective_history = excluded.subjective_history,
    examination_observations = excluded.examination_observations,
    assessment = excluded.assessment,
    plan = excluded.plan,
    follow_up = excluded.follow_up,
    telemedicine_adequacy = excluded.telemedicine_adequacy,
    status = 'FINALIZED',
    finalized_at = excluded.finalized_at
  where consultations.status = 'DRAFT'
  returning id into consultation_id;

  if consultation_id is null then
    raise invalid_parameter_value using message = 'Consultation note is unavailable';
  end if;

  update public.appointments set status = case
    when p_telemedicine_adequacy = 'ADEQUATE' then 'COMPLETED'::public.appointment_status
    else 'REQUIRES_IN_PERSON'::public.appointment_status
  end where id = selected_appointment.id;

  insert into public.audit_events (actor_user_id, action, target_type, target_id, outcome)
  values (user_id, 'consultation_finalized', 'appointment', selected_appointment.id, 'success');
  insert into public.audit_events (actor_user_id, action, target_type, target_id, outcome)
  values (user_id, 'appointment_status_transitioned', 'appointment', selected_appointment.id, 'success');
  return consultation_id;
end;
$$;

create function public.get_own_consultation(p_appointment_id uuid)
returns setof public.consultations
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  allowed boolean;
begin
  select exists (
    select 1 from public.consultations
    join public.doctors on doctors.id = consultations.doctor_id
    join public.profiles as doctor_profile on doctor_profile.id = doctors.profile_id
    join public.patients on patients.id = consultations.patient_id
    join public.profiles as patient_profile on patient_profile.id = patients.profile_id
    where consultations.appointment_id = p_appointment_id
      and (
        (doctor_profile.auth_user_id = user_id and doctors.status = 'verified')
        or (patient_profile.auth_user_id = user_id and consultations.status = 'FINALIZED')
      )
  ) into allowed;

  if not allowed then return; end if;
  insert into public.audit_events (actor_user_id, action, target_type, target_id, outcome)
  values (user_id, 'consultation_viewed', 'appointment', p_appointment_id, 'success');
  return query select * from public.consultations where appointment_id = p_appointment_id;
end;
$$;

revoke execute on function public.save_consultation_draft(uuid, text, text, text, text, text, public.telemedicine_adequacy) from public, anon;
revoke execute on function public.finalize_consultation(uuid, text, text, text, text, text, public.telemedicine_adequacy) from public, anon;
revoke execute on function public.get_own_consultation(uuid) from public, anon;
grant execute on function public.save_consultation_draft(uuid, text, text, text, text, text, public.telemedicine_adequacy) to authenticated;
grant execute on function public.finalize_consultation(uuid, text, text, text, text, text, public.telemedicine_adequacy) to authenticated;
grant execute on function public.get_own_consultation(uuid) to authenticated;

comment on table public.consultations is
  'Clinician-authored consultation notes. Drafts are visible only to the assigned verified doctor; patients can read only finalized notes.';
