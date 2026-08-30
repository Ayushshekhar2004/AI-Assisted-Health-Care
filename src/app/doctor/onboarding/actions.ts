'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import {
  parseDoctorOnboarding,
  parseProfilePhotoMetadata,
  type DoctorOnboardingInput,
} from '@/modules/doctor';

export type DoctorOnboardingActionState = Readonly<{
  message: string;
  status: 'idle' | 'error';
}>;

const genericOnboardingError = 'Unable to save onboarding. Review the form and try again.';
const profilePhotoBucket = 'doctor-profile-photos';

const photoExtensions: Record<'image/jpeg' | 'image/png' | 'image/webp', string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function completeDoctorOnboardingAction(
  _state: DoctorOnboardingActionState,
  formData: FormData,
): Promise<DoctorOnboardingActionState> {
  let onboarding: DoctorOnboardingInput;
  try {
    onboarding = parseDoctorOnboarding({
      fullName: formData.get('fullName'),
      qualification: formData.get('qualification'),
      registrationNumber: formData.get('registrationNumber'),
      registrationCouncil: formData.get('registrationCouncil'),
      registrationState: formData.get('registrationState'),
      specialty: formData.get('specialty'),
      languages: formData.getAll('languages'),
      teleconsultationFeePaise: formData.get('teleconsultationFee'),
      clinicCity: formData.get('clinicCity'),
      clinicAddress: formData.get('clinicAddress'),
    });
  } catch {
    return { message: genericOnboardingError, status: 'error' };
  }

  const photo = formData.get('profilePhoto');
  let validatedPhoto: File | null = null;
  if (photo instanceof File && photo.size > 0) {
    try {
      parseProfilePhotoMetadata({ size: photo.size, type: photo.type });
      validatedPhoto = photo;
    } catch {
      return { message: genericOnboardingError, status: 'error' };
    }
  }

  let removeUploadedPhoto: (() => Promise<unknown>) | null = null;
  let profilePhotoPath: string | null = null;
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return { message: genericOnboardingError, status: 'error' };
    }

    if (validatedPhoto) {
      const metadata = parseProfilePhotoMetadata({
        size: validatedPhoto.size,
        type: validatedPhoto.type,
      });
      profilePhotoPath = `${authData.user.id}/${randomUUID()}.${photoExtensions[metadata.type]}`;
      const { error } = await supabase.storage
        .from(profilePhotoBucket)
        .upload(profilePhotoPath, validatedPhoto, {
          cacheControl: '3600',
          contentType: metadata.type,
          upsert: false,
        });

      if (error) {
        return { message: genericOnboardingError, status: 'error' };
      }

      const uploadedPath = profilePhotoPath;
      removeUploadedPhoto = async () =>
        supabase.storage.from(profilePhotoBucket).remove([uploadedPath]);
    }

    const { error } = await supabase.rpc('complete_doctor_onboarding', {
      p_clinic_address: onboarding.clinicAddress ?? null,
      p_clinic_city: onboarding.clinicCity ?? null,
      p_full_name: onboarding.fullName,
      p_languages: onboarding.languages,
      p_profile_photo_object_path: profilePhotoPath,
      p_qualification: onboarding.qualification,
      p_registration_council: onboarding.registrationCouncil,
      p_registration_number: onboarding.registrationNumber,
      p_registration_state: onboarding.registrationState,
      p_specialty: onboarding.specialty,
      p_teleconsultation_fee_paise: onboarding.teleconsultationFeePaise ?? null,
    });

    if (error) {
      if (removeUploadedPhoto) {
        await removeUploadedPhoto();
      }
      return { message: genericOnboardingError, status: 'error' };
    }
  } catch {
    if (removeUploadedPhoto) {
      try {
        await removeUploadedPhoto();
      } catch {
        // Never expose storage details or the private object path.
      }
    }
    return { message: genericOnboardingError, status: 'error' };
  }

  redirect('/doctor');
}
