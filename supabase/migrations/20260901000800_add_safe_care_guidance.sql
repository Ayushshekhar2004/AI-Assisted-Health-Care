create table public.safe_care_guidance_results (
  id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null unique references public.intake_sessions (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  symptom_category text not null,
  disposition text not null,
  language public.preferred_language not null,
  library_version text not null,
  guidance_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint safe_care_category_allowed check (symptom_category in (
    'MILD_HEADACHE','MILD_FEVER','MINOR_SPRAIN_STRAIN','MILD_ACIDITY_INDIGESTION',
    'MINOR_SUPERFICIAL_CUT','MILD_ANXIETY_PANIC','UNSUPPORTED'
  )),
  constraint safe_care_disposition_allowed check (
    disposition in ('GUIDANCE','UNSUPPORTED','HIGH_RISK','EMERGENCY')
  ),
  constraint safe_care_library_version_safe check (
    library_version ~ '^[A-Za-z0-9._-]{1,80}$'
  ),
  constraint safe_care_snapshot_object check (
    jsonb_typeof(guidance_snapshot) = 'object'
    and pg_column_size(guidance_snapshot) <= 32768
    and guidance_snapshot ?& array[
      'symptom_category','allowed_interim_actions','red_flags','prohibited_actions',
      'escalation_message','disclaimer','language','disposition','library_version'
    ]
    and not guidance_snapshot ?| array[
      'diagnosis','prescription','antibiotic','medication_dosage','dosage','reasoning','chain_of_thought'
    ]
  ),
  constraint safe_care_suppressed_has_no_actions check (
    disposition = 'GUIDANCE'
    or jsonb_array_length(guidance_snapshot->'allowed_interim_actions') = 0
  )
);

create index safe_care_guidance_patient_created_idx
on public.safe_care_guidance_results (patient_id, created_at desc);

create trigger safe_care_guidance_set_updated_at
before update on public.safe_care_guidance_results
for each row execute function public.set_updated_at();

alter table public.safe_care_guidance_results enable row level security;
revoke all on table public.safe_care_guidance_results from public, anon, authenticated;
grant select on table public.safe_care_guidance_results to authenticated;
grant select, insert on table public.safe_care_guidance_results to service_role;

create policy "Patients read only their own safe care guidance"
on public.safe_care_guidance_results for select
to authenticated
using (
  patient_id in (
    select patients.id
    from public.patients
    join public.profiles on profiles.id = patients.profile_id
    where profiles.auth_user_id = (select auth.uid())
      and profiles.role = 'patient'
  )
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
  'consultation_document_generated','patient_document_uploaded','patient_documents_listed','patient_document_downloaded',
  'doctor_documents_listed','doctor_document_downloaded','safe_care_guidance_recorded'
));
alter table public.audit_events add constraint audit_events_target_type_allowed check(target_type in (
  'doctor','doctor_availability','appointment','intake_session','triage_result',
  'specialty_routing_result','patient','document','safe_care_guidance'
));

create function public.record_safe_care_guidance(
  p_actor_user_id uuid,
  p_intake_session_id uuid,
  p_guidance jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_patient_id uuid;
  result_id uuid;
  guidance_disposition text := p_guidance->>'disposition';
begin
  select patients.id
  into actor_patient_id
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = p_actor_user_id
    and profiles.role = 'patient'
    and patients.onboarding_completed_at is not null;

  if actor_patient_id is null
    or p_guidance is null
    or jsonb_typeof(p_guidance) <> 'object'
    or pg_column_size(p_guidance) > 32768
    or not exists (
      select 1 from public.intake_sessions
      where intake_sessions.id = p_intake_session_id
        and intake_sessions.patient_id = actor_patient_id
        and intake_sessions.status = 'COMPLETED'
    )
    or exists (
      select 1 from public.appointments
      where appointments.intake_session_id = p_intake_session_id
        and appointments.patient_id = actor_patient_id
        and appointments.status not in ('REQUESTED','CONFIRMED')
    )
    or (
      exists (
        select 1 from public.triage_results
        where triage_results.intake_session_id = p_intake_session_id
          and triage_results.outcome = 'RED_FLAG'
      )
      and guidance_disposition <> 'EMERGENCY'
    )
  then
    raise insufficient_privilege using message = 'Safe care guidance is unavailable';
  end if;

  insert into public.safe_care_guidance_results (
    intake_session_id,
    patient_id,
    symptom_category,
    disposition,
    language,
    library_version,
    guidance_snapshot
  ) values (
    p_intake_session_id,
    actor_patient_id,
    p_guidance->>'symptom_category',
    guidance_disposition,
    (p_guidance->>'language')::public.preferred_language,
    p_guidance->>'library_version',
    p_guidance
  )
  on conflict (intake_session_id) do update
  set guidance_snapshot = safe_care_guidance_results.guidance_snapshot
  returning id into result_id;

  insert into public.audit_events (
    actor_user_id, action, target_type, target_id, outcome
  ) values (
    p_actor_user_id, 'safe_care_guidance_recorded', 'safe_care_guidance', result_id, 'success'
  )
  on conflict do nothing;

  return result_id;
end;
$$;

revoke execute on function public.record_safe_care_guidance(uuid, uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.record_safe_care_guidance(uuid, uuid, jsonb)
to service_role;

comment on table public.safe_care_guidance_results is
  'Versioned, patient-private snapshot selected from the clinician-reviewable interim guidance library.';
comment on function public.record_safe_care_guidance(uuid, uuid, jsonb) is
  'Service-only idempotent persistence after patient ownership, completed intake, pre-response state, and red-flag checks.';
