alter table public.audit_events drop constraint audit_events_action_allowed;
alter table public.audit_events drop constraint audit_events_target_type_allowed;
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
  'patient_consultation_packet_downloaded','consent_granted','consent_revoked',
  'login_role_resolution_failed','admin_doctor_verification_queue_viewed'
));
alter table public.audit_events add constraint audit_events_target_type_allowed check(target_type in (
  'doctor','doctor_availability','appointment','intake_session','triage_result',
  'specialty_routing_result','patient','document','safe_care_guidance','consent_record',
  'auth_user','admin_area'
));

create function public.append_audit_event(
  p_actor_user_id uuid,p_action text,p_target_type text,p_target_id uuid,p_outcome text default 'success'
) returns uuid language plpgsql security definer set search_path='' as $$
declare event_id uuid;
begin
  if p_actor_user_id is null or p_target_id is null or p_outcome<>'success' then
    raise check_violation using message='Audit event is invalid';
  end if;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(p_actor_user_id,p_action,p_target_type,p_target_id,p_outcome)
  returning id into event_id;
  return event_id;
end; $$;

create function public.record_authenticated_audit_event(
  p_action text,p_target_type text,p_target_id uuid,p_outcome text
) returns uuid language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); actor_role public.profile_role;
begin
  select role into actor_role from public.profiles where auth_user_id=user_id;
  if user_id is null or p_target_id<>user_id or p_outcome<>'success'
    or not (
      (p_action='login_role_resolution_failed' and p_target_type='auth_user')
      or (p_action='admin_doctor_verification_queue_viewed' and p_target_type='admin_area'
        and actor_role='operations')
    )
  then raise insufficient_privilege using message='Audit event is unavailable'; end if;
  return public.append_audit_event(user_id,p_action,p_target_type,p_target_id,p_outcome);
end; $$;

create function public.audit_consent_record_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); expected_patient_id uuid; audit_action text;
begin
  if user_id is null then return new; end if;
  select patients.id into expected_patient_id from public.patients
  join public.profiles on profiles.id=patients.profile_id
  where profiles.auth_user_id=user_id and profiles.role='patient';
  if expected_patient_id is null or expected_patient_id<>new.patient_id then
    raise insufficient_privilege using message='Consent audit is unavailable'; end if;
  audit_action:=case new.status when 'granted' then 'consent_granted' else 'consent_revoked' end;
  perform public.append_audit_event(user_id,audit_action,'consent_record',new.id,'success');
  return new;
end; $$;

create trigger consent_records_append_audit
after insert on public.consent_records for each row execute function public.audit_consent_record_insert();

create function public.prevent_audit_event_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise check_violation using message='Audit events are immutable';
end; $$;
create trigger audit_events_immutable before update or delete on public.audit_events
for each row execute function public.prevent_audit_event_mutation();

revoke execute on function public.append_audit_event(uuid,text,text,uuid,text),
  public.audit_consent_record_insert(),public.prevent_audit_event_mutation()
from public,anon,authenticated,service_role;
revoke execute on function public.record_authenticated_audit_event(text,text,uuid,text) from public,anon;
grant execute on function public.record_authenticated_audit_event(text,text,uuid,text) to authenticated;

comment on function public.append_audit_event(uuid,text,text,uuid,text) is
  'Central content-free audit sink. Accepts only actor, allow-listed action, target type, opaque UUID, outcome, and timestamp.';
comment on table public.audit_events is
  'Immutable content-free security events. No payload, clinical content, credentials, tokens, URLs, or free-text reasons.';
