begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '14000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'routing-patient-one@example.invalid',
    '', now(), '{}', '{}', now(), now()
  ),
  (
    '14000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'routing-patient-two@example.invalid',
    '', now(), '{}', '{}', now(), now()
  ),
  (
    '14000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'routing-doctor@example.invalid',
    '', now(), '{}', '{}', now(), now()
  );

delete from public.profiles
where auth_user_id in (
  '14000000-0000-0000-0000-000000000001',
  '14000000-0000-0000-0000-000000000002',
  '14000000-0000-0000-0000-000000000003'
);

insert into public.profiles (id, auth_user_id, role)
values
  ('24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'patient'),
  ('24000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000002', 'patient'),
  ('24000000-0000-0000-0000-000000000003', '14000000-0000-0000-0000-000000000003', 'doctor');

insert into public.patients (id, profile_id)
values
  ('34000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001'),
  ('34000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000002');

insert into public.doctors (id, profile_id)
values ('54000000-0000-0000-0000-000000000003', '24000000-0000-0000-0000-000000000003');

insert into public.intake_sessions (id, patient_id)
values
  ('74000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001'),
  ('74000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002');

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.specialty_routing_results'::regclass
  ),
  'specialty routing results has RLS enabled'
);
select has_column('public', 'specialty_routing_results', 'model_name', 'model name is persisted');
select has_column('public', 'specialty_routing_results', 'model_version', 'model version is persisted');
select has_column('public', 'specialty_routing_results', 'prompt_version', 'prompt version is persisted');
select has_column('public', 'specialty_routing_results', 'model_output', 'validated model output is persisted');
select has_column('public', 'specialty_routing_results', 'routing_result', 'final routing result is persisted');
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'specialty_routing_results'
      and column_name in ('patient_text', 'message_body', 'symptoms', 'prescription')
  ),
  0::bigint,
  'routing persistence does not duplicate raw intake input'
);

set local role authenticated;
set local request.jwt.claim.sub = '14000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    insert into public.specialty_routing_results (
      intake_session_id, model_name, model_version, prompt_version,
      routing_schema_version, routing_policy_version, model_output, routing_result
    ) values (
      '74000000-0000-0000-0000-000000000001',
      'forged', 'forged', 'forged', 'forged', 'forged', '{}'::jsonb, '{}'::jsonb
    )
  $$,
  '42501',
  'permission denied for table specialty_routing_results',
  'patient cannot forge a routing result'
);
select throws_ok(
  $$
    select public.record_specialty_routing_result(
      '14000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001',
      'synthetic-model', 'synthetic-model-v1', 'prompt-v1', 'schema-v1', 'policy-v1',
      '{}'::jsonb, '{}'::jsonb
    )
  $$,
  '42501',
  'permission denied for function record_specialty_routing_result',
  'patient cannot invoke privileged routing persistence'
);

reset role;
set local role service_role;

select throws_ok(
  $$
    insert into public.specialty_routing_results (
      intake_session_id, model_name, model_version, prompt_version,
      routing_schema_version, routing_policy_version, model_output, routing_result
    ) values (
      '74000000-0000-0000-0000-000000000001',
      'forged', 'forged', 'forged', 'forged', 'forged', '{}'::jsonb, '{}'::jsonb
    )
  $$,
  '42501',
  'permission denied for table specialty_routing_results',
  'service role must use validated routing persistence'
);
select throws_ok(
  $$
    select public.record_specialty_routing_result(
      '14000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001',
      'synthetic-model', 'synthetic-model-v1', 'prompt-v1', 'schema-v1', 'policy-v1',
      '{
        "recommended_specialty": "GENERAL_MEDICINE",
        "alternate_specialty": null,
        "urgency": "ROUTINE",
        "rationale_for_doctor": "Synthetic rationale.",
        "confidence": 0.8,
        "missing_information": [],
        "diagnosis": "forbidden"
      }'::jsonb,
      '{}'::jsonb
    )
  $$,
  '23514',
  'Specialty routing result is invalid',
  'database rejects forbidden diagnosis fields'
);
select lives_ok(
  $$
    select public.record_specialty_routing_result(
      '14000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001',
      'synthetic-model',
      'synthetic-model-2026-01-01',
      'specialty-routing-prompt-v1',
      'specialty-routing-v1',
      'specialty-routing-policy-v1',
      '{
        "recommended_specialty": "CARDIOLOGY",
        "alternate_specialty": null,
        "urgency": "SOON",
        "rationale_for_doctor": "Synthetic rationale for clinician review.",
        "confidence": 0.5,
        "missing_information": []
      }'::jsonb,
      '{
        "recommended_specialty": "GENERAL_MEDICINE",
        "alternate_specialty": null,
        "urgency": "SOON",
        "rationale_for_doctor": "Synthetic rationale for clinician review.",
        "confidence": 0.5,
        "missing_information": [],
        "decision_source": "DETERMINISTIC_FALLBACK",
        "fallback_reasons": ["LOW_CONFIDENCE"]
      }'::jsonb
    )
  $$,
  'service role records validated provenance and routing snapshots'
);
select throws_ok(
  $$
    select public.record_specialty_routing_result(
      '14000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000002',
      'synthetic-model',
      'synthetic-model-2026-01-01',
      'specialty-routing-prompt-v1',
      'specialty-routing-v1',
      'specialty-routing-policy-v1',
      '{
        "recommended_specialty": "GENERAL_MEDICINE",
        "alternate_specialty": null,
        "urgency": "ROUTINE",
        "rationale_for_doctor": "Synthetic rationale.",
        "confidence": 0.8,
        "missing_information": []
      }'::jsonb,
      '{
        "recommended_specialty": "GENERAL_MEDICINE",
        "alternate_specialty": null,
        "urgency": "ROUTINE",
        "rationale_for_doctor": "Synthetic rationale.",
        "confidence": 0.8,
        "missing_information": [],
        "decision_source": "AI",
        "fallback_reasons": []
      }'::jsonb
    )
  $$,
  '42501',
  'Specialty routing is unavailable',
  'service persistence rejects a mismatched patient session'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '14000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.specialty_routing_results),
  1::bigint,
  'patient sees own routing result'
);
select results_eq(
  $$
    select model_name, model_version, prompt_version,
      routing_result->>'recommended_specialty'
    from public.specialty_routing_results
  $$,
  $$
    values (
      'synthetic-model',
      'synthetic-model-2026-01-01',
      'specialty-routing-prompt-v1',
      'GENERAL_MEDICINE'
    )
  $$,
  'patient sees stored provenance and final routing specialty'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '14000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from public.specialty_routing_results),
  0::bigint,
  'another patient cannot see the routing result'
);
select throws_ok(
  $$
    select public.record_specialty_routing_result(
      '14000000-0000-0000-0000-000000000002',
      '74000000-0000-0000-0000-000000000002',
      'forged', 'forged', 'forged', 'forged', 'forged', '{}'::jsonb, '{}'::jsonb
    )
  $$,
  '42501',
  'permission denied for function record_specialty_routing_result',
  'another patient cannot invoke routing persistence'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '14000000-0000-0000-0000-000000000003';

select is(
  (select count(*) from public.specialty_routing_results),
  0::bigint,
  'doctor cannot browse routing results globally'
);

reset role;

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'specialty_routing_recorded'
      and target_type = 'specialty_routing_result'
  ),
  1::bigint,
  'routing persistence creates one content-free audit event'
);

select * from finish();
rollback;
