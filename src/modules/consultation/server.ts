import 'server-only';

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { getSupabaseAdminConfig } from '@/lib/supabase/admin-config';
import { createClient } from '@/lib/supabase/server';
import { createRoleAuthorizedClient } from '@/modules/auth';
import { pilotSpecialtySchema } from '@/modules/doctor';
import { intakeStructuredOutputSchema } from '@/modules/intake';
import {
  emergencyScreeningAnswersSchema,
  routingFallbackReasonSchema,
  routingUrgencySchema,
} from '@/modules/triage';

import {
  DOCTOR_HANDOFF_SUMMARY_VERSION,
  doctorHandoffSummarySchema,
  generateDoctorHandoff,
  legacyDoctorHandoffSummarySchema,
  type DoctorHandoffSummary,
} from './handoff';
import { parseAppointmentDetailId } from './validation';
import {
  consultationNoteInputSchema,
  consultationNoteSchema,
  parseFinalConsultationNote,
  type ConsultationNote,
  type ConsultationNoteInput,
} from './note';
import {
  CONSULTATION_AI_PROMPT_VERSION,
  consultationAIDraftRequestSchema,
  generateConsultationAIDraft,
} from './ai-draft';
import { createConsultationDraftModel } from './model-provider';

const appointmentStatusSchema = z.enum([
  'REQUESTED',
  'CONFIRMED',
  'CANCELLED',
  'IN_PROGRESS',
  'COMPLETED',
  'NO_SHOW',
  'REQUIRES_IN_PERSON',
]);

const triageSummarySchema = z.object({
  outcome: z.enum(['NO_RED_FLAG', 'RED_FLAG']),
  matchedRuleCodes: z
    .array(z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/))
    .max(100),
  ruleSetVersion: z.string().trim().min(1).max(64),
  evaluatedAt: z.string().datetime({ offset: true }),
});

const doctorRoutingSummarySchema = z
  .object({
    recommended_specialty: pilotSpecialtySchema,
    alternate_specialty: pilotSpecialtySchema.nullable(),
    urgency: routingUrgencySchema,
    rationale_for_doctor: z.string().trim().min(1).max(800),
    missing_information: z
      .array(
        z.enum([
          'chief_complaint',
          'onset',
          'duration',
          'severity',
          'associated_symptoms',
          'relevant_history',
          'current_medicines',
          'allergies',
          'pregnancy_possibility',
        ]),
      )
      .max(9),
    decision_source: z.enum(['AI', 'DETERMINISTIC_FALLBACK']),
    fallback_reasons: z.array(routingFallbackReasonSchema).max(4),
  })
  .strict();

const appointmentDetailSchema = z.object({
  id: z.string().uuid(),
  patient: z.object({
    displayName: z.string().trim().min(1).max(120),
    ageYears: z.number().int().min(0).max(130).nullable(),
    gender: z
      .enum(['woman', 'man', 'non_binary', 'prefer_not_to_say'])
      .nullable(),
    city: z.string().trim().min(1).max(120).nullable(),
    language: z.enum(['en', 'hi']).nullable(),
  }),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  status: appointmentStatusSchema,
  intakeState: z.enum([
    'NOT_STARTED',
    'IN_PROGRESS',
    'COMPLETED',
    'INCOMPLETE',
  ]),
  structuredIntake: intakeStructuredOutputSchema.nullable(),
  triage: triageSummarySchema.nullable(),
  routing: doctorRoutingSummarySchema.nullable(),
});

const transcriptMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['patient', 'assistant']),
  text: z.string().trim().min(1).max(4000),
  createdAt: z.string().datetime({ offset: true }),
});

type AppointmentDetailRow = Readonly<{
  appointment_id: unknown;
  patient_display_name: unknown;
  patient_age_years: unknown;
  patient_gender: unknown;
  patient_city: unknown;
  patient_language: unknown;
  starts_at: unknown;
  ends_at: unknown;
  appointment_status: unknown;
  intake_state: unknown;
  structured_data: unknown;
  triage_outcome: unknown;
  matched_rule_codes: unknown;
  triage_rule_set_version: unknown;
  triage_evaluated_at: unknown;
  routing_result: unknown;
}>;

type TranscriptMessageRow = Readonly<{
  message_id: unknown;
  message_role: unknown;
  text_content: unknown;
  created_at: unknown;
  sequence_number: unknown;
}>;

