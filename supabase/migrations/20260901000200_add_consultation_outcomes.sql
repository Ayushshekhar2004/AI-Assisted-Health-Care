create type public.consultation_outcome_type as enum (
  'TELECONSULT_COMPLETED','FOLLOW_UP_REQUIRED','REFER_SPECIALTY','PHYSICAL_EXAM_REQUIRED'
);

create table public.consultation_outcomes (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references public.consultations(id) on delete restrict,
  appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  doctor_id uuid not null references public.doctors(id) on delete restrict,
  outcome public.consultation_outcome_type not null,
  referral_specialty text,
  clinic_location text,
  location_instructions text,
  appointment_note text,
  recorded_by_doctor_id uuid not null references public.doctors(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consultation_outcomes_specialty_allowed check (
    referral_specialty is null or referral_specialty in (
      'GENERAL_MEDICINE','PEDIATRICS','OBSTETRICS_GYNECOLOGY','DERMATOLOGY','ORTHOPEDICS',
      'OTORHINOLARYNGOLOGY','OPHTHALMOLOGY','PSYCHIATRY','CARDIOLOGY','NEUROLOGY',
      'PULMONOLOGY','GASTROENTEROLOGY'
    )
  ),
  constraint consultation_outcomes_field_lengths check (
    (clinic_location is null or char_length(btrim(clinic_location)) between 1 and 500)
    and (location_instructions is null or char_length(btrim(location_instructions)) between 1 and 1000)
    and (appointment_note is null or char_length(btrim(appointment_note)) between 1 and 2000)
  ),
  constraint consultation_outcomes_required_fields check (
    (outcome='REFER_SPECIALTY' and referral_specialty is not null
      and clinic_location is null and location_instructions is null and appointment_note is null)
    or (outcome='PHYSICAL_EXAM_REQUIRED' and referral_specialty is null
      and clinic_location is not null and location_instructions is not null and appointment_note is not null)
    or (outcome in ('TELECONSULT_COMPLETED','FOLLOW_UP_REQUIRED') and referral_specialty is null
      and clinic_location is null and location_instructions is null and appointment_note is null)
  ),
  constraint consultation_outcomes_actor_matches check (recorded_by_doctor_id=doctor_id)
);

create trigger consultation_outcomes_set_updated_at before update on public.consultation_outcomes
for each row execute function public.set_updated_at();
alter table public.consultation_outcomes enable row level security;
revoke all on public.consultation_outcomes from anon,authenticated;
grant select on public.consultation_outcomes to authenticated;
create policy consultation_outcomes_assigned_doctor_read on public.consultation_outcomes for select to authenticated using (
  exists(select 1 from public.doctors join public.profiles on profiles.id=doctors.profile_id
    where doctors.id=consultation_outcomes.doctor_id and doctors.status='verified'
      and profiles.auth_user_id=(select auth.uid()) and profiles.role='doctor')
);
create policy consultation_outcomes_assigned_patient_read on public.consultation_outcomes for select to authenticated using (
  exists(select 1 from public.patients join public.profiles on profiles.id=patients.profile_id
    where patients.id=consultation_outcomes.patient_id and profiles.auth_user_id=(select auth.uid()) and profiles.role='patient')
);

alter table public.audit_events drop constraint audit_events_action_allowed;
alter table public.audit_events add constraint audit_events_action_allowed check(action in (
  'doctor_verification_approved','doctor_verification_rejected','doctor_availability_created','doctor_availability_deleted',
  'appointment_requested','appointment_status_transitioned','intake_session_started','intake_message_added',
  'intake_patient_message_added','intake_assistant_turn_recorded','triage_no_red_flag_recorded','triage_red_flag_detected',
  'triage_emergency_pathway_entered','specialty_routing_recorded','doctor_match_searched','intake_voice_session_issued',
  'doctor_dashboard_viewed','doctor_appointment_detail_viewed','doctor_appointment_transcript_viewed',
  'doctor_handoff_source_accessed','doctor_handoff_generated','doctor_handoff_viewed','doctor_handoff_marked_inaccurate',
  'appointment_video_token_issued','consultation_draft_saved','consultation_finalized','consultation_viewed',
  'consultation_ai_source_accessed','consultation_ai_draft_generated','prescription_draft_saved',
  'prescription_finalized','prescription_viewed','consultation_outcome_recorded','consultation_outcome_viewed',
  'consultation_document_generated'
));

create function public.record_consultation_outcome(
  p_appointment_id uuid,p_outcome public.consultation_outcome_type,p_referral_specialty text,
  p_clinic_location text,p_location_instructions text,p_appointment_note text
) returns uuid language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); actor_doctor_id uuid;
  selected_consultation public.consultations%rowtype; selected_appointment public.appointments%rowtype;
  outcome_id uuid;
