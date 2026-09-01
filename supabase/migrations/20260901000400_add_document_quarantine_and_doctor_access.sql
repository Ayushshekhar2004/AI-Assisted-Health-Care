create type public.document_scan_status as enum ('PENDING_SCAN','CLEAN','QUARANTINED','REJECTED','SCAN_FAILED');

alter table public.documents
  add column scan_status public.document_scan_status not null default 'PENDING_SCAN',
  add column scan_provider text,
  add column scanned_at timestamptz,
  add column scan_failure_code text,
  add constraint documents_scan_metadata_consistent check (
    (scan_status='PENDING_SCAN' and scan_provider is null and scanned_at is null and scan_failure_code is null)
    or (scan_status='CLEAN' and scan_provider is not null and scanned_at is not null and scan_failure_code is null)
    or (scan_status in ('QUARANTINED','REJECTED','SCAN_FAILED') and scan_provider is not null and scanned_at is not null)
  ),
  add constraint documents_scan_provider_safe check (scan_provider is null or scan_provider ~ '^[A-Za-z0-9._-]{1,80}$'),
  add constraint documents_scan_failure_code_safe check (scan_failure_code is null or scan_failure_code ~ '^[A-Z0-9_]{1,80}$');

create policy documents_assigned_verified_doctor_read on public.documents for select to authenticated using (
  exists(select 1 from public.appointments join public.doctors on doctors.id=appointments.doctor_id
    join public.profiles on profiles.id=doctors.profile_id where appointments.id=documents.appointment_id
    and appointments.patient_id=documents.patient_id and profiles.auth_user_id=(select auth.uid())
    and profiles.role='doctor' and doctors.status='verified')
);

drop policy "Patients read their private appointment documents" on storage.objects;
create policy "Patients read non-quarantined private appointment documents"
on storage.objects for select to authenticated using (
  bucket_id='patient-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(select 1 from public.documents join public.patients on patients.id=documents.patient_id
    join public.profiles on profiles.id=patients.profile_id where documents.object_path=storage.objects.name
      and documents.scan_status not in ('QUARANTINED','REJECTED')
      and profiles.auth_user_id=(select auth.uid()) and profiles.role='patient')
);

create policy "Assigned doctors read clean appointment documents" on storage.objects for select to authenticated using (
  bucket_id='patient-documents' and exists(select 1 from public.documents
    join public.appointments on appointments.id=documents.appointment_id
    join public.doctors on doctors.id=appointments.doctor_id join public.profiles on profiles.id=doctors.profile_id
    where documents.object_path=storage.objects.name and documents.scan_status='CLEAN'
      and profiles.auth_user_id=(select auth.uid()) and profiles.role='doctor' and doctors.status='verified')
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
  'consultation_document_generated','patient_document_uploaded','patient_documents_listed','patient_document_downloaded',
  'doctor_documents_listed','doctor_document_downloaded'
));

create function public.list_assigned_appointment_documents(p_appointment_id uuid)
returns setof public.documents language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); actor_doctor_id uuid;
begin
  select doctors.id into actor_doctor_id from public.doctors join public.profiles on profiles.id=doctors.profile_id
  where profiles.auth_user_id=user_id and profiles.role='doctor' and doctors.status='verified';
  if actor_doctor_id is null or not exists(select 1 from public.appointments where id=p_appointment_id and doctor_id=actor_doctor_id)
  then raise insufficient_privilege using message='Documents are unavailable'; end if;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'doctor_documents_listed','appointment',p_appointment_id,'success');
  return query select * from public.documents where appointment_id=p_appointment_id order by created_at desc;
end; $$;

create function public.authorize_doctor_document_download(p_document_id uuid)
returns setof public.documents language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); actor_doctor_id uuid;
begin
  select doctors.id into actor_doctor_id from public.doctors join public.profiles on profiles.id=doctors.profile_id
  where profiles.auth_user_id=user_id and profiles.role='doctor' and doctors.status='verified';
  if actor_doctor_id is null or not exists(select 1 from public.documents
    join public.appointments on appointments.id=documents.appointment_id where documents.id=p_document_id
    and appointments.doctor_id=actor_doctor_id and documents.patient_id=appointments.patient_id and documents.scan_status='CLEAN')
  then raise insufficient_privilege using message='Document is unavailable'; end if;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'doctor_document_downloaded','document',p_document_id,'success');
  return query select * from public.documents where id=p_document_id and scan_status='CLEAN';
end; $$;

create or replace function public.authorize_patient_document_download(p_document_id uuid)
returns setof public.documents language plpgsql security definer set search_path='' as $$
declare user_id uuid:=(select auth.uid()); actor_patient_id uuid;
begin
  select patients.id into actor_patient_id from public.patients join public.profiles on profiles.id=patients.profile_id
  where profiles.auth_user_id=user_id and profiles.role='patient';
  if actor_patient_id is null or not exists(select 1 from public.documents where id=p_document_id
    and patient_id=actor_patient_id and scan_status not in ('QUARANTINED','REJECTED'))
  then raise insufficient_privilege using message='Document is unavailable'; end if;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'patient_document_downloaded','document',p_document_id,'success');
  return query select * from public.documents where id=p_document_id and patient_id=actor_patient_id
    and scan_status not in ('QUARANTINED','REJECTED');
end; $$;

revoke execute on function public.list_assigned_appointment_documents(uuid),public.authorize_doctor_document_download(uuid) from public,anon;
grant execute on function public.list_assigned_appointment_documents(uuid),public.authorize_doctor_document_download(uuid) to authenticated;
comment on column public.documents.scan_status is 'Defaults to PENDING_SCAN; doctor download remains denied until a scanner records CLEAN.';
