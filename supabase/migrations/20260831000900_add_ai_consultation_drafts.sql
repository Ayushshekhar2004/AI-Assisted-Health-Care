alter table public.consultations
  add column finalized_by_doctor_id uuid references public.doctors (id) on delete restrict,
  add column ai_draft_generated_at timestamptz,
  add column ai_model_name text,
  add column ai_model_version text,
  add column ai_prompt_version text;

update public.consultations
set finalized_by_doctor_id = doctor_id
where status = 'FINALIZED' and finalized_by_doctor_id is null;

alter table public.consultations drop constraint consultations_finalization_complete;
alter table public.consultations
  add constraint consultations_finalization_complete check (
    (status = 'DRAFT' and finalized_at is null and finalized_by_doctor_id is null)
    or (
      status = 'FINALIZED'
      and finalized_at is not null
      and finalized_by_doctor_id = doctor_id
      and telemedicine_adequacy is not null
      and char_length(btrim(subjective_history)) > 0
      and char_length(btrim(examination_observations)) > 0
      and char_length(btrim(assessment)) > 0
      and char_length(btrim(plan)) > 0
    )
  ),
  add constraint consultations_ai_provenance_complete check (
    (ai_draft_generated_at is null and ai_model_name is null and ai_model_version is null and ai_prompt_version is null)
    or (
      ai_draft_generated_at is not null
      and char_length(btrim(ai_model_name)) between 1 and 120
      and char_length(btrim(ai_model_version)) between 1 and 120
      and char_length(btrim(ai_prompt_version)) between 1 and 64
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
      'consultation_finalized', 'consultation_viewed',
      'consultation_ai_source_accessed', 'consultation_ai_draft_generated'
    )
  );

