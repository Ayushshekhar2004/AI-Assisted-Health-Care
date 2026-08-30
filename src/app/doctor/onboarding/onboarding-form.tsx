'use client';

import { useActionState } from 'react';

import {
  completeDoctorOnboardingAction,
  type DoctorOnboardingActionState,
} from './actions';

const initialState: DoctorOnboardingActionState = { message: '', status: 'idle' };

export function DoctorOnboardingForm() {
  const [state, formAction, pending] = useActionState(
    completeDoctorOnboardingAction,
    initialState,
  );

  return (
    <form action={formAction} className="auth-form">
      <label>
        Full name
        <input autoComplete="name" maxLength={120} name="fullName" required />
      </label>
      <label>
        Qualification
        <input maxLength={160} name="qualification" required />
      </label>
      <label>
        Registration number
        <input maxLength={80} name="registrationNumber" required />
      </label>
      <label>
        Registration council
        <input maxLength={120} name="registrationCouncil" required />
      </label>
      <label>
        Registration state
        <input maxLength={120} name="registrationState" required />
      </label>
      <label>
        Specialty
        <input maxLength={120} name="specialty" required />
      </label>

      <fieldset>
        <legend>Consultation languages</legend>
        <label>
          <input name="languages" type="checkbox" value="en" /> English
        </label>
        <label>
          <input name="languages" type="checkbox" value="hi" /> हिन्दी
        </label>
      </fieldset>

      <label>
        Teleconsultation fee in INR (placeholder, optional)
        <input inputMode="decimal" name="teleconsultationFee" placeholder="750.00" />
      </label>
      <label>
        Clinic city (optional)
        <input autoComplete="address-level2" maxLength={120} name="clinicCity" />
      </label>
      <label>
        Clinic address (optional)
        <textarea autoComplete="street-address" maxLength={500} name="clinicAddress" />
      </label>
      <label>
        Profile photo (optional, JPEG, PNG, or WebP; maximum 5 MB)
        <input accept="image/jpeg,image/png,image/webp" name="profilePhoto" type="file" />
      </label>

      <p>Your profile will remain pending verification and unavailable for booking.</p>
      <button disabled={pending} type="submit">
        {pending ? 'Saving…' : 'Submit for verification'}
      </button>
      <p aria-live="polite" className="auth-message" role="status">
        {state.message}
      </p>
    </form>
  );
}
