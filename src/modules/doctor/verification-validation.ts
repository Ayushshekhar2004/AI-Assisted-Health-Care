import { z } from 'zod';

export const verificationDecisionSchema = z.object({
  doctorId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(5).max(500),
});

export type VerificationDecision = z.infer<typeof verificationDecisionSchema>;

export const doctorVerificationStateSchema = z.object({
  status: z.enum(['pending_verification', 'verified', 'suspended', 'rejected']),
  reason: z.string().nullable(),
  decidedAt: z.string().nullable(),
  isBookable: z.boolean(),
  onboardingCompletedAt: z.string().nullable(),
});

export type DoctorVerificationState = z.infer<typeof doctorVerificationStateSchema>;
