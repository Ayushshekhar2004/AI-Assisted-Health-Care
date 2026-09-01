create type public.appointment_change_type as enum ('CANCELLED','RESCHEDULED');
create type public.appointment_change_reason as enum (
  'PATIENT_SCHEDULE_CONFLICT','CARE_NO_LONGER_NEEDED','DOCTOR_UNAVAILABLE','CLINIC_OPERATIONAL','OTHER'
);

create table public.appointment_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  source_appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  replacement_appointment_id uuid unique references public.appointments(id) on delete restrict,
  change_type public.appointment_change_type not null,
  reason_category public.appointment_change_reason not null,
  actor_user_id uuid not null,
  actor_role public.profile_role not null,
  created_at timestamptz not null default now(),
  constraint appointment_change_actor_role check (actor_role in ('patient','doctor')),
  constraint appointment_change_replacement_consistent check (
    (change_type='CANCELLED' and replacement_appointment_id is null)
    or (change_type='RESCHEDULED' and replacement_appointment_id is not null)
  )
);

create index appointment_schedule_changes_replacement_idx
on public.appointment_schedule_changes(replacement_appointment_id)
where replacement_appointment_id is not null;

alter table public.appointment_schedule_changes enable row level security;
revoke all on public.appointment_schedule_changes from public,anon,authenticated;
grant select on public.appointment_schedule_changes to authenticated;

create policy appointment_schedule_changes_participant_read
on public.appointment_schedule_changes for select to authenticated using (
  exists (
    select 1 from public.appointments
    left join public.patients on patients.id=appointments.patient_id
    left join public.profiles patient_profiles on patient_profiles.id=patients.profile_id
    left join public.doctors on doctors.id=appointments.doctor_id
    left join public.profiles doctor_profiles on doctor_profiles.id=doctors.profile_id
    where appointments.id=appointment_schedule_changes.source_appointment_id
      and (
        (patient_profiles.auth_user_id=(select auth.uid()) and patient_profiles.role='patient')
        or (doctor_profiles.auth_user_id=(select auth.uid()) and doctor_profiles.role='doctor')
      )
  )
);

alter table public.audit_events drop constraint audit_events_action_allowed;
alter table public.audit_events add constraint audit_events_action_allowed check(action in (
  'doctor_verification_approved','doctor_verification_rejected','doctor_availability_created','doctor_availability_deleted',
  'appointment_requested','appointment_status_transitioned','appointment_cancelled','appointment_rescheduled',
  'intake_session_started','intake_message_added','intake_patient_message_added','intake_assistant_turn_recorded',
  'triage_no_red_flag_recorded','triage_red_flag_detected','triage_emergency_pathway_entered',
  'specialty_routing_recorded','doctor_match_searched','intake_voice_session_issued','doctor_dashboard_viewed',
  'doctor_appointment_detail_viewed','doctor_appointment_transcript_viewed','doctor_handoff_source_accessed',
  'doctor_handoff_generated','doctor_handoff_viewed','doctor_handoff_marked_inaccurate','appointment_video_token_issued',
  'consultation_draft_saved','consultation_finalized','consultation_viewed','consultation_ai_source_accessed',
  'consultation_ai_draft_generated','prescription_draft_saved','prescription_finalized','prescription_viewed',
  'consultation_outcome_recorded','consultation_outcome_viewed','consultation_document_generated',
  'patient_document_uploaded','patient_documents_listed','patient_document_downloaded','doctor_documents_listed',
  'doctor_document_downloaded','safe_care_guidance_recorded','patient_history_viewed',
  'patient_consultation_packet_downloaded'
));

