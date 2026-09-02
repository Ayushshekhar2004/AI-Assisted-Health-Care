import { z } from 'zod';

export const privacyRequestTypeSchema = z.enum([
  'DATA_EXPORT',
  'RECORD_CORRECTION',
  'ACCOUNT_DEACTIVATION_OR_DELETION',
  'GRIEVANCE',
]);
export const privacyRequestStatusSchema = z.enum([
  'QUEUED',
  'UNDER_REVIEW',
  'RESOLVED',
  'DECLINED',
]);
export const privacyResolutionCategorySchema = z.enum([
  'EXPORT_PROVIDED',
  'CORRECTION_WORKFLOW_STARTED',
  'ACCOUNT_DEACTIVATION_REVIEWED',
  'GRIEVANCE_RESPONDED',
  'REQUEST_NOT_ACTIONABLE',
]);

export const privacyRequestInputSchema = z
  .object({
    requestType: privacyRequestTypeSchema,
    details: z.string().trim().min(1).max(2000),
  })
  .strict();

export const patientPrivacyRequestSchema = z.object({
  id: z.string().uuid(),
  requestType: privacyRequestTypeSchema,
  status: privacyRequestStatusSchema,
  resolutionCategory: privacyResolutionCategorySchema.nullable(),
  protectedRecordsRetained: z.literal(true),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const privacyRequestTransitionSchema = z
  .object({
    requestId: z.string().uuid(),
    nextStatus: z.enum(['UNDER_REVIEW', 'RESOLVED', 'DECLINED']),
    resolutionCategory: z.union([
      privacyResolutionCategorySchema,
      z.literal(''),
    ]),
  })
  .strict();

export const privacyRequestTypeLabels = {
  DATA_EXPORT: 'Export my data',
  RECORD_CORRECTION: 'Request a record correction',
  ACCOUNT_DEACTIVATION_OR_DELETION:
    'Request account deactivation or deletion review',
  GRIEVANCE: 'Submit a privacy grievance',
} as const satisfies Record<z.infer<typeof privacyRequestTypeSchema>, string>;

export type PrivacyRequestInput = z.infer<typeof privacyRequestInputSchema>;
export type PatientPrivacyRequest = z.infer<typeof patientPrivacyRequestSchema>;
export type PrivacyRequestType = z.infer<typeof privacyRequestTypeSchema>;
