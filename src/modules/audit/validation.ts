import { z } from 'zod';

export const applicationAuditActionSchema = z.enum([
  'login_role_resolution_failed',
  'admin_doctor_verification_queue_viewed',
]);

export const applicationAuditTargetTypeSchema = z.enum([
  'auth_user',
  'admin_area',
]);

export const applicationAuditEventSchema = z
  .object({
    action: applicationAuditActionSchema,
    targetType: applicationAuditTargetTypeSchema,
    targetId: z.string().uuid(),
    outcome: z.literal('success'),
  })
  .strict()
  .superRefine((value, context) => {
    const validPair =
      (value.action === 'login_role_resolution_failed' &&
        value.targetType === 'auth_user') ||
      (value.action === 'admin_doctor_verification_queue_viewed' &&
        value.targetType === 'admin_area');
    if (!validPair) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Audit action and target are incompatible',
      });
    }
  });

export type ApplicationAuditEvent = z.infer<typeof applicationAuditEventSchema>;

export const auditLookupCategorySchema = z.enum([
  'ALL',
  'AUTH',
  'CONSENT',
  'ADMIN',
  'RECORD_ACCESS',
  'DOCUMENT_ACCESS',
  'CLINICAL_FINALIZATION',
  'APPOINTMENT',
]);

export const auditLookupQuerySchema = z
  .object({
    category: auditLookupCategorySchema.default('ALL'),
    actorId: z.union([z.string().uuid(), z.literal('')]).default(''),
    targetId: z.union([z.string().uuid(), z.literal('')]).default(''),
    from: z.union([z.string().date(), z.literal('')]).default(''),
    to: z.union([z.string().date(), z.literal('')]).default(''),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from && value.to) {
      const from = new Date(`${value.from}T00:00:00.000Z`);
      const to = new Date(`${value.to}T23:59:59.999Z`);
      if (to < from || to.getTime() - from.getTime() > 31 * 86_400_000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Audit lookup range must be 31 days or less',
        });
      }
    }
  });

export const auditLookupEventSchema = z.object({
  id: z.string().uuid(),
  actorUserId: z.string().uuid(),
  action: z.string().trim().min(1).max(120),
  targetType: z.string().trim().min(1).max(80),
  targetId: z.string().uuid(),
  outcome: z.literal('success'),
  createdAt: z.string().datetime({ offset: true }),
});

export type AuditLookupQuery = z.infer<typeof auditLookupQuerySchema>;
export type AuditLookupEvent = z.infer<typeof auditLookupEventSchema>;
