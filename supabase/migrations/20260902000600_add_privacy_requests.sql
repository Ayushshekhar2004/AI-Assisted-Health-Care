create type public.privacy_request_type as enum (
  'DATA_EXPORT','RECORD_CORRECTION','ACCOUNT_DEACTIVATION_OR_DELETION','GRIEVANCE'
);
create type public.privacy_request_status as enum ('QUEUED','UNDER_REVIEW','RESOLVED','DECLINED');
create type public.privacy_resolution_category as enum (
  'EXPORT_PROVIDED','CORRECTION_WORKFLOW_STARTED','ACCOUNT_DEACTIVATION_REVIEWED',
  'GRIEVANCE_RESPONDED','REQUEST_NOT_ACTIONABLE'
);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  request_type public.privacy_request_type not null,
  request_details text not null,
  status public.privacy_request_status not null default 'QUEUED',
  resolution_category public.privacy_resolution_category,
  protected_records_retained boolean not null default true,
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint privacy_request_details_bounded check (
    char_length(btrim(request_details)) between 1 and 2000
  ),
  constraint privacy_request_no_automatic_medical_deletion check (protected_records_retained),
  constraint privacy_request_review_consistent check (
    (status='QUEUED' and resolution_category is null and reviewed_by_user_id is null and reviewed_at is null)
    or (status='UNDER_REVIEW' and resolution_category is null and reviewed_by_user_id is not null and reviewed_at is not null)
    or (status in ('RESOLVED','DECLINED') and resolution_category is not null
      and reviewed_by_user_id is not null and reviewed_at is not null)
  )
);
create index privacy_requests_patient_created_idx on public.privacy_requests(patient_id,created_at desc);
create index privacy_requests_queue_idx on public.privacy_requests(status,created_at,id);
create trigger privacy_requests_set_updated_at before update on public.privacy_requests
for each row execute function public.set_updated_at();

alter table public.privacy_requests enable row level security;
revoke all on table public.privacy_requests from public,anon,authenticated;
grant select,insert,update on table public.privacy_requests to service_role;

alter table public.audit_events drop constraint audit_events_action_allowed;
alter table public.audit_events drop constraint audit_events_target_type_allowed;
alter table public.audit_events add constraint audit_events_action_allowed check(action in (
  'doctor_verification_approved','doctor_verification_rejected','doctor_availability_created','doctor_availability_deleted',
  'appointment_requested','appointment_status_transitioned','appointment_cancelled','appointment_rescheduled',
  'follow_up_recommended','follow_up_appointment_requested','intake_session_started','intake_message_added',
  'intake_patient_message_added','intake_assistant_turn_recorded','triage_no_red_flag_recorded',
  'triage_red_flag_detected','triage_emergency_pathway_entered','specialty_routing_recorded',
  'doctor_match_searched','intake_voice_session_issued','doctor_dashboard_viewed',
  'doctor_appointment_detail_viewed','doctor_appointment_transcript_viewed','doctor_handoff_source_accessed',
  'doctor_handoff_generated','doctor_handoff_viewed','doctor_handoff_marked_inaccurate',
  'appointment_video_token_issued','consultation_draft_saved','consultation_finalized','consultation_viewed',
  'consultation_ai_source_accessed','consultation_ai_draft_generated','prescription_draft_saved',
  'prescription_finalized','prescription_viewed','consultation_outcome_recorded','consultation_outcome_viewed',
  'consultation_document_generated','patient_document_uploaded','patient_documents_listed',
  'patient_document_downloaded','doctor_documents_listed','doctor_document_downloaded',
  'safe_care_guidance_recorded','patient_history_viewed','patient_consultation_packet_downloaded',
  'consent_granted','consent_revoked','login_role_resolution_failed','admin_doctor_verification_queue_viewed',
  'patient_consent_center_viewed','admin_audit_lookup','data_retention_executed',
  'privacy_request_submitted','admin_privacy_request_queue_viewed','privacy_request_status_changed'
));
alter table public.audit_events add constraint audit_events_target_type_allowed check(target_type in (
  'doctor','doctor_availability','appointment','intake_session','triage_result','specialty_routing_result',
  'patient','document','safe_care_guidance','consent_record','auth_user','admin_area','retention_job','privacy_request'
));

create function public.submit_privacy_request(
  p_request_type public.privacy_request_type,p_request_details text
) returns uuid language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); actor_patient_id uuid; request_id uuid;
begin
  select patients.id into actor_patient_id from public.patients join public.profiles
    on profiles.id=patients.profile_id
  where profiles.auth_user_id=user_id and profiles.role='patient';
  if actor_patient_id is null or p_request_type is null or p_request_details is null
    or char_length(btrim(p_request_details)) not between 1 and 2000
  then raise insufficient_privilege using message='Privacy request is unavailable'; end if;
  insert into public.privacy_requests(patient_id,request_type,request_details)
  values(actor_patient_id,p_request_type,btrim(p_request_details)) returning id into request_id;
  perform public.append_audit_event(user_id,'privacy_request_submitted','privacy_request',request_id,'success');
  return request_id;
