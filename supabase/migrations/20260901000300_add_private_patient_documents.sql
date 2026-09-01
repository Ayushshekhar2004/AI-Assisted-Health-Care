create table public.documents (
  id uuid primary key,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  bucket_id text not null default 'patient-documents',
  object_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_extension text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_private_bucket check (bucket_id = 'patient-documents'),
  constraint documents_filename_safe check (
    char_length(original_filename) between 1 and 255
    and original_filename !~ '[/\\[:cntrl:]]'
    and lower(original_filename) like '%.' || file_extension
  ),
  constraint documents_size check (size_bytes between 1 and 10485760),
  constraint documents_type_extension_match check (
    (mime_type = 'application/pdf' and file_extension = 'pdf')
    or (mime_type = 'image/jpeg' and file_extension in ('jpg', 'jpeg'))
    or (mime_type = 'image/png' and file_extension = 'png')
    or (mime_type = 'image/webp' and file_extension = 'webp')
  ),
  constraint documents_object_path_private check (
    object_path !~ '^/' and object_path !~ '://' and char_length(object_path) <= 255
  )
);

create index documents_patient_appointment_idx
on public.documents (patient_id, appointment_id, created_at desc);

create trigger documents_set_updated_at before update on public.documents
for each row execute function public.set_updated_at();

alter table public.documents enable row level security;
revoke all on public.documents from anon, authenticated;
grant select on public.documents to authenticated;

create policy documents_patient_read on public.documents for select to authenticated using (
  exists (
    select 1 from public.patients
    join public.profiles on profiles.id = patients.profile_id
    where patients.id = documents.patient_id
      and profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'patient'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-documents', 'patient-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Patients upload private appointment documents"
on storage.objects for insert to authenticated with check (
  bucket_id = 'patient-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png|webp)$')
  and exists (
    select 1 from public.patients
    join public.profiles on profiles.id = patients.profile_id
    where profiles.auth_user_id = (select auth.uid()) and profiles.role = 'patient'
  )
);

create policy "Patients read their private appointment documents"
on storage.objects for select to authenticated using (
  bucket_id = 'patient-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.documents
    join public.patients on patients.id = documents.patient_id
    join public.profiles on profiles.id = patients.profile_id
    where documents.object_path = storage.objects.name
      and profiles.auth_user_id = (select auth.uid()) and profiles.role = 'patient'
  )
);

create policy "Patients remove unregistered document uploads"
on storage.objects for delete to authenticated using (
  bucket_id = 'patient-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.documents where documents.object_path = storage.objects.name)
);

alter table public.audit_events drop constraint audit_events_action_allowed;
alter table public.audit_events drop constraint audit_events_target_type_allowed;
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
  'consultation_document_generated','patient_document_uploaded','patient_documents_listed','patient_document_downloaded'
));
alter table public.audit_events add constraint audit_events_target_type_allowed check(target_type in (
  'doctor','doctor_availability','appointment','intake_session','triage_result',
  'specialty_routing_result','patient','document'
));

create function public.register_patient_document(
  p_document_id uuid, p_appointment_id uuid, p_object_path text, p_original_filename text,
  p_mime_type text, p_file_extension text, p_size_bytes bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare user_id uuid := (select auth.uid()); actor_patient_id uuid;
begin
  select patients.id into actor_patient_id from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = user_id and profiles.role = 'patient';
  if actor_patient_id is null or p_document_id is null or p_appointment_id is null
    or not exists(select 1 from public.appointments where id=p_appointment_id and patient_id=actor_patient_id)
    or p_object_path <> user_id::text || '/' || p_document_id::text || '.' || p_file_extension
    or not exists(select 1 from storage.objects where bucket_id='patient-documents'
      and name=p_object_path and owner_id=user_id::text
      and (metadata->>'size')::bigint=p_size_bytes and metadata->>'mimetype'=p_mime_type)
  then raise insufficient_privilege using message='Document registration is unavailable'; end if;
  insert into public.documents(id,appointment_id,patient_id,object_path,original_filename,mime_type,file_extension,size_bytes)
  values(p_document_id,p_appointment_id,actor_patient_id,p_object_path,p_original_filename,p_mime_type,p_file_extension,p_size_bytes);
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'patient_document_uploaded','document',p_document_id,'success');
  return p_document_id;
end; $$;

create function public.list_own_patient_documents(p_appointment_id uuid)
returns setof public.documents language plpgsql security definer set search_path = '' as $$
declare user_id uuid := (select auth.uid()); actor_patient_id uuid;
begin
  select patients.id into actor_patient_id from public.patients join public.profiles on profiles.id=patients.profile_id
  where profiles.auth_user_id=user_id and profiles.role='patient';
  if actor_patient_id is null or not exists(select 1 from public.appointments
    where id=p_appointment_id and patient_id=actor_patient_id)
  then raise insufficient_privilege using message='Documents are unavailable'; end if;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'patient_documents_listed','appointment',p_appointment_id,'success');
  return query select * from public.documents where appointment_id=p_appointment_id and patient_id=actor_patient_id
    order by created_at desc;
end; $$;

create function public.authorize_patient_document_download(p_document_id uuid)
returns setof public.documents language plpgsql security definer set search_path = '' as $$
declare user_id uuid := (select auth.uid()); actor_patient_id uuid;
begin
  select patients.id into actor_patient_id from public.patients join public.profiles on profiles.id=patients.profile_id
  where profiles.auth_user_id=user_id and profiles.role='patient';
  if actor_patient_id is null or not exists(select 1 from public.documents
    where id=p_document_id and patient_id=actor_patient_id)
  then raise insufficient_privilege using message='Document is unavailable'; end if;
  insert into public.audit_events(actor_user_id,action,target_type,target_id,outcome)
  values(user_id,'patient_document_downloaded','document',p_document_id,'success');
  return query select * from public.documents where id=p_document_id and patient_id=actor_patient_id;
end; $$;

revoke execute on function public.register_patient_document(uuid,uuid,text,text,text,text,bigint) from public,anon;
grant execute on function public.register_patient_document(uuid,uuid,text,text,text,text,bigint) to authenticated;
revoke execute on function public.list_own_patient_documents(uuid), public.authorize_patient_document_download(uuid) from public,anon;
grant execute on function public.list_own_patient_documents(uuid), public.authorize_patient_document_download(uuid) to authenticated;

comment on table public.documents is 'Metadata for private patient health documents; object content remains in the private patient-documents bucket.';
