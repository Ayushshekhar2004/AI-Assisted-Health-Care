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
  'consent_granted','consent_revoked','login_role_resolution_failed',
  'admin_doctor_verification_queue_viewed','patient_consent_center_viewed','admin_audit_lookup',
  'data_retention_executed'
));
alter table public.audit_events add constraint audit_events_target_type_allowed check(target_type in (
  'doctor','doctor_availability','appointment','intake_session','triage_result','specialty_routing_result',
  'patient','document','safe_care_guidance','consent_record','auth_user','admin_area','retention_job'
));

create function public.run_data_retention(
  p_policy_version text,
  p_apply boolean,
  p_now timestamptz,
  p_batch_size integer
)
returns table(anonymized_operational_rows integer, deleted_operational_rows integer)
language plpgsql security definer set search_path='' as $$
declare
  anonymize_count integer;
  delete_count integer;
  run_id uuid := gen_random_uuid();
begin
  if p_policy_version <> 'retention-dev-v1' or p_apply is null or p_now is null
    or p_batch_size is null or p_batch_size not between 1 and 500
  then raise invalid_parameter_value using message='Data retention job is unavailable'; end if;

  select count(*)::integer into anonymize_count from (
    select notification_events.id from public.notification_events
    where notification_events.updated_at < p_now - interval '30 days'
      and notification_events.delivery_status in ('DELIVERED','FAILED')
      and (
        (notification_events.delivery_status='DELIVERED' and notification_events.provider_message_id<>'REDACTED')
        or (notification_events.delivery_status='FAILED' and notification_events.error_code<>'RETAINED')
      )
    order by notification_events.updated_at,notification_events.id limit p_batch_size
  ) candidates;

  select count(*)::integer into delete_count from (
    select notification_events.id from public.notification_events
    join public.appointments on appointments.id=notification_events.appointment_id
    where notification_events.created_at < p_now - interval '365 days'
      and notification_events.delivery_status in ('DELIVERED','FAILED','SKIPPED')
      and appointments.status in ('CANCELLED','COMPLETED','NO_SHOW','REQUIRES_IN_PERSON')
    order by notification_events.created_at,notification_events.id limit p_batch_size
  ) candidates;

  if p_apply then
    with candidates as (
      select notification_events.id from public.notification_events
      where notification_events.updated_at < p_now - interval '30 days'
        and notification_events.delivery_status in ('DELIVERED','FAILED')
        and (
          (notification_events.delivery_status='DELIVERED' and notification_events.provider_message_id<>'REDACTED')
          or (notification_events.delivery_status='FAILED' and notification_events.error_code<>'RETAINED')
        )
      order by notification_events.updated_at,notification_events.id limit p_batch_size
    )
    update public.notification_events set
      provider_message_id=case when delivery_status='DELIVERED' then 'REDACTED' else null end,
      error_code=case when delivery_status='FAILED' then 'RETAINED' else null end
    where id in (select id from candidates);

    with candidates as (
      select notification_events.id from public.notification_events
      join public.appointments on appointments.id=notification_events.appointment_id
      where notification_events.created_at < p_now - interval '365 days'
        and notification_events.delivery_status in ('DELIVERED','FAILED','SKIPPED')
        and appointments.status in ('CANCELLED','COMPLETED','NO_SHOW','REQUIRES_IN_PERSON')
      order by notification_events.created_at,notification_events.id limit p_batch_size
    )
    delete from public.notification_events where id in (select id from candidates);

    insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
    values('00000000-0000-0000-0000-000000000000','data_retention_executed','retention_job',run_id,'success');
  end if;
  return query select anonymize_count,delete_count;
end; $$;

create function public.list_expired_unregistered_document_objects(
  p_policy_version text,
  p_now timestamptz,
  p_batch_size integer
)
returns table(object_path text)
language plpgsql security definer set search_path='' as $$
begin
  if p_policy_version<>'retention-dev-v1' or p_now is null
    or p_batch_size is null or p_batch_size not between 1 and 500
  then raise invalid_parameter_value using message='Temporary file retention is unavailable'; end if;
  return query
  select objects.name from storage.objects objects
  where objects.bucket_id='patient-documents'
    and objects.created_at < p_now - interval '1 day'
    and objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'
    and not exists(select 1 from public.documents where documents.object_path=objects.name)
  order by objects.created_at,objects.id limit p_batch_size;
end; $$;

revoke execute on function public.run_data_retention(text,boolean,timestamptz,integer),
  public.list_expired_unregistered_document_objects(text,timestamptz,integer)
from public,anon,authenticated;
grant execute on function public.run_data_retention(text,boolean,timestamptz,integer),
  public.list_expired_unregistered_document_objects(text,timestamptz,integer)
to service_role;

comment on function public.run_data_retention(text,boolean,timestamptz,integer) is
  'Version-gated server job. Mutates only disposable notification logistics; never clinical records, transcripts, documents, prescriptions, or audit history.';
