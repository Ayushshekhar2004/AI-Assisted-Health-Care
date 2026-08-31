import 'server-only';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { pilotSpecialtySchema } from '@/modules/doctor';
import { intakeStructuredOutputSchema } from '@/modules/intake';
import {
  routingFallbackReasonSchema,
  routingUrgencySchema,
} from '@/modules/triage';

import { parseAppointmentDetailId } from './validation';

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

export type DoctorAppointmentDetail = z.infer<typeof appointmentDetailSchema>;
export type DoctorAppointmentTranscriptMessage = z.infer<
  typeof transcriptMessageSchema
>;

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

  return supabase;
}

export async function getDoctorAppointmentDetail(
  appointmentIdInput: unknown,
): Promise<DoctorAppointmentDetail> {
  const appointmentId = parseAppointmentDetailId(appointmentIdInput);
  const supabase = await createAuthorizedDoctorClient();
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
  const supabase = await createAuthorizedDoctorClient();
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