create function public.cancel_appointment(
  p_appointment_id uuid,
  p_reason_category public.appointment_change_reason
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_role public.profile_role;
  actor_patient_id uuid;
  actor_doctor_id uuid;
  selected_appointment public.appointments%rowtype;
begin
  select profiles.role,patients.id,doctors.id
  into actor_role,actor_patient_id,actor_doctor_id
  from public.profiles
  left join public.patients on patients.profile_id=profiles.id
  left join public.doctors on doctors.profile_id=profiles.id and doctors.status='verified'
  where profiles.auth_user_id=user_id;

  select * into selected_appointment from public.appointments
  where id=p_appointment_id for update;

  if selected_appointment.id is null
    or selected_appointment.status not in ('REQUESTED','CONFIRMED')
    or not (
      (actor_role='patient' and actor_patient_id=selected_appointment.patient_id
        and p_reason_category in ('PATIENT_SCHEDULE_CONFLICT','CARE_NO_LONGER_NEEDED','OTHER'))
      or (actor_role='doctor' and actor_doctor_id=selected_appointment.doctor_id
        and p_reason_category in ('DOCTOR_UNAVAILABLE','CLINIC_OPERATIONAL','OTHER'))
    )
    or exists(select 1 from public.consultations where appointment_id=p_appointment_id and status='FINALIZED')
    or exists(select 1 from public.prescriptions where appointment_id=p_appointment_id and status='FINAL')
    or exists(select 1 from public.consultation_outcomes where appointment_id=p_appointment_id)
  then raise insufficient_privilege using message='Appointment cancellation is unavailable'; end if;

  update public.appointments set status='CANCELLED' where id=p_appointment_id;
  insert into public.appointment_schedule_changes(
    source_appointment_id,change_type,reason_category,actor_user_id,actor_role
  ) values(p_appointment_id,'CANCELLED',p_reason_category,user_id,actor_role);
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'appointment_cancelled','appointment',p_appointment_id,'success');
end;
$$;

create function public.reschedule_appointment(
  p_appointment_id uuid,
  p_new_availability_id uuid,
  p_reason_category public.appointment_change_reason
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_role public.profile_role;
  actor_patient_id uuid;
  actor_doctor_id uuid;
  selected_appointment public.appointments%rowtype;
  selected_availability public.doctor_availability%rowtype;
  replacement_id uuid;
begin
  select profiles.role,patients.id,doctors.id
  into actor_role,actor_patient_id,actor_doctor_id
  from public.profiles
  left join public.patients on patients.profile_id=profiles.id
  left join public.doctors on doctors.profile_id=profiles.id and doctors.status='verified'
  where profiles.auth_user_id=user_id;

  select * into selected_appointment from public.appointments
  where id=p_appointment_id for update;
  select * into selected_availability from public.doctor_availability
  where id=p_new_availability_id for update;

  if selected_appointment.id is null or selected_availability.id is null
    or selected_appointment.status not in ('REQUESTED','CONFIRMED')
    or selected_availability.doctor_id<>selected_appointment.doctor_id
    or selected_availability.starts_at<=now()
    or exists(select 1 from public.appointments where doctor_availability_id=p_new_availability_id
      and status in ('REQUESTED','CONFIRMED','IN_PROGRESS'))
    or not exists(select 1 from public.doctors where id=selected_appointment.doctor_id
      and status='verified' and is_bookable)
    or not (
      (actor_role='patient' and actor_patient_id=selected_appointment.patient_id
        and p_reason_category in ('PATIENT_SCHEDULE_CONFLICT','OTHER'))
      or (actor_role='doctor' and actor_doctor_id=selected_appointment.doctor_id
        and p_reason_category in ('DOCTOR_UNAVAILABLE','CLINIC_OPERATIONAL','OTHER'))
    )
    or exists(select 1 from public.consultations where appointment_id=p_appointment_id and status='FINALIZED')
    or exists(select 1 from public.prescriptions where appointment_id=p_appointment_id and status='FINAL')
    or exists(select 1 from public.consultation_outcomes where appointment_id=p_appointment_id)
  then raise insufficient_privilege using message='Appointment rescheduling is unavailable'; end if;

  update public.appointments set status='CANCELLED' where id=p_appointment_id;
  insert into public.appointments(
    doctor_availability_id,doctor_id,patient_id,starts_at,ends_at,fee_paise,status,intake_session_id
  ) values(
    selected_availability.id,selected_appointment.doctor_id,selected_appointment.patient_id,
    selected_availability.starts_at,selected_availability.ends_at,selected_appointment.fee_paise,
    'REQUESTED',selected_appointment.intake_session_id
  ) returning id into replacement_id;
  insert into public.appointment_schedule_changes(
    source_appointment_id,replacement_appointment_id,change_type,reason_category,actor_user_id,actor_role
  ) values(p_appointment_id,replacement_id,'RESCHEDULED',p_reason_category,user_id,actor_role);
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'appointment_rescheduled','appointment',p_appointment_id,'success');
  return replacement_id;
