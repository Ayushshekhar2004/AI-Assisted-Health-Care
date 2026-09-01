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
  'doctor_documents_listed','doctor_document_downloaded','safe_care_guidance_recorded','patient_history_viewed'
));

create function public.list_patient_history(
  p_limit integer,
  p_offset integer
)
returns table (
  appointment_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  appointment_status public.appointment_status,
  doctor_name text,
  doctor_specialty text,
  consultation_outcome jsonb,
  finalized_prescription jsonb,
  uploaded_documents jsonb,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  actor_patient_id uuid;
begin
  if p_limit is null or p_limit not between 1 and 25
    or p_offset is null or p_offset not between 0 and 25000
  then
    raise invalid_parameter_value using message = 'Patient history request is invalid';
  end if;

  select patients.id
  into actor_patient_id
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = user_id
    and profiles.role = 'patient';

  if actor_patient_id is null then
    raise insufficient_privilege using message = 'Patient history is unavailable';
  end if;

  insert into public.audit_events(actor_user_id, action, target_type, target_id, outcome)
  values(user_id, 'patient_history_viewed', 'patient', actor_patient_id, 'success');

  return query
  select
    appointments.id,
    appointments.starts_at,
    appointments.ends_at,
    appointments.status,
    doctors.full_name,
    doctors.specialty,
    case when outcomes.id is null then null else jsonb_build_object(
      'outcome', outcomes.outcome,
      'referral_specialty', outcomes.referral_specialty,
      'clinic_location', outcomes.clinic_location,
      'location_instructions', outcomes.location_instructions,
      'appointment_note', outcomes.appointment_note,
      'recorded_at', outcomes.recorded_at
    ) end,
    case when prescriptions.id is null then null else jsonb_build_object(
      'id', prescriptions.id,
      'prescription_date', prescriptions.prescription_date,
      'follow_up', prescriptions.follow_up,
      'finalized_at', prescriptions.finalized_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', items.id,
          'item_type', items.item_type,
          'item_name', items.item_name,
          'dosage', items.dosage,
          'frequency', items.frequency,
          'duration', items.duration,
          'instructions', items.instructions,
          'sort_order', items.sort_order
        ) order by items.sort_order)
        from public.prescription_items items
        where items.prescription_id = prescriptions.id
      ), '[]'::jsonb)
    ) end,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', documents.id,
        'filename', documents.original_filename,
        'mime_type', documents.mime_type,
        'size_bytes', documents.size_bytes,
        'scan_status', documents.scan_status,
        'created_at', documents.created_at
      ) order by documents.created_at desc)
      from public.documents
      where documents.appointment_id = appointments.id
        and documents.patient_id = actor_patient_id
    ), '[]'::jsonb),
    count(*) over()
  from public.appointments
  join public.doctors on doctors.id = appointments.doctor_id
  left join public.consultation_outcomes outcomes
    on outcomes.appointment_id = appointments.id
  left join public.prescriptions
    on prescriptions.appointment_id = appointments.id
    and prescriptions.status = 'FINAL'
  where appointments.patient_id = actor_patient_id
    and (
      appointments.ends_at < now()
      or appointments.status in ('COMPLETED','CANCELLED','NO_SHOW','REQUIRES_IN_PERSON')
    )
  order by appointments.starts_at desc, appointments.id desc
  limit p_limit offset p_offset;
end;
$$;

revoke execute on function public.list_patient_history(integer, integer)
from public, anon;
grant execute on function public.list_patient_history(integer, integer)
to authenticated;

comment on function public.list_patient_history(integer, integer) is
  'Returns a bounded patient-owned history page without storage paths and records a content-free access event.';
