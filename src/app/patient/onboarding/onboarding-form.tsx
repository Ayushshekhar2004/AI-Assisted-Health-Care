import {
  INTAKE_PROCESSING_CONSENT_VERSION,
  TELECONSULTATION_CONSENT_VERSION,
} from '../../../modules/patient';

export function OnboardingForm({
  error = false,
}: Readonly<{ error?: boolean }>) {
  return (
    <form action="/api/patient/onboarding" className="auth-form" method="post">
      <label>
        Preferred language
        <select defaultValue="en" name="preferredLanguage" required>
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
        </select>
      </label>

      <label>
        Date of birth
        <input name="dateOfBirth" required type="date" />
      </label>

      <label>
        Gender (optional)
        <select defaultValue="" name="gender">
          <option value="">Not specified</option>
          <option value="woman">Woman</option>
          <option value="man">Man</option>
          <option value="non_binary">Non-binary</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </select>
      </label>

      <label>
        City
        <input
          autoComplete="address-level2"
          maxLength={120}
          name="city"
          required
        />
      </label>

      <fieldset>
        <legend>Emergency contact (optional)</legend>
        <p>Provide both fields or leave both blank.</p>
        <label>
          Contact name
          <input
            autoComplete="name"
            maxLength={120}
            name="emergencyContactName"
          />
        </label>
        <label>
          Contact phone
          <input
            autoComplete="tel"
            inputMode="tel"
            name="emergencyContactPhone"
            placeholder="+911234567890"
            type="tel"
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Consent</legend>
        <label>
          <input name="teleconsultationConsent" required type="checkbox" />I
          consent to teleconsultation under policy{' '}
          {TELECONSULTATION_CONSENT_VERSION}.
        </label>
        <label>
          <input name="intakeProcessingConsent" required type="checkbox" />I
          consent to processing my intake information under policy{' '}
          {INTAKE_PROCESSING_CONSENT_VERSION}.
        </label>
      </fieldset>

      <button type="submit">Complete onboarding</button>
      <p aria-live="polite" className="auth-message" role="status">
        {error
          ? 'Unable to save onboarding. Review the form and try again.'
          : ''}
      </p>
    </form>
  );
}
