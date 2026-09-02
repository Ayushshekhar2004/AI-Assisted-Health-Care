alter type public.consent_type add value if not exists 'ai_intake_processing';
alter type public.consent_type add value if not exists 'document_processing';

revoke insert on table public.consent_records from authenticated;
drop policy if exists "Patients can add their own consent records" on public.consent_records;

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
  'patient_consultation_packet_downloaded','consent_granted','consent_revoked',
  'login_role_resolution_failed','admin_doctor_verification_queue_viewed',
  'patient_consent_center_viewed','admin_audit_lookup'
));

create function public.list_own_managed_consents()
returns table(id uuid,consent_type public.consent_type,status public.consent_status,
  policy_version text,effective_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); actor_patient_id uuid;
begin
  select patients.id into actor_patient_id from public.patients
  join public.profiles on profiles.id=patients.profile_id
  where profiles.auth_user_id=user_id and profiles.role='patient';
  if actor_patient_id is null then
    raise insufficient_privilege using message='Consent preferences are unavailable'; end if;
  perform public.append_audit_event(user_id,'patient_consent_center_viewed','patient',actor_patient_id,'success');
  return query select records.id,records.consent_type,records.status,records.policy_version,records.effective_at
  from public.consent_records records where records.patient_id=actor_patient_id
    and records.consent_type in ('ai_intake_processing','teleconsultation','document_processing')
  order by records.effective_at desc,records.id desc;
end; $$;

create function public.record_patient_consent_decision(
  p_consent_type public.consent_type,p_status public.consent_status,p_policy_version text
) returns uuid language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); actor_patient_id uuid;
  expected_version text; latest_status public.consent_status; consent_id uuid;
begin
  select patients.id into actor_patient_id from public.patients
  join public.profiles on profiles.id=patients.profile_id
  where profiles.auth_user_id=user_id and profiles.role='patient'
  for update of patients;
  expected_version:=case p_consent_type
    when 'ai_intake_processing' then 'ai-intake-processing-v1'
    when 'teleconsultation' then 'teleconsultation-v1'
    when 'document_processing' then 'document-processing-v1'
    else null end;
  if actor_patient_id is null or expected_version is null or p_policy_version<>expected_version
  then raise insufficient_privilege using message='Consent preferences are unavailable'; end if;
  select records.status into latest_status from public.consent_records records
  where records.patient_id=actor_patient_id and records.consent_type=p_consent_type
  order by records.effective_at desc,records.id desc limit 1;
  if latest_status=p_status or (p_status='withdrawn' and latest_status is distinct from 'granted')
  then raise check_violation using message='Consent decision is unavailable'; end if;
  if p_status='withdrawn' and (
    (p_consent_type='teleconsultation' and exists(select 1 from public.appointments
      where patient_id=actor_patient_id and status in ('REQUESTED','CONFIRMED','IN_PROGRESS')))
    or (p_consent_type='ai_intake_processing' and exists(select 1 from public.intake_sessions
      where patient_id=actor_patient_id and status='ACTIVE'))
    or (p_consent_type='document_processing' and exists(select 1 from public.documents
      where patient_id=actor_patient_id and scan_status='PENDING_SCAN'))
  ) then raise check_violation using message='Consent is required by an active workflow'; end if;
  insert into public.consent_records(patient_id,consent_type,status,policy_version,effective_at)
  values(actor_patient_id,p_consent_type,p_status,expected_version,clock_timestamp()) returning id into consent_id;
  return consent_id;
end; $$;

create function public.list_audit_events_for_operations(
  p_category text,p_actor_id uuid,p_target_id uuid,p_from timestamptz,p_to timestamptz,
  p_limit integer,p_offset integer
) returns table(id uuid,actor_user_id uuid,action text,target_type text,target_id uuid,
  outcome text,created_at timestamptz,total_count bigint)
language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); range_start timestamptz:=coalesce(p_from,now()-interval '30 days');
  range_end timestamptz:=coalesce(p_to,now());
