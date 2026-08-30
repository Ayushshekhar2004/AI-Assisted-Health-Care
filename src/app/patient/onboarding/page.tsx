import { OnboardingForm } from './onboarding-form';

export default function PatientOnboardingPage() {
  return (
    <main className="auth-card">
      <h1>Patient onboarding</h1>
      <p>
        Your onboarding details are private and available only through
        authorized workflows.
      </p>
      <OnboardingForm />
    </main>
  );
}
