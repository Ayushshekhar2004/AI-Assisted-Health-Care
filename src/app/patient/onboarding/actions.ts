'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import {
  parsePatientOnboarding,
  type PatientOnboardingInput,
} from '@/modules/patient';

export type OnboardingActionState = Readonly<{
  message: string;
  status: 'idle' | 'error';
}>;

const genericOnboardingError =
  'Unable to save onboarding. Review the form and try again.';

export async function completeOnboardingAction(
  _state: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  let onboarding: PatientOnboardingInput;
  try {
    onboarding = parsePatientOnboarding({
      preferredLanguage: formData.get('preferredLanguage'),
      dateOfBirth: formData.get('dateOfBirth'),
      gender: formData.get('gender'),
      city: formData.get('city'),
      emergencyContactName: formData.get('emergencyContactName'),
      emergencyContactPhone: formData.get('emergencyContactPhone'),
      teleconsultationConsent: formData.get('teleconsultationConsent'),
      intakeProcessingConsent: formData.get('intakeProcessingConsent'),
    });
  } catch {
    return { message: genericOnboardingError, status: 'error' };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('complete_patient_onboarding', {
      p_city: onboarding.city,
      p_date_of_birth: onboarding.dateOfBirth,
      p_emergency_contact_name: onboarding.emergencyContactName ?? null,
      p_emergency_contact_phone: onboarding.emergencyContactPhone ?? null,
      p_gender: onboarding.gender ?? null,
      p_intake_processing_consent: true,
      p_preferred_language: onboarding.preferredLanguage,
      p_teleconsultation_consent: true,
    });

    if (error) {
      return { message: genericOnboardingError, status: 'error' };
    }
  } catch {
    return { message: genericOnboardingError, status: 'error' };
  }

  redirect('/patient');
}
