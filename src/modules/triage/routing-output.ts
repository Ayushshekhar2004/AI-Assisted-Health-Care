import { z } from 'zod';

import {
  safeAIGeneratedTextSchema,
  withAISecurityInstructions,
} from '../../lib/ai/prompt-security';

import {
  DEFAULT_PILOT_SPECIALTY,
  PILOT_SPECIALTY_CODES,
  pilotSpecialtySchema,
} from '../doctor';
import { intakeFieldSchema, intakeStructuredOutputSchema } from '../intake';

export const routingUrgencySchema = z.enum([
  'ROUTINE',
  'SOON',
  'URGENT',
  'EMERGENCY',
]);

const rationaleForDoctorSchema = z.string().min(1).max(800);

/** Base strict schema passed to the Structured Outputs helper. */
export const routingOutputFormatSchema = z
  .object({
    recommended_specialty: pilotSpecialtySchema,
    alternate_specialty: pilotSpecialtySchema.nullable(),
    urgency: routingUrgencySchema,
    rationale_for_doctor: rationaleForDoctorSchema,
    confidence: z.number().min(0).max(1),
    missing_information: z.array(intakeFieldSchema).max(9),
  })
  .strict();

export const routingOutputSchema = routingOutputFormatSchema.superRefine(
  (output, context) => {
    if (
      !safeAIGeneratedTextSchema.safeParse(output.rationale_for_doctor).success
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Doctor rationale contains a forbidden operational instruction',
        path: ['rationale_for_doctor'],
      });
    }
    if (output.rationale_for_doctor.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Doctor rationale cannot be blank',
        path: ['rationale_for_doctor'],
      });
    }
    if (output.alternate_specialty === output.recommended_specialty) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Alternate specialty must differ from the recommendation',
        path: ['alternate_specialty'],
      });
    }
  },
);

export const routingInputSchema = z
  .object({
    structuredIntake: intakeStructuredOutputSchema,
    redFlagDetected: z.boolean(),
  })
  .strict();

export type RoutingOutput = z.infer<typeof routingOutputSchema>;
export type RoutingInput = z.infer<typeof routingInputSchema>;
export type RoutingUrgency = z.infer<typeof routingUrgencySchema>;

export const ROUTING_SCHEMA_VERSION = 'specialty-routing-v1';
export const ROUTING_PROMPT_VERSION = 'specialty-routing-prompt-v1';

export const ROUTING_ORCHESTRATOR_INSTRUCTIONS = withAISecurityInstructions(
  `
You are an assistive specialty-routing system for clinician review. Route only to this controlled
pilot taxonomy: ${PILOT_SPECIALTY_CODES.join(', ')}.

Rules:
- Never provide, suggest, imply, or finalize a diagnosis.
- Never recommend, prescribe, start, stop, change, or discuss a medication or dose.
- Never provide treatment instructions or patient-facing medical advice.
- Use only patient-provided structured intake facts. Do not invent missing clinical details.
- Select ${DEFAULT_PILOT_SPECIALTY} when information is insufficient or no narrower pilot specialty
  clearly fits. The alternate specialty must be null unless a distinct pilot specialty would help a
  reviewing doctor.
- rationale_for_doctor is a concise routing explanation for an authorized doctor. It must not state
  a diagnosis, medication recommendation, hidden reasoning, or chain-of-thought.
- confidence is routing confidence only. It cannot establish safety, suppress urgency, override a
  deterministic red flag, or clear an emergency pathway.
- When redFlagDetected is true, urgency must be EMERGENCY. Normal doctor routing remains blocked by
  the deterministic emergency pathway regardless of this output.
- List only controlled intake fields that are still missing and materially affect routing.

Return only the structured output required by the schema.
`.trim(),
);
