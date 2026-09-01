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
  'doctor_documents_listed','doctor_document_downloaded','safe_care_guidance_recorded','patient_history_viewed',
  'patient_consultation_packet_downloaded'
));

create function public.audit_patient_consultation_packet(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_patient_id uuid;
begin
  select patients.id
  into actor_patient_id
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'patient';

  if actor_patient_id is null or not exists (
    select 1
    from public.appointments
    join public.consultations
      on consultations.appointment_id = appointments.id
    where appointments.id = p_appointment_id
      and appointments.patient_id = actor_patient_id
      and consultations.patient_id = actor_patient_id
      and consultations.status = 'FINALIZED'
  ) then
    raise insufficient_privilege using message = 'Consultation packet is unavailable';
  end if;

  insert into public.audit_events(actor_user_id, action, target_type, target_id, outcome)
  values(user_id, 'patient_consultation_packet_downloaded', 'appointment', p_appointment_id, 'success');
end;
$$;

revoke execute on function public.audit_patient_consultation_packet(uuid)
from public, anon;
grant execute on function public.audit_patient_consultation_packet(uuid)
to authenticated;

comment on function public.audit_patient_consultation_packet(uuid) is
  'Authorizes a patient-owned packet only after consultation finalization and records a content-free audit event.';