create function public.get_consultation_ai_draft_source(p_appointment_id uuid)
returns table (structured_data jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_doctor_id uuid;
begin
  select doctors.id into actor_doctor_id
  from public.doctors join public.profiles on profiles.id = doctors.profile_id
  where profiles.auth_user_id = user_id and profiles.role = 'doctor'
    and doctors.status = 'verified';

  if actor_doctor_id is null or not exists (
    select 1 from public.appointments
    where appointments.id = p_appointment_id
      and appointments.doctor_id = actor_doctor_id
      and appointments.status = 'IN_PROGRESS'
  ) then
    raise insufficient_privilege using message = 'Consultation AI draft is unavailable';
  end if;

  insert into public.audit_events (actor_user_id, action, target_type, target_id, outcome)
  values (user_id, 'consultation_ai_source_accessed', 'appointment', p_appointment_id, 'success');

  return query
  select intake_structured.structured_data
  from public.appointments
  left join public.intake_structured
    on intake_structured.intake_session_id = appointments.intake_session_id
  where appointments.id = p_appointment_id;
end;
$$;

create function public.record_consultation_ai_draft(
  p_actor_user_id uuid, p_appointment_id uuid,
  p_subjective_history text, p_examination_observations text,
  p_assessment text, p_plan text, p_follow_up text,
  p_model_name text, p_model_version text, p_prompt_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_appointment public.appointments%rowtype;
  actor_doctor_id uuid;
  consultation_id uuid;
begin
  select doctors.id into actor_doctor_id
  from public.doctors join public.profiles on profiles.id = doctors.profile_id
  where profiles.auth_user_id = p_actor_user_id and profiles.role = 'doctor'
    and doctors.status = 'verified';
  select * into selected_appointment from public.appointments
  where id = p_appointment_id for update;
  if actor_doctor_id is null or not found
    or selected_appointment.doctor_id <> actor_doctor_id
    or selected_appointment.status <> 'IN_PROGRESS'
  then raise insufficient_privilege using message = 'Consultation AI draft is unavailable';
  end if;

  insert into public.consultations (
    appointment_id, doctor_id, patient_id, subjective_history,
    examination_observations, assessment, plan, follow_up,
    ai_draft_generated_at, ai_model_name, ai_model_version, ai_prompt_version
  ) values (
    selected_appointment.id, selected_appointment.doctor_id, selected_appointment.patient_id,
    coalesce(p_subjective_history,''), coalesce(p_examination_observations,''),
    coalesce(p_assessment,''), coalesce(p_plan,''), coalesce(p_follow_up,''),
    now(), p_model_name, p_model_version, p_prompt_version
  ) on conflict (appointment_id) do update set
    subjective_history=excluded.subjective_history,
    examination_observations=excluded.examination_observations,
    assessment=excluded.assessment, plan=excluded.plan, follow_up=excluded.follow_up,
    ai_draft_generated_at=excluded.ai_draft_generated_at,
    ai_model_name=excluded.ai_model_name, ai_model_version=excluded.ai_model_version,
    ai_prompt_version=excluded.ai_prompt_version
  where consultations.status='DRAFT'
  returning id into consultation_id;
  if consultation_id is null then
    raise invalid_parameter_value using message = 'Consultation AI draft is unavailable';
  end if;
  insert into public.audit_events (actor_user_id, action, target_type, target_id, outcome)
  values (p_actor_user_id, 'consultation_ai_draft_generated', 'appointment', p_appointment_id, 'success');
  return consultation_id;
end;
$$;

create or replace function public.finalize_consultation(
  p_appointment_id uuid, p_subjective_history text,
  p_examination_observations text, p_assessment text, p_plan text,
  p_follow_up text, p_telemedicine_adequacy public.telemedicine_adequacy
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  user_id uuid := (select auth.uid());
  selected_appointment public.appointments%rowtype;
  actor_doctor_id uuid;
  consultation_id uuid;
begin
  if p_telemedicine_adequacy is null
    or char_length(btrim(coalesce(p_subjective_history,'')))=0
    or char_length(btrim(coalesce(p_examination_observations,'')))=0
    or char_length(btrim(coalesce(p_assessment,'')))=0
    or char_length(btrim(coalesce(p_plan,'')))=0
  then raise check_violation using message='Final consultation note is incomplete'; end if;
  select doctors.id into actor_doctor_id from public.doctors
  join public.profiles on profiles.id=doctors.profile_id
  where profiles.auth_user_id=user_id and profiles.role='doctor' and doctors.status='verified';
  select * into selected_appointment from public.appointments where id=p_appointment_id for update;
  if actor_doctor_id is null or not found or selected_appointment.doctor_id<>actor_doctor_id
    or selected_appointment.status<>'IN_PROGRESS'
  then raise insufficient_privilege using message='Consultation note is unavailable'; end if;
  insert into public.consultations (
    appointment_id,doctor_id,patient_id,subjective_history,examination_observations,
    assessment,plan,follow_up,telemedicine_adequacy,status,finalized_at,finalized_by_doctor_id
  ) values (
    selected_appointment.id,selected_appointment.doctor_id,selected_appointment.patient_id,
    btrim(p_subjective_history),btrim(p_examination_observations),btrim(p_assessment),
    btrim(p_plan),btrim(coalesce(p_follow_up,'')),p_telemedicine_adequacy,
    'FINALIZED',now(),actor_doctor_id
  ) on conflict (appointment_id) do update set
    subjective_history=excluded.subjective_history,
    examination_observations=excluded.examination_observations,
    assessment=excluded.assessment,plan=excluded.plan,follow_up=excluded.follow_up,
    telemedicine_adequacy=excluded.telemedicine_adequacy,status='FINALIZED',
    finalized_at=excluded.finalized_at,finalized_by_doctor_id=excluded.finalized_by_doctor_id
  where consultations.status='DRAFT' returning id into consultation_id;
  if consultation_id is null then raise invalid_parameter_value using message='Consultation note is unavailable'; end if;
  update public.appointments set status=case when p_telemedicine_adequacy='ADEQUATE'
    then 'COMPLETED'::public.appointment_status else 'REQUIRES_IN_PERSON'::public.appointment_status end
  where id=selected_appointment.id;
  insert into public.audit_events (actor_user_id,action,target_type,target_id,outcome)
  values (user_id,'consultation_finalized','appointment',selected_appointment.id,'success'),
    (user_id,'appointment_status_transitioned','appointment',selected_appointment.id,'success');
  return consultation_id;
end; $$;

revoke execute on function public.get_consultation_ai_draft_source(uuid) from public, anon;
grant execute on function public.get_consultation_ai_draft_source(uuid) to authenticated;
revoke execute on function public.record_consultation_ai_draft(uuid,uuid,text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_consultation_ai_draft(uuid,uuid,text,text,text,text,text,text,text,text) to service_role;
