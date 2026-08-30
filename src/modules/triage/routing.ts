import {
  ROUTING_PROMPT_VERSION,
  ROUTING_SCHEMA_VERSION,
  routingInputSchema,
  routingOutputFormatSchema,
  routingOutputSchema,
  type RoutingInput,
  type RoutingOutput,
} from './routing-output';
import { DEFAULT_PILOT_SPECIALTY } from '../doctor';

import { z } from 'zod';

export const ROUTING_CONFIDENCE_THRESHOLD = 0.65;
export const ROUTING_POLICY_VERSION = 'specialty-routing-policy-v1';

export const routingFallbackReasonSchema = z.enum([
  'LOW_CONFIDENCE',
  'INSUFFICIENT_DATA',
  'MULTI_SYSTEM',
  'RED_FLAG',
]);

const routingModelResultSchema = z
  .object({
    modelName: z.string().trim().min(1).max(120),
    modelVersion: z.string().trim().min(1).max(120),
    output: z.unknown(),
  })
  .strict();

export const finalRoutingResultSchema = routingOutputFormatSchema
  .extend({
    decision_source: z.enum(['AI', 'DETERMINISTIC_FALLBACK']),
    fallback_reasons: z.array(routingFallbackReasonSchema).max(4),
  })
  .strict()
  .superRefine((result, context) => {
    const usesFallback = result.fallback_reasons.length > 0;
    if (
      (usesFallback && result.decision_source !== 'DETERMINISTIC_FALLBACK') ||
      (!usesFallback && result.decision_source !== 'AI')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Routing decision source is inconsistent with fallback reasons',
      });
    }
    if (
      usesFallback &&
      (result.recommended_specialty !== DEFAULT_PILOT_SPECIALTY ||
        result.alternate_specialty !== null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Deterministic fallback must route only to General Medicine',
      });
    }
    if (
      result.fallback_reasons.includes('RED_FLAG') &&
      result.urgency !== 'EMERGENCY'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Red-flag routing must retain emergency urgency',
      });
    }
  });

export type RoutingFallbackReason = z.infer<typeof routingFallbackReasonSchema>;
export type FinalRoutingResult = z.infer<typeof finalRoutingResultSchema>;

export type SpecialtyRoutingServiceResult = Readonly<{
  modelName: string;
  modelVersion: string;
  promptVersion: string;
  routingSchemaVersion: string;
  routingPolicyVersion: string;
  modelOutput: RoutingOutput;
  routingResult: FinalRoutingResult;
}>;

export interface SpecialtyRoutingModel {
  generate(input: RoutingInput): Promise<unknown>;
}

export async function routeIntakeToSpecialty(
  model: SpecialtyRoutingModel,
  untrustedInput: unknown,
): Promise<SpecialtyRoutingServiceResult> {
  const input = routingInputSchema.parse(untrustedInput);
  const modelResult = routingModelResultSchema.parse(
    await model.generate(input),
  );
  const output = routingOutputSchema.parse(modelResult.output);

  if (input.redFlagDetected && output.urgency !== 'EMERGENCY') {
    throw new Error('Routing output cannot downgrade a deterministic red flag');
  }

  const fallbackReasons: RoutingFallbackReason[] = [];
  if (output.confidence < ROUTING_CONFIDENCE_THRESHOLD) {
    fallbackReasons.push('LOW_CONFIDENCE');
  }
  if (
    !input.structuredIntake.intake_complete ||
    output.missing_information.length > 0
  ) {
    fallbackReasons.push('INSUFFICIENT_DATA');
  }
  if (output.alternate_specialty !== null) {
    fallbackReasons.push('MULTI_SYSTEM');
  }
  if (input.redFlagDetected) fallbackReasons.push('RED_FLAG');

  const usesFallback = fallbackReasons.length > 0;
  const routingResult = finalRoutingResultSchema.parse({
    ...output,
    recommended_specialty: usesFallback
      ? DEFAULT_PILOT_SPECIALTY
      : output.recommended_specialty,
    alternate_specialty: usesFallback ? null : output.alternate_specialty,
    urgency: input.redFlagDetected ? 'EMERGENCY' : output.urgency,
    decision_source: usesFallback ? 'DETERMINISTIC_FALLBACK' : 'AI',
    fallback_reasons: fallbackReasons,
  });

  return {
    modelName: modelResult.modelName,
    modelVersion: modelResult.modelVersion,
    promptVersion: ROUTING_PROMPT_VERSION,
    routingSchemaVersion: ROUTING_SCHEMA_VERSION,
    routingPolicyVersion: ROUTING_POLICY_VERSION,
    modelOutput: output,
    routingResult,
  };
}