const handoffSourceSchema = z.object({
  structured_data: intakeStructuredOutputSchema,
  explicit_answers: emergencyScreeningAnswersSchema,
  triage_outcome: z.enum(['NO_RED_FLAG', 'RED_FLAG']),
  matched_rule_codes: z
    .array(z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/))
    .max(100),
  rule_set_version: z.string().trim().min(1).max(64),
  routing_reason: z.string().trim().min(1).max(800).nullable(),
});

const storedHandoffSchema = z.union([
  z.object({
    summaryVersion: z.literal(DOCTOR_HANDOFF_SUMMARY_VERSION),
    summary: doctorHandoffSummarySchema,
    generatedAt: z.string().datetime({ offset: true }),
  }),
  z.object({
    summaryVersion: z.literal('doctor-handoff-v1'),
    summary: legacyDoctorHandoffSummarySchema,
    generatedAt: z.string().datetime({ offset: true }),
  }),
]);

const handoffItemKeySchema = z.string().regex(/^[a-z][a-z0-9_.]{0,119}$/);

export type DoctorAppointmentDetail = z.infer<typeof appointmentDetailSchema>;
export type DoctorAppointmentTranscriptMessage = z.infer<
  typeof transcriptMessageSchema
>;
export type StoredDoctorHandoff = z.infer<typeof storedHandoffSchema>;

type ConsultationNoteRow = Readonly<{
  id: unknown;
  appointment_id: unknown;
  subjective_history: unknown;
  examination_observations: unknown;
  assessment: unknown;
  plan: unknown;
  follow_up: unknown;
  telemedicine_adequacy: unknown;
  status: unknown;
  finalized_at: unknown;
  finalized_by_doctor_id: unknown;
  ai_draft_generated_at: unknown;
  ai_model_name: unknown;
  ai_model_version: unknown;
  ai_prompt_version: unknown;
  updated_at: unknown;
}>;

function parseConsultationRow(row: ConsultationNoteRow): ConsultationNote {
  return consultationNoteSchema.parse({
    id: row.id,
    appointmentId: row.appointment_id,
    subjectiveHistory: row.subjective_history,
    examinationObservations: row.examination_observations,
    assessment: row.assessment,
    plan: row.plan,
    followUp: row.follow_up,
    telemedicineAdequacy: row.telemedicine_adequacy,
    status: row.status,
    finalizedAt: row.finalized_at,
    finalizedByDoctorId: row.finalized_by_doctor_id,
    aiDraftGeneratedAt: row.ai_draft_generated_at,
    aiModelName: row.ai_model_name,
    aiModelVersion: row.ai_model_version,
    aiPromptVersion: row.ai_prompt_version,
    updatedAt: row.updated_at,
  });
}

async function createAuthorizedDoctorClient() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user)
    throw new Error('Appointment detail is unavailable');

  const profile = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  if (profile.error || profile.data?.role !== 'doctor') {
    throw new Error('Appointment detail is unavailable');
  }

  return { supabase, userId: authData.user.id };
}

