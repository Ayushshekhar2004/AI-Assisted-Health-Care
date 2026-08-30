import { DoctorOnboardingForm } from './onboarding-form';

export default function DoctorOnboardingPage() {
  return (
    <main className="auth-card">
      <h1>Doctor onboarding</h1>
      <p>Professional details remain private until an authorized workflow approves publication.</p>
      <DoctorOnboardingForm />
    </main>
  );
}
