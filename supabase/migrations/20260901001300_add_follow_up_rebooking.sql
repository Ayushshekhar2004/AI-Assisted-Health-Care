create type public.follow_up_timing as enum (
  'WITHIN_7_DAYS','WITHIN_14_DAYS','WITHIN_30_DAYS','AS_NEEDED'
);

create table public.follow_up_recommendations (
  id uuid primary key default gen_random_uuid(),
  source_appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  doctor_id uuid not null references public.doctors(id) on delete restrict,
  timing public.follow_up_timing not null,
  created_by_doctor_id uuid not null references public.doctors(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_up_recommendation_actor_matches check (created_by_doctor_id=doctor_id)
);

create trigger follow_up_recommendations_set_updated_at before update
on public.follow_up_recommendations for each row execute function public.set_updated_at();

alter table public.appointments add column follow_up_recommendation_id uuid
references public.follow_up_recommendations(id) on delete restrict;
create unique index appointments_follow_up_recommendation_unique
on public.appointments(follow_up_recommendation_id)
where follow_up_recommendation_id is not null;

alter table public.follow_up_recommendations enable row level security;
revoke all on public.follow_up_recommendations from public,anon,authenticated;
grant select on public.follow_up_recommendations to authenticated;
create policy follow_up_recommendations_participant_read
on public.follow_up_recommendations for select to authenticated using (
  exists(select 1 from public.patients join public.profiles on profiles.id=patients.profile_id
    where patients.id=follow_up_recommendations.patient_id
      and profiles.auth_user_id=(select auth.uid()) and profiles.role='patient')
  or exists(select 1 from public.doctors join public.profiles on profiles.id=doctors.profile_id
    where doctors.id=follow_up_recommendations.doctor_id and doctors.status='verified'
      and profiles.auth_user_id=(select auth.uid()) and profiles.role='doctor')
);

alter table public.audit_events drop constraint audit_events_action_allowed;
alter table public.audit_events add constraint audit_events_action_allowed check(action in (
  'doctor_verification_approved','doctor_verification_rejected','doctor_availability_created','doctor_availability_deleted',
  'appointment_requested','appointment_status_transitioned','appointment_cancelled','appointment_rescheduled',
  'follow_up_recommended','follow_up_appointment_requested',
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

create function public.create_follow_up_recommendation(
  p_appointment_id uuid,p_timing public.follow_up_timing
) returns uuid language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); actor_doctor_id uuid;
  selected_appointment public.appointments%rowtype; recommendation_id uuid;
begin
  select doctors.id into actor_doctor_id from public.doctors
  join public.profiles on profiles.id=doctors.profile_id
  where profiles.auth_user_id=user_id and profiles.role='doctor' and doctors.status='verified';
  select * into selected_appointment from public.appointments where id=p_appointment_id;
  if actor_doctor_id is null or selected_appointment.id is null
    or selected_appointment.doctor_id<>actor_doctor_id or selected_appointment.status<>'COMPLETED'
    or not exists(select 1 from public.consultations where appointment_id=p_appointment_id
      and doctor_id=actor_doctor_id and status='FINALIZED')
    or not exists(select 1 from public.consultation_outcomes where appointment_id=p_appointment_id
      and doctor_id=actor_doctor_id and outcome='FOLLOW_UP_REQUIRED')
  then raise insufficient_privilege using message='Follow-up recommendation is unavailable'; end if;
  insert into public.follow_up_recommendations(
    source_appointment_id,patient_id,doctor_id,timing,created_by_doctor_id
  ) values(p_appointment_id,selected_appointment.patient_id,actor_doctor_id,p_timing,actor_doctor_id)
  returning id into recommendation_id;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'follow_up_recommended','appointment',p_appointment_id,'success');
  return recommendation_id;
end; $$;

create function public.get_follow_up_recommendation(p_appointment_id uuid)
returns table(id uuid,source_appointment_id uuid,doctor_name text,timing public.follow_up_timing,
  created_at timestamptz,booked_appointment_id uuid)
language plpgsql stable security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid());
begin
  if not exists(select 1 from public.follow_up_recommendations recommendations
    join public.patients on patients.id=recommendations.patient_id
    join public.profiles patient_profile on patient_profile.id=patients.profile_id
    join public.doctors on doctors.id=recommendations.doctor_id
    join public.profiles doctor_profile on doctor_profile.id=doctors.profile_id
    where recommendations.source_appointment_id=p_appointment_id and (
      (patient_profile.auth_user_id=user_id and patient_profile.role='patient')
      or (doctor_profile.auth_user_id=user_id and doctor_profile.role='doctor' and doctors.status='verified')
    )) then return; end if;
  return query select recommendations.id,recommendations.source_appointment_id,doctors.full_name,
    recommendations.timing,recommendations.created_at,appointments.id
  from public.follow_up_recommendations recommendations
  join public.doctors on doctors.id=recommendations.doctor_id
  left join public.appointments on appointments.follow_up_recommendation_id=recommendations.id
  where recommendations.source_appointment_id=p_appointment_id;