begin
  select doctors.id into actor_doctor_id from public.doctors join public.profiles on profiles.id=doctors.profile_id
  where profiles.auth_user_id=user_id and profiles.role='doctor' and doctors.status='verified';
  select * into selected_appointment from public.appointments where id=p_appointment_id for update;
  select * into selected_consultation from public.consultations
    where appointment_id=p_appointment_id and status='FINALIZED';
  if actor_doctor_id is null or selected_appointment.id is null or selected_consultation.id is null
    or selected_appointment.doctor_id<>actor_doctor_id or selected_consultation.doctor_id<>actor_doctor_id
    or (p_outcome='PHYSICAL_EXAM_REQUIRED' and selected_appointment.status<>'REQUIRES_IN_PERSON')
    or (p_outcome<>'PHYSICAL_EXAM_REQUIRED' and selected_appointment.status<>'COMPLETED')
  then raise insufficient_privilege using message='Consultation outcome is unavailable'; end if;
  insert into public.consultation_outcomes(
    consultation_id,appointment_id,patient_id,doctor_id,outcome,referral_specialty,
    clinic_location,location_instructions,appointment_note,recorded_by_doctor_id
  ) values(selected_consultation.id,selected_appointment.id,selected_appointment.patient_id,
    actor_doctor_id,p_outcome,nullif(btrim(coalesce(p_referral_specialty,'')),''),
    nullif(btrim(coalesce(p_clinic_location,'')),''),nullif(btrim(coalesce(p_location_instructions,'')),''),
    nullif(btrim(coalesce(p_appointment_note,'')),''),actor_doctor_id)
  returning id into outcome_id;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'consultation_outcome_recorded','appointment',p_appointment_id,'success');
  return outcome_id;
end; $$;

create function public.get_own_consultation_outcome(p_appointment_id uuid)
returns setof public.consultation_outcomes language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); allowed boolean;
begin
  select exists(select 1 from public.consultation_outcomes
    join public.doctors on doctors.id=consultation_outcomes.doctor_id
    join public.profiles dp on dp.id=doctors.profile_id
    join public.patients on patients.id=consultation_outcomes.patient_id
    join public.profiles pp on pp.id=patients.profile_id
    where consultation_outcomes.appointment_id=p_appointment_id and
      ((dp.auth_user_id=user_id and doctors.status='verified') or pp.auth_user_id=user_id)) into allowed;
  if not allowed then return; end if;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'consultation_outcome_viewed','appointment',p_appointment_id,'success');
  return query select * from public.consultation_outcomes where appointment_id=p_appointment_id;
end; $$;

create function public.audit_consultation_document(p_appointment_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid());
begin
  if not exists(select 1 from public.consultations
    join public.doctors on doctors.id=consultations.doctor_id join public.profiles dp on dp.id=doctors.profile_id
    join public.patients on patients.id=consultations.patient_id join public.profiles pp on pp.id=patients.profile_id
    where consultations.appointment_id=p_appointment_id and consultations.status='FINALIZED'
      and (dp.auth_user_id=user_id or pp.auth_user_id=user_id))
  then raise insufficient_privilege using message='Consultation document is unavailable'; end if;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'consultation_document_generated','appointment',p_appointment_id,'success');
end; $$;

revoke execute on function public.record_consultation_outcome(uuid,public.consultation_outcome_type,text,text,text,text) from public,anon;
grant execute on function public.record_consultation_outcome(uuid,public.consultation_outcome_type,text,text,text,text) to authenticated;
revoke execute on function public.get_own_consultation_outcome(uuid),public.audit_consultation_document(uuid) from public,anon;
grant execute on function public.get_own_consultation_outcome(uuid),public.audit_consultation_document(uuid) to authenticated;
