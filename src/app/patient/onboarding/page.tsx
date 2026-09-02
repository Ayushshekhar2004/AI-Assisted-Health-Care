import { OnboardingForm } from './onboarding-form';

type PatientOnboardingPageProps = Readonly<{
  searchParams: Promise<{ error?: string }>;
}>;

export default async function PatientOnboardingPage({
  searchParams,
}: PatientOnboardingPageProps) {
  const params = await searchParams;
  return (
    <main className="auth-card">
      <h1>Patient onboarding</h1>
      <p>
        Your onboarding details are private and available only through
        authorized workflows.
      </p>
      <OnboardingForm error={params.error === '1'} />
    </main>
  );
}
