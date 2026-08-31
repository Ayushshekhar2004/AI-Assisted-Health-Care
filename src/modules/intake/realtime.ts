import { z } from 'zod';

export const intakeVoiceLanguageSchema = z.enum(['en', 'hi']);

export const realtimeSessionRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    language: intakeVoiceLanguageSchema,
  })
  .strict();

export const realtimeClientSecretResponseSchema = z
  .object({
    value: z.string().min(10),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export const realtimeTranscriptionCompletedEventSchema = z
  .object({
    type: z.literal('conversation.item.input_audio_transcription.completed'),
    item_id: z.string().min(1).max(200),
    transcript: z.string().trim().min(1).max(4000),
    logprobs: z
      .array(
        z
          .object({
            token: z.string(),
            logprob: z.number().finite(),
          })
          .passthrough(),
      )
      .max(4000)
      .nullable()
      .optional(),
  })
  .passthrough();

export const medicallyImportantTranscriptEntitySchema = z.enum([
  'medicine',
  'allergy',
  'duration',
  'dosage',
  'age',
  'pregnancy',
]);

export type MedicallyImportantTranscriptEntity = z.infer<
  typeof medicallyImportantTranscriptEntitySchema
>;

export type TranscriptConfirmationAssessment = Readonly<{
  entities: readonly MedicallyImportantTranscriptEntity[];
  recognitionUncertain: boolean;
}>;

const UNCERTAIN_TOKEN_LOGPROB_THRESHOLD = -1;

const IMPORTANT_ENTITY_PATTERNS: ReadonlyArray<
  readonly [MedicallyImportantTranscriptEntity, RegExp]
> = [
  [
    'medicine',
    /\b(?:medicine|medication|medicines|medications|tablet|tablets|capsule|capsules|pill|pills|drug|drugs)\b|(?:दवा|दवाई|गोली)/iu,
  ],
  ['allergy', /\b(?:allergy|allergies|allergic)\b|(?:एलर्जी)/iu],
  [
    'duration',
    /\b(?:for|since)\s+(?:about\s+)?(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\b|(?:(?:से|लगभग)\s*)?(?:\d+(?:\.\d+)?|एक|दो|तीन|चार|पांच|छह|सात|आठ|नौ|दस)\s*(?:मिनट|घंटे?|दिन|हफ्ते?|सप्ताह|महीने?|साल)\s*(?:से)?/iu,
  ],
  [
    'dosage',
    /\b\d+(?:\.\d+)?\s*(?:mcg|µg|mg|g|ml|milligram|milligrams|tablet|tablets|capsule|capsules|drop|drops|unit|units)\b|\b(?:once|twice|three times)\s+(?:a|per)\s+day\b|(?:दिन में)\s*(?:एक|दो|तीन|चार|\d+)\s*(?:बार)/iu,
  ],
  [
    'age',
    /\b(?:age|aged)\s*(?:is|:)?\s*\d{1,3}\b|\b\d{1,3}\s*(?:years? old|year-old)\b|(?:उम्र)\s*(?:है|:)?\s*\d{1,3}|\d{1,3}\s*(?:साल की|साल का|वर्ष की|वर्ष का)/iu,
  ],
  [
    'pregnancy',
    /\b(?:pregnant|pregnancy|conceive|conceiving)\b|(?:गर्भवती|गर्भावस्था|प्रेग्नेंट)/iu,
  ],
];

export function assessVoiceTranscript(
  transcript: string,
  logprobs: ReadonlyArray<Readonly<{ logprob: number }>> | null | undefined,
): TranscriptConfirmationAssessment {
  const entities = IMPORTANT_ENTITY_PATTERNS.filter(([, pattern]) =>
    pattern.test(transcript),
  ).map(([entity]) => entity);
  const recognitionUncertain =
    !logprobs?.length ||
    logprobs.some(
      ({ logprob }) =>
        !Number.isFinite(logprob) ||
        logprob < UNCERTAIN_TOKEN_LOGPROB_THRESHOLD,
    );

  return { entities, recognitionUncertain };
}

export type IntakeVoiceLanguage = z.infer<typeof intakeVoiceLanguageSchema>;
export type RealtimeSessionRequest = z.infer<
  typeof realtimeSessionRequestSchema
>;

export function parseRealtimeSessionRequest(
  input: unknown,
): RealtimeSessionRequest {
  return realtimeSessionRequestSchema.parse(input);
}

export function buildRealtimeTranscriptionSession(
  language: IntakeVoiceLanguage,
  model: string,
) {
  return {
    type: 'transcription' as const,
    include: ['item.input_audio_transcription.logprobs' as const],
    audio: {
      input: {
        noise_reduction: { type: 'near_field' as const },
        transcription: {
          model,
          languages: [language],
          delay: 'low' as const,
        },
        turn_detection: {
          type: 'server_vad' as const,
          create_response: false,
          interrupt_response: false,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
        },
      },
    },
  };
}

export function isTrustedRealtimeSessionRequest(
  origin: string | null,
  expectedOrigin: string,
  contentType: string | null,
): boolean {
  return (
    origin === expectedOrigin &&
    contentType !== null &&
    contentType.toLowerCase().startsWith('application/json')
  );
}
