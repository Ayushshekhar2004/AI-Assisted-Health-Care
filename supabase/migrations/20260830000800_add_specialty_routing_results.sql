create table public.specialty_routing_results (
  id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null
    references public.intake_sessions (id) on delete restrict,
  model_name text not null,
  model_version text not null,
  prompt_version text not null,
  routing_schema_version text not null,
  routing_policy_version text not null,
  model_output jsonb not null,
  routing_result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint specialty_routing_model_name_valid check (
    char_length(btrim(model_name)) between 1 and 120
  ),
  constraint specialty_routing_model_version_valid check (
    char_length(btrim(model_version)) between 1 and 120
  ),
  constraint specialty_routing_prompt_version_valid check (
    char_length(btrim(prompt_version)) between 1 and 64
  ),
  constraint specialty_routing_schema_version_valid check (
    char_length(btrim(routing_schema_version)) between 1 and 64
  ),
  constraint specialty_routing_policy_version_valid check (
    char_length(btrim(routing_policy_version)) between 1 and 64
  ),
  constraint specialty_routing_model_output_object check (
    jsonb_typeof(model_output) = 'object'
    and pg_column_size(model_output) <= 16384
  ),
  constraint specialty_routing_result_object check (
    jsonb_typeof(routing_result) = 'object'
    and pg_column_size(routing_result) <= 16384
  ),
  constraint specialty_routing_no_forbidden_fields check (
    not model_output ?| array[
      'diagnosis',
      'prescription',
      'medication_recommendation',
      'reasoning',
      'hidden_reasoning',
      'chain_of_thought'
    ]
    and not routing_result ?| array[
      'diagnosis',
      'prescription',
      'medication_recommendation',
      'reasoning',
      'hidden_reasoning',
      'chain_of_thought'
    ]
  )
);

create index specialty_routing_results_session_created_idx
on public.specialty_routing_results (intake_session_id, created_at desc);

create trigger specialty_routing_results_set_updated_at
before update on public.specialty_routing_results
for each row execute function public.set_updated_at();

alter table public.specialty_routing_results enable row level security;
revoke all on table public.specialty_routing_results
from anon, authenticated, service_role;
grant select on table public.specialty_routing_results to authenticated;

create policy "Patients can read their own specialty routing results"
on public.specialty_routing_results for select
to authenticated
using (
  intake_session_id in (
    select intake_sessions.id
    from public.intake_sessions
  )
);

alter table public.audit_events drop constraint audit_events_action_allowed;
alter table public.audit_events drop constraint audit_events_target_type_allowed;
alter table public.audit_events
  add constraint audit_events_action_allowed check (
    action in (
      'doctor_verification_approved',
      'doctor_verification_rejected',
      'doctor_availability_created',
      'doctor_availability_deleted',
      'appointment_requested',
      'appointment_status_transitioned',
      'intake_session_started',
      'intake_message_added',
      'intake_patient_message_added',
      'intake_assistant_turn_recorded',
      'triage_no_red_flag_recorded',
      'triage_red_flag_detected',
      'triage_emergency_pathway_entered',
      'specialty_routing_recorded'
    )
  ),
  add constraint audit_events_target_type_allowed check (
    target_type in (
      'doctor',
      'doctor_availability',
      'appointment',
      'intake_session',
      'triage_result',
      'specialty_routing_result'
    )
  );

