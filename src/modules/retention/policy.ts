import { z } from 'zod';

export const DATA_RETENTION_POLICY_VERSION = 'retention-dev-v1';

const retentionRuleSchema = z
  .object({
    classification: z.enum([
      'OPERATIONAL_DATA',
      'CLINICAL_RECORD',
      'TRANSCRIPT',
      'RAW_AUDIO',
      'AUDIT_EVENT',
      'TEMPORARY_FILE',
    ]),
    action: z.enum([
      'ANONYMIZE_THEN_DELETE',
      'DELETE',
      'DISABLED',
      'PROTECT_PENDING_LEGAL_DECISION',
    ]),
    anonymizeAfterDays: z.number().int().positive().nullable(),
    deleteAfterDays: z.number().int().positive().nullable(),
    launchBlocker: z.boolean(),
  })
  .strict();

export const dataRetentionPolicySchema = z
  .object({
    version: z.literal(DATA_RETENTION_POLICY_VERSION),
    rules: z.array(retentionRuleSchema).length(6),
  })
  .strict();

export const dataRetentionPolicy = dataRetentionPolicySchema.parse({
  version: DATA_RETENTION_POLICY_VERSION,
  rules: [
    {
      classification: 'OPERATIONAL_DATA',
      action: 'ANONYMIZE_THEN_DELETE',
      anonymizeAfterDays: 30,
      deleteAfterDays: 365,
      launchBlocker: false,
    },
    {
      classification: 'CLINICAL_RECORD',
      action: 'PROTECT_PENDING_LEGAL_DECISION',
      anonymizeAfterDays: null,
      deleteAfterDays: null,
      launchBlocker: true,
    },
    {
      classification: 'TRANSCRIPT',
      action: 'PROTECT_PENDING_LEGAL_DECISION',
      anonymizeAfterDays: null,
      deleteAfterDays: null,
      launchBlocker: true,
    },
    {
      classification: 'RAW_AUDIO',
      action: 'DISABLED',
      anonymizeAfterDays: null,
      deleteAfterDays: null,
      launchBlocker: false,
    },
    {
      classification: 'AUDIT_EVENT',
      action: 'PROTECT_PENDING_LEGAL_DECISION',
      anonymizeAfterDays: null,
      deleteAfterDays: null,
      launchBlocker: true,
    },
    {
      classification: 'TEMPORARY_FILE',
      action: 'DELETE',
      anonymizeAfterDays: null,
      deleteAfterDays: 1,
      launchBlocker: false,
    },
  ],
});

export type DataRetentionPolicy = z.infer<typeof dataRetentionPolicySchema>;