end;
$$;

create function public.list_appointment_reschedule_options(p_appointment_id uuid)
returns table(availability_id uuid,starts_at timestamptz,ends_at timestamptz)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  user_id uuid := (select auth.uid());
  selected_appointment public.appointments%rowtype;
begin
  select * into selected_appointment from public.appointments where id=p_appointment_id;
  if selected_appointment.id is null or selected_appointment.status not in ('REQUESTED','CONFIRMED')
    or not exists(
      select 1 from public.profiles
      left join public.patients on patients.profile_id=profiles.id
      left join public.doctors on doctors.profile_id=profiles.id
      where profiles.auth_user_id=user_id and (
        (profiles.role='patient' and patients.id=selected_appointment.patient_id)
        or (profiles.role='doctor' and doctors.id=selected_appointment.doctor_id and doctors.status='verified')
      )
    )
  then raise insufficient_privilege using message='Reschedule options are unavailable'; end if;
  return query select availability.id,availability.starts_at,availability.ends_at
  from public.doctor_availability availability
  where availability.doctor_id=selected_appointment.doctor_id
    and availability.id<>selected_appointment.doctor_availability_id
    and availability.starts_at>now()
    and not exists(select 1 from public.appointments where doctor_availability_id=availability.id
      and status in ('REQUESTED','CONFIRMED','IN_PROGRESS'))
  order by availability.starts_at limit 25;
end;
$$;

create or replace function public.transition_appointment_status(
  p_appointment_id uuid,p_next_status public.appointment_status
)
returns void language plpgsql security definer set search_path='' as $$
declare
  user_id uuid := (select auth.uid()); current_appointment public.appointments%rowtype;
  actor_role public.profile_role; actor_patient_id uuid; actor_doctor_id uuid; transition_allowed boolean:=false;
begin
  if user_id is null or p_next_status='CANCELLED' then
    raise insufficient_privilege using message='Appointment transition is unavailable'; end if;
  select profiles.role,patients.id,doctors.id into actor_role,actor_patient_id,actor_doctor_id
  from public.profiles left join public.patients on patients.profile_id=profiles.id
  left join public.doctors on doctors.profile_id=profiles.id where profiles.auth_user_id=user_id;
  select * into current_appointment from public.appointments where id=p_appointment_id for update;
  if not found or p_next_status=current_appointment.status then
    raise invalid_parameter_value using message='Appointment transition is unavailable'; end if;
  if actor_role='doctor' and actor_doctor_id=current_appointment.doctor_id and (
    (current_appointment.status='REQUESTED' and p_next_status in ('CONFIRMED','REQUIRES_IN_PERSON'))
    or (current_appointment.status='CONFIRMED' and p_next_status in ('IN_PROGRESS','NO_SHOW','REQUIRES_IN_PERSON'))
    or (current_appointment.status='IN_PROGRESS' and p_next_status in ('COMPLETED','REQUIRES_IN_PERSON'))
  ) then transition_allowed:=true; end if;
  if not transition_allowed then raise insufficient_privilege using message='Appointment transition is unavailable'; end if;
  update public.appointments set status=p_next_status where id=current_appointment.id;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'appointment_status_transitioned','appointment',current_appointment.id,'success');
end;
$$;

revoke execute on function public.cancel_appointment(uuid,public.appointment_change_reason),
  public.reschedule_appointment(uuid,uuid,public.appointment_change_reason),
  public.list_appointment_reschedule_options(uuid) from public,anon;
grant execute on function public.cancel_appointment(uuid,public.appointment_change_reason),
  public.reschedule_appointment(uuid,uuid,public.appointment_change_reason),
  public.list_appointment_reschedule_options(uuid) to authenticated;

comment on table public.appointment_schedule_changes is
  'Immutable categorical cancellation/reschedule records; no clinical or free-text content.';
comment on function public.reschedule_appointment(uuid,uuid,public.appointment_change_reason) is
  'Atomically cancels an eligible appointment and creates a same-doctor replacement without mutating clinical records.';