create function public.record_specialty_routing_result(
  p_actor_user_id uuid,
  p_intake_session_id uuid,
  p_model_name text,
  p_model_version text,
  p_prompt_version text,
  p_routing_schema_version text,
  p_routing_policy_version text,
  p_model_output jsonb,
  p_routing_result jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_patient_id uuid;
  result_id uuid;
  allowed_specialties constant text[] := array[
    'GENERAL_MEDICINE',
    'PEDIATRICS',
    'OBSTETRICS_GYNECOLOGY',
    'DERMATOLOGY',
    'ORTHOPEDICS',
    'OTORHINOLARYNGOLOGY',
    'OPHTHALMOLOGY',
    'PSYCHIATRY',
    'CARDIOLOGY',
    'NEUROLOGY',
    'PULMONOLOGY',
    'GASTROENTEROLOGY'
  ];
  allowed_urgencies constant text[] := array[
    'ROUTINE', 'SOON', 'URGENT', 'EMERGENCY'
  ];
  allowed_fallback_reasons constant text[] := array[
    'LOW_CONFIDENCE', 'INSUFFICIENT_DATA', 'MULTI_SYSTEM', 'RED_FLAG'
  ];
  allowed_missing_information constant text[] := array[
    'chief_complaint', 'onset', 'duration', 'severity',
    'associated_symptoms', 'relevant_history', 'current_medicines',
    'allergies', 'pregnancy_possibility'
  ];
begin
  if p_model_name is null
    or char_length(btrim(p_model_name)) not between 1 and 120
    or p_model_version is null
    or char_length(btrim(p_model_version)) not between 1 and 120
    or p_prompt_version is null
    or char_length(btrim(p_prompt_version)) not between 1 and 64
    or p_routing_schema_version is null
    or char_length(btrim(p_routing_schema_version)) not between 1 and 64
    or p_routing_policy_version is null
    or char_length(btrim(p_routing_policy_version)) not between 1 and 64
    or p_model_output is null
    or jsonb_typeof(p_model_output) <> 'object'
    or pg_column_size(p_model_output) > 16384
    or p_routing_result is null
    or jsonb_typeof(p_routing_result) <> 'object'
    or pg_column_size(p_routing_result) > 16384
    or p_model_output ?| array[
      'diagnosis', 'prescription', 'medication_recommendation',
      'reasoning', 'hidden_reasoning', 'chain_of_thought'
    ]
    or p_routing_result ?| array[
      'diagnosis', 'prescription', 'medication_recommendation',
      'reasoning', 'hidden_reasoning', 'chain_of_thought'
    ]
    or not p_model_output ?& array[
      'recommended_specialty', 'alternate_specialty', 'urgency',
      'rationale_for_doctor', 'confidence', 'missing_information'
    ]
    or not p_routing_result ?& array[
      'recommended_specialty', 'alternate_specialty', 'urgency',
      'rationale_for_doctor', 'confidence', 'missing_information',
      'decision_source', 'fallback_reasons'
    ]
    or p_model_output - array[
      'recommended_specialty', 'alternate_specialty', 'urgency',
      'rationale_for_doctor', 'confidence', 'missing_information'
    ] <> '{}'::jsonb
    or p_routing_result - array[
      'recommended_specialty', 'alternate_specialty', 'urgency',
      'rationale_for_doctor', 'confidence', 'missing_information',
      'decision_source', 'fallback_reasons'
    ] <> '{}'::jsonb
    or jsonb_typeof(p_model_output->'recommended_specialty') <> 'string'
    or p_model_output->>'recommended_specialty' <> all(allowed_specialties)
    or jsonb_typeof(p_routing_result->'recommended_specialty') <> 'string'
    or p_routing_result->>'recommended_specialty' <> all(allowed_specialties)
    or (
      jsonb_typeof(p_model_output->'alternate_specialty') <> 'null'
      and p_model_output->>'alternate_specialty' <> all(allowed_specialties)
    )
    or (
      jsonb_typeof(p_routing_result->'alternate_specialty') <> 'null'
      and p_routing_result->>'alternate_specialty' <> all(allowed_specialties)
    )
    or p_model_output->>'alternate_specialty' = p_model_output->>'recommended_specialty'
    or p_routing_result->>'alternate_specialty' = p_routing_result->>'recommended_specialty'
    or jsonb_typeof(p_model_output->'urgency') <> 'string'
    or p_model_output->>'urgency' <> all(allowed_urgencies)
    or jsonb_typeof(p_routing_result->'urgency') <> 'string'
    or p_routing_result->>'urgency' <> all(allowed_urgencies)
    or jsonb_typeof(p_model_output->'rationale_for_doctor') <> 'string'
    or char_length(btrim(p_model_output->>'rationale_for_doctor')) not between 1 and 800
    or jsonb_typeof(p_routing_result->'rationale_for_doctor') <> 'string'
    or char_length(btrim(p_routing_result->>'rationale_for_doctor')) not between 1 and 800
    or jsonb_typeof(p_model_output->'confidence') <> 'number'
    or (p_model_output->>'confidence')::numeric not between 0 and 1
    or jsonb_typeof(p_routing_result->'confidence') <> 'number'
    or (p_routing_result->>'confidence')::numeric not between 0 and 1
    or jsonb_typeof(p_model_output->'missing_information') <> 'array'
    or jsonb_array_length(p_model_output->'missing_information') > 9
    or exists (
      select 1
      from jsonb_array_elements_text(p_model_output->'missing_information') as field
      where field <> all(allowed_missing_information)
    )
    or jsonb_typeof(p_routing_result->'missing_information') <> 'array'
    or jsonb_array_length(p_routing_result->'missing_information') > 9
    or exists (
      select 1
      from jsonb_array_elements_text(p_routing_result->'missing_information') as field
      where field <> all(allowed_missing_information)
    )
    or jsonb_typeof(p_routing_result->'fallback_reasons') <> 'array'
    or jsonb_array_length(p_routing_result->'fallback_reasons') > 4
    or exists (
      select 1
      from jsonb_array_elements_text(p_routing_result->'fallback_reasons') as reason
      where reason <> all(allowed_fallback_reasons)
    )
    or jsonb_typeof(p_routing_result->'decision_source') <> 'string'
    or p_routing_result->>'decision_source' not in ('AI', 'DETERMINISTIC_FALLBACK')
    or (
      p_routing_result->>'decision_source' = 'AI'
      and jsonb_array_length(p_routing_result->'fallback_reasons') <> 0
    )
    or (
      p_routing_result->>'decision_source' = 'DETERMINISTIC_FALLBACK'
      and (
        jsonb_array_length(p_routing_result->'fallback_reasons') = 0
        or p_routing_result->>'recommended_specialty' <> 'GENERAL_MEDICINE'
        or jsonb_typeof(p_routing_result->'alternate_specialty') <> 'null'
      )
    )
    or (
      p_routing_result->'fallback_reasons' ? 'RED_FLAG'
      and p_routing_result->>'urgency' <> 'EMERGENCY'
    )
  then
    raise check_violation using message = 'Specialty routing result is invalid';
  end if;

  select patients.id
  into actor_patient_id
  from public.patients
  join public.profiles on profiles.id = patients.profile_id
  where profiles.auth_user_id = p_actor_user_id
    and profiles.role = 'patient'
    and patients.status = 'active';

  if actor_patient_id is null or not exists (
    select 1
    from public.intake_sessions
    where intake_sessions.id = p_intake_session_id
      and intake_sessions.patient_id = actor_patient_id
  ) then
    raise insufficient_privilege using message = 'Specialty routing is unavailable';
  end if;

  insert into public.specialty_routing_results (
    intake_session_id,
    model_name,
    model_version,
    prompt_version,
    routing_schema_version,
    routing_policy_version,
    model_output,
    routing_result
  )
  values (
    p_intake_session_id,
    btrim(p_model_name),
    btrim(p_model_version),
    btrim(p_prompt_version),
    btrim(p_routing_schema_version),
    btrim(p_routing_policy_version),
    p_model_output,
    p_routing_result
  )
  returning id into result_id;

  insert into public.audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome
  )
  values (
    p_actor_user_id,
    'specialty_routing_recorded',
    'specialty_routing_result',
    result_id,
    'success'
  );

  return result_id;
end;
$$;

revoke execute on function public.record_specialty_routing_result(
  uuid, uuid, text, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.record_specialty_routing_result(
  uuid, uuid, text, text, text, text, text, jsonb, jsonb
) to service_role;

comment on table public.specialty_routing_results is
  'Private model provenance, validated model output, and final routing decision for audit and evaluation.';
comment on function public.record_specialty_routing_result(
  uuid, uuid, text, text, text, text, text, jsonb, jsonb
) is
  'Service-only routing persistence with patient/session verification and content-free auditing.';