function createPrivilegedClient() {
  const { secretKey, url } = getSupabaseAdminConfig();
  return createSupabaseAdminClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getDoctorAppointmentDetail(
  appointmentIdInput: unknown,
): Promise<DoctorAppointmentDetail> {
  const appointmentId = parseAppointmentDetailId(appointmentIdInput);
  const { supabase } = await createAuthorizedDoctorClient();
  const { data, error } = await supabase.rpc('get_doctor_appointment_detail', {
    p_appointment_id: appointmentId,
  });
  if (error || !data?.length)
    throw new Error('Appointment detail is unavailable');
  const row = data[0] as AppointmentDetailRow;

  return appointmentDetailSchema.parse({
    id: row.appointment_id,
    patient: {
      displayName: row.patient_display_name,
      ageYears: row.patient_age_years,
      gender: row.patient_gender,
      city: row.patient_city,
      language: row.patient_language,
    },
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.appointment_status,
    intakeState: row.intake_state,
    structuredIntake: row.structured_data,
    triage:
      row.triage_outcome === null
        ? null
        : {
            outcome: row.triage_outcome,
            matchedRuleCodes: row.matched_rule_codes,
            ruleSetVersion: row.triage_rule_set_version,
            evaluatedAt: row.triage_evaluated_at,
          },
    routing: row.routing_result,
  });
}

export async function getDoctorAppointmentTranscript(
  appointmentIdInput: unknown,
): Promise<DoctorAppointmentTranscriptMessage[]> {
  const appointmentId = parseAppointmentDetailId(appointmentIdInput);
  const { supabase } = await createAuthorizedDoctorClient();
  const { data, error } = await supabase.rpc(
    'get_doctor_appointment_transcript',
    {
      p_appointment_id: appointmentId,
    },
  );
  if (error) throw new Error('Appointment transcript is unavailable');

  return z.array(transcriptMessageSchema).parse(
    ((data ?? []) as TranscriptMessageRow[]).map((message) => ({
      id: message.message_id,
      role: message.message_role,
      text: message.text_content,
      createdAt: message.created_at,
    })),
  );
}

export async function getDoctorAppointmentHandoff(
  appointmentIdInput: unknown,
): Promise<StoredDoctorHandoff | null> {
  const appointmentId = parseAppointmentDetailId(appointmentIdInput);
  const { supabase } = await createAuthorizedDoctorClient();
  const { data, error } = await supabase.rpc('get_doctor_handoff', {
    p_appointment_id: appointmentId,
  });
  if (error) throw new Error('Doctor handoff is unavailable');
  if (!data?.length) return null;

  const row = data[0] as {
    summary_version: unknown;
    summary_data: unknown;
    generated_at: unknown;
  };
  return storedHandoffSchema.parse({
    summaryVersion: row.summary_version,
    summary: row.summary_data,
    generatedAt: row.generated_at,
  });
}

export async function generateAndStoreDoctorHandoff(
  appointmentIdInput: unknown,
): Promise<StoredDoctorHandoff> {
  const appointmentId = parseAppointmentDetailId(appointmentIdInput);
  const { supabase, userId } = await createAuthorizedDoctorClient();
  const { data, error } = await supabase.rpc('get_doctor_handoff_source', {
    p_appointment_id: appointmentId,
  });
  if (error || !data?.length) {
    throw new Error('Doctor handoff is unavailable');
  }

  const source = handoffSourceSchema.parse(data[0]);
  const summary: DoctorHandoffSummary = generateDoctorHandoff({
    structuredIntake: source.structured_data,
    explicitAnswers: source.explicit_answers,
    triage: {
      outcome: source.triage_outcome,
      matchedRuleCodes: source.matched_rule_codes,
      ruleSetVersion: source.rule_set_version,
    },
    routingReason: source.routing_reason,
  });

  const privileged = createPrivilegedClient();
  const { error: storeError } = await privileged.rpc('record_doctor_handoff', {
    p_actor_user_id: userId,
    p_appointment_id: appointmentId,
    p_summary_data: summary,
    p_summary_version: DOCTOR_HANDOFF_SUMMARY_VERSION,
  });
  if (storeError) throw new Error('Doctor handoff is unavailable');

  const { data: storedData, error: storedError } = await supabase.rpc(
    'get_doctor_handoff',
    { p_appointment_id: appointmentId },
  );
  if (storedError || !storedData?.length) {
    throw new Error('Doctor handoff is unavailable');
  }
  const stored = storedData[0] as {
    summary_version: unknown;
    summary_data: unknown;
    generated_at: unknown;
  };
  return storedHandoffSchema.parse({
    summaryVersion: stored.summary_version,
    summary: stored.summary_data,
    generatedAt: stored.generated_at,
  });
}

export async function getDoctorHandoffInaccurateItems(
  appointmentIdInput: unknown,
  summaryVersionInput: unknown,
): Promise<string[]> {
  const appointmentId = parseAppointmentDetailId(appointmentIdInput);
  const summaryVersion = z
    .enum(['doctor-handoff-v1', DOCTOR_HANDOFF_SUMMARY_VERSION])
    .parse(summaryVersionInput);
  const { supabase } = await createAuthorizedDoctorClient();
  const { data, error } = await supabase.rpc(
    'get_doctor_handoff_inaccurate_items',
    {
      p_appointment_id: appointmentId,
      p_summary_version: summaryVersion,
    },
  );
  if (error) throw new Error('Doctor handoff feedback is unavailable');
  return z
    .array(handoffItemKeySchema)
    .parse(
      ((data ?? []) as Array<{ item_key: unknown }>).map((row) => row.item_key),
    );
}

export async function markDoctorHandoffItemInaccurate(
  appointmentIdInput: unknown,
  summaryVersionInput: unknown,
  itemKeyInput: unknown,
): Promise<string> {
  const appointmentId = parseAppointmentDetailId(appointmentIdInput);
  const summaryVersion = z
    .enum(['doctor-handoff-v1', DOCTOR_HANDOFF_SUMMARY_VERSION])
    .parse(summaryVersionInput);
  const itemKey = handoffItemKeySchema.parse(itemKeyInput);
  const { supabase } = await createAuthorizedDoctorClient();
  const { data, error } = await supabase.rpc('mark_doctor_handoff_inaccurate', {
    p_appointment_id: appointmentId,
    p_item_key: itemKey,
    p_summary_version: summaryVersion,
  });
  if (error) throw new Error('Doctor handoff feedback is unavailable');
  return z.string().uuid().parse(data);
}

export async function getOwnConsultationNote(
  appointmentIdInput: unknown,
): Promise<ConsultationNote | null> {
  const appointmentId = parseAppointmentDetailId(appointmentIdInput);
  const { supabase } = await createRoleAuthorizedClient(
    ['patient', 'doctor'],
    'Consultation note is unavailable',
  );
  const { data, error } = await supabase.rpc('get_own_consultation', {
    p_appointment_id: appointmentId,
  });
  if (error) throw new Error('Consultation note is unavailable');
  if (!data?.length) return null;
  return parseConsultationRow(data[0] as ConsultationNoteRow);
}

function consultationRpcArgs(note: ConsultationNoteInput) {
  return {
    p_appointment_id: note.appointmentId,
    p_subjective_history: note.subjectiveHistory,
    p_examination_observations: note.examinationObservations,
    p_assessment: note.assessment,
    p_plan: note.plan,
    p_follow_up: note.followUp,
    p_telemedicine_adequacy: note.telemedicineAdequacy || null,
  };
}

export async function saveConsultationDraft(input: unknown): Promise<void> {
  const note = consultationNoteInputSchema.parse(input);
  const { supabase } = await createAuthorizedDoctorClient();
  const { error } = await supabase.rpc(
    'save_consultation_draft',
    consultationRpcArgs(note),
  );
  if (error) throw new Error('Consultation note is unavailable');
}

export async function finalizeConsultationNote(input: unknown): Promise<void> {
  const note = parseFinalConsultationNote(input);
  const { supabase } = await createAuthorizedDoctorClient();
  const { error } = await supabase.rpc(
    'finalize_consultation',
    consultationRpcArgs(note),
  );
  if (error) throw new Error('Consultation note is unavailable');
}

export async function generateAndStoreConsultationAIDraft(
  input: unknown,
): Promise<ConsultationNote> {
  const request = consultationAIDraftRequestSchema.parse(input);
  const { supabase, userId } = await createAuthorizedDoctorClient();
  const { data: sourceData, error: sourceError } = await supabase.rpc(
    'get_consultation_ai_draft_source',
    { p_appointment_id: request.appointmentId },
  );
  if (sourceError || !sourceData?.length) {
    throw new Error('AI consultation draft is unavailable');
  }
  const reviewedIntake = intakeStructuredOutputSchema
    .nullable()
    .parse(sourceData[0].structured_data);
  const generated = await generateConsultationAIDraft(
    createConsultationDraftModel(),
    { reviewedIntake, doctorPoints: request.doctorPoints },
  );

  const privileged = createPrivilegedClient();
  const { error: storeError } = await privileged.rpc(
    'record_consultation_ai_draft',
    {
      p_actor_user_id: userId,
      p_appointment_id: request.appointmentId,
      p_subjective_history: generated.output.subjective_history,
      p_examination_observations: generated.output.examination_observations,
      p_assessment: generated.output.assessment,
      p_plan: generated.output.plan,
      p_follow_up: generated.output.follow_up,
      p_model_name: generated.modelName,
      p_model_version: generated.modelVersion,
      p_prompt_version: CONSULTATION_AI_PROMPT_VERSION,
    },
  );
  if (storeError) throw new Error('AI consultation draft is unavailable');

  const { data, error } = await supabase.rpc('get_own_consultation', {
    p_appointment_id: request.appointmentId,
  });
  if (error || !data?.length) {
    throw new Error('AI consultation draft is unavailable');
  }
  return parseConsultationRow(data[0] as ConsultationNoteRow);
}
