'use server';

import { revalidatePath } from 'next/cache';

import { transitionDoctorVerification } from '@/modules/doctor/server';
import { verificationDecisionSchema } from '@/modules/doctor';

export type VerificationActionState = Readonly<{
  message: string;
  status: 'idle' | 'error' | 'success';
}>;

const genericVerificationError =
  'Unable to update verification. Review the request and try again.';

export async function verifyDoctorAction(
  _state: VerificationActionState,
  formData: FormData,
): Promise<VerificationActionState> {
  const decision = verificationDecisionSchema.safeParse({
    doctorId: formData.get('doctorId'),
    decision: formData.get('decision'),
    reason: formData.get('reason'),
  });

  if (!decision.success) {
    return { message: genericVerificationError, status: 'error' };
  }

  try {
    await transitionDoctorVerification(decision.data);
  } catch {
    return { message: genericVerificationError, status: 'error' };
  }

  revalidatePath('/admin/doctors');
  return { message: 'Verification updated.', status: 'success' };
}
