create or replace function public.record_patient_consent_decision(
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
  values(actor_patient_id,p_consent_type,p_status,expected_version,clock_timestamp())
  returning id into consent_id;
  return consent_id;
end; $$;

comment on function public.record_patient_consent_decision(public.consent_type,public.consent_status,text) is
  'Serializes append-only purpose decisions and uses wall-clock effective timestamps for deterministic latest-state enforcement.';