end; $$;

create function public.list_own_privacy_requests()
returns table(id uuid,request_type public.privacy_request_type,status public.privacy_request_status,
  resolution_category public.privacy_resolution_category,protected_records_retained boolean,
  created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); actor_patient_id uuid;
begin
  select patients.id into actor_patient_id from public.patients join public.profiles
    on profiles.id=patients.profile_id
  where profiles.auth_user_id=user_id and profiles.role='patient';
  if actor_patient_id is null then raise insufficient_privilege using message='Privacy requests are unavailable'; end if;
  return query select requests.id,requests.request_type,requests.status,requests.resolution_category,
    requests.protected_records_retained,requests.created_at,requests.updated_at
  from public.privacy_requests requests where requests.patient_id=actor_patient_id
  order by requests.created_at desc,requests.id desc;
end; $$;

create function public.list_privacy_requests_for_operations(p_limit integer,p_offset integer)
returns table(id uuid,request_type public.privacy_request_type,request_details text,
  status public.privacy_request_status,resolution_category public.privacy_resolution_category,
  protected_records_retained boolean,created_at timestamptz,updated_at timestamptz,total_count bigint)
language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid());
begin
  if not exists(select 1 from public.profiles where auth_user_id=user_id and role='operations')
    or p_limit not between 1 and 50 or p_offset not between 0 and 250000
  then raise insufficient_privilege using message='Privacy request queue is unavailable'; end if;
  perform public.append_audit_event(user_id,'admin_privacy_request_queue_viewed','admin_area',user_id,'success');
  return query select requests.id,requests.request_type,requests.request_details,requests.status,
    requests.resolution_category,requests.protected_records_retained,requests.created_at,
    requests.updated_at,count(*) over()
  from public.privacy_requests requests
  order by case requests.status when 'QUEUED' then 0 when 'UNDER_REVIEW' then 1 else 2 end,
    requests.created_at,requests.id limit p_limit offset p_offset;
end; $$;

create function public.transition_privacy_request(
  p_request_id uuid,p_next_status public.privacy_request_status,
  p_resolution_category public.privacy_resolution_category
) returns void language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); current_status public.privacy_request_status;
  request_kind public.privacy_request_type;
begin
  if not exists(select 1 from public.profiles where auth_user_id=user_id and role='operations')
  then raise insufficient_privilege using message='Privacy request transition is unavailable'; end if;
  select status,request_type into current_status,request_kind from public.privacy_requests
    where id=p_request_id for update;
  if current_status is null
    or not ((current_status='QUEUED' and p_next_status='UNDER_REVIEW')
      or (current_status='UNDER_REVIEW' and p_next_status in ('RESOLVED','DECLINED')))
    or (p_next_status='UNDER_REVIEW' and p_resolution_category is not null)
    or (p_next_status in ('RESOLVED','DECLINED') and p_resolution_category is null)
    or (p_next_status='RESOLVED' and not (
      (request_kind='DATA_EXPORT' and p_resolution_category='EXPORT_PROVIDED')
      or (request_kind='RECORD_CORRECTION' and p_resolution_category='CORRECTION_WORKFLOW_STARTED')
      or (request_kind='ACCOUNT_DEACTIVATION_OR_DELETION' and p_resolution_category='ACCOUNT_DEACTIVATION_REVIEWED')
      or (request_kind='GRIEVANCE' and p_resolution_category='GRIEVANCE_RESPONDED')
    ))
    or (p_next_status='DECLINED' and p_resolution_category<>'REQUEST_NOT_ACTIONABLE')
  then raise check_violation using message='Privacy request transition is unavailable'; end if;
  update public.privacy_requests set status=p_next_status,resolution_category=p_resolution_category,
    reviewed_by_user_id=user_id,reviewed_at=clock_timestamp(),protected_records_retained=true
  where id=p_request_id;
  perform public.append_audit_event(user_id,'privacy_request_status_changed','privacy_request',p_request_id,'success');
end; $$;

revoke execute on function public.submit_privacy_request(public.privacy_request_type,text),
  public.list_own_privacy_requests(),public.list_privacy_requests_for_operations(integer,integer),
  public.transition_privacy_request(uuid,public.privacy_request_status,public.privacy_resolution_category)
from public,anon;
grant execute on function public.submit_privacy_request(public.privacy_request_type,text),
  public.list_own_privacy_requests(),public.list_privacy_requests_for_operations(integer,integer),
  public.transition_privacy_request(uuid,public.privacy_request_status,public.privacy_resolution_category)
to authenticated;

comment on table public.privacy_requests is
  'Reviewed privacy workflow. Request details are sensitive and excluded from audit events. Finalized medical records are never deleted by this workflow.';