begin
  if not exists(select 1 from public.profiles where auth_user_id=user_id and role='operations')
    or p_category not in ('ALL','AUTH','CONSENT','ADMIN','RECORD_ACCESS','DOCUMENT_ACCESS','CLINICAL_FINALIZATION','APPOINTMENT')
    or p_limit not between 1 and 50 or p_offset not between 0 and 250000
    or range_end<range_start or range_end-range_start>interval '31 days'
  then raise insufficient_privilege using message='Audit lookup is unavailable'; end if;
  perform public.append_audit_event(user_id,'admin_audit_lookup','admin_area',user_id,'success');
  return query select events.id,events.actor_user_id,events.action,events.target_type,events.target_id,
    events.outcome,events.created_at,count(*) over()
  from public.audit_events events where events.created_at between range_start and range_end
    and (p_actor_id is null or events.actor_user_id=p_actor_id)
    and (p_target_id is null or events.target_id=p_target_id)
    and (p_category='ALL'
      or (p_category='AUTH' and events.action like 'login_%')
      or (p_category='CONSENT' and events.action in ('consent_granted','consent_revoked','patient_consent_center_viewed'))
      or (p_category='ADMIN' and events.action in ('doctor_verification_approved','doctor_verification_rejected','admin_doctor_verification_queue_viewed','admin_audit_lookup'))
      or (p_category='RECORD_ACCESS' and events.action in ('doctor_appointment_detail_viewed','doctor_appointment_transcript_viewed','consultation_viewed','prescription_viewed','patient_history_viewed'))
      or (p_category='DOCUMENT_ACCESS' and events.action in ('patient_document_downloaded','doctor_document_downloaded','consultation_document_generated','patient_consultation_packet_downloaded'))
      or (p_category='CLINICAL_FINALIZATION' and events.action in ('consultation_finalized','prescription_finalized','consultation_outcome_recorded'))
      or (p_category='APPOINTMENT' and events.action in ('appointment_requested','appointment_status_transitioned','appointment_cancelled','appointment_rescheduled','follow_up_appointment_requested')))
  order by events.created_at desc,events.id desc limit p_limit offset p_offset;
end; $$;

create function public.block_new_processing_after_consent_withdrawal()
returns trigger language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); purpose public.consent_type; patient_record_id uuid;
  latest_status public.consent_status;
begin
  if user_id is null then return new; end if;
  if tg_table_name='intake_sessions' then
    purpose:='ai_intake_processing'; patient_record_id:=new.patient_id;
  elsif tg_table_name='appointments' then
    purpose:='teleconsultation'; patient_record_id:=new.patient_id;
  elsif tg_table_name='documents' then
    purpose:='document_processing'; patient_record_id:=new.patient_id;
  else raise check_violation using message='Unsupported consent boundary'; end if;
  select records.status into latest_status from public.consent_records records
  where records.patient_id=patient_record_id and records.consent_type=purpose
  order by records.effective_at desc,records.id desc limit 1;
  if latest_status='withdrawn' then
    raise insufficient_privilege using message='Required purpose consent is withdrawn'; end if;
  return new;
end; $$;

create trigger intake_sessions_require_current_consent before insert on public.intake_sessions
for each row execute function public.block_new_processing_after_consent_withdrawal();
create trigger appointments_require_current_consent before insert on public.appointments
for each row execute function public.block_new_processing_after_consent_withdrawal();
create trigger documents_require_current_consent before insert on public.documents
for each row execute function public.block_new_processing_after_consent_withdrawal();

revoke execute on function public.list_own_managed_consents(),
  public.record_patient_consent_decision(public.consent_type,public.consent_status,text),
  public.list_audit_events_for_operations(text,uuid,uuid,timestamptz,timestamptz,integer,integer)
from public,anon;
revoke execute on function public.block_new_processing_after_consent_withdrawal()
from public,anon,authenticated,service_role;
grant execute on function public.list_own_managed_consents(),
  public.record_patient_consent_decision(public.consent_type,public.consent_status,text),
  public.list_audit_events_for_operations(text,uuid,uuid,timestamptz,timestamptz,integer,integer)
to authenticated;

comment on function public.record_patient_consent_decision(public.consent_type,public.consent_status,text) is
  'Appends one current-version purpose-specific decision; revocation is denied while an active workflow depends on it.';
comment on function public.list_audit_events_for_operations(text,uuid,uuid,timestamptz,timestamptz,integer,integer) is
  'Operations-only, read-only, paginated lookup of content-free audit fields over a maximum 31-day range.';