end; $$;

create function public.list_follow_up_booking_options(p_recommendation_id uuid)
returns table(availability_id uuid,starts_at timestamptz,ends_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); recommendation public.follow_up_recommendations%rowtype;
begin
  select recommendations.* into recommendation from public.follow_up_recommendations recommendations
  join public.patients on patients.id=recommendations.patient_id
  join public.profiles on profiles.id=patients.profile_id
  where recommendations.id=p_recommendation_id and profiles.auth_user_id=user_id
    and profiles.role='patient';
  if recommendation.id is null or exists(select 1 from public.appointments
    where follow_up_recommendation_id=recommendation.id)
  then raise insufficient_privilege using message='Follow-up booking is unavailable'; end if;
  return query select availability.id,availability.starts_at,availability.ends_at
  from public.doctor_availability availability
  where availability.doctor_id=recommendation.doctor_id and availability.starts_at>now()
    and exists(select 1 from public.doctors where id=recommendation.doctor_id
      and status='verified' and is_bookable)
    and not exists(select 1 from public.appointments where doctor_availability_id=availability.id
      and status in ('REQUESTED','CONFIRMED','IN_PROGRESS'))
  order by availability.starts_at limit 25;
end; $$;

create function public.book_follow_up_appointment(p_recommendation_id uuid,p_availability_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); recommendation public.follow_up_recommendations%rowtype;
  availability public.doctor_availability%rowtype; appointment_id uuid; authoritative_fee integer;
  doctor_is_bookable boolean:=false;
begin
  select recommendations.* into recommendation from public.follow_up_recommendations recommendations
  join public.patients on patients.id=recommendations.patient_id
  join public.profiles on profiles.id=patients.profile_id
  where recommendations.id=p_recommendation_id and profiles.auth_user_id=user_id
    and profiles.role='patient' for update of recommendations;
  select * into availability from public.doctor_availability where id=p_availability_id for update;
  select teleconsultation_fee_paise,true into authoritative_fee,doctor_is_bookable from public.doctors
  where id=recommendation.doctor_id and status='verified' and is_bookable;
  if recommendation.id is null or availability.id is null or not doctor_is_bookable
    or availability.doctor_id<>recommendation.doctor_id or availability.starts_at<=now()
    or exists(select 1 from public.appointments where follow_up_recommendation_id=recommendation.id)
    or exists(select 1 from public.appointments where doctor_availability_id=availability.id
      and status in ('REQUESTED','CONFIRMED','IN_PROGRESS'))
  then raise insufficient_privilege using message='Follow-up booking is unavailable'; end if;
  insert into public.appointments(doctor_availability_id,doctor_id,patient_id,starts_at,ends_at,
    fee_paise,status,follow_up_recommendation_id,intake_session_id)
  values(availability.id,recommendation.doctor_id,recommendation.patient_id,availability.starts_at,
    availability.ends_at,authoritative_fee,'REQUESTED',recommendation.id,null)
  returning id into appointment_id;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'follow_up_appointment_requested','appointment',appointment_id,'success');
  return appointment_id;
end; $$;

create or replace function public.attach_latest_intake_to_appointment()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.intake_session_id is null and new.follow_up_recommendation_id is null then
    select intake_sessions.id into new.intake_session_id from public.intake_sessions
    where intake_sessions.patient_id=new.patient_id and intake_sessions.status<>'ABANDONED'
    order by intake_sessions.created_at desc,intake_sessions.id desc limit 1;
  end if;
  return new;
end; $$;

revoke execute on function public.create_follow_up_recommendation(uuid,public.follow_up_timing),
  public.get_follow_up_recommendation(uuid),public.list_follow_up_booking_options(uuid),
  public.book_follow_up_appointment(uuid,uuid) from public,anon;
grant execute on function public.create_follow_up_recommendation(uuid,public.follow_up_timing),
  public.get_follow_up_recommendation(uuid),public.list_follow_up_booking_options(uuid),
  public.book_follow_up_appointment(uuid,uuid) to authenticated;

comment on column public.appointments.follow_up_recommendation_id is
  'Opaque logistical link only; follow-up booking intentionally does not inherit intake or prescription data.';
