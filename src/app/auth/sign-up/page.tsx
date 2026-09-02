import { AuthForm } from '../auth-form';

type SignUpPageProps = Readonly<{
  searchParams: Promise<{ error?: string }>;
}>;

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  return (
    <main className="auth-card">
      <h1>Create a patient account</h1>
      <p>
        Development registration uses email. Use synthetic information in
        non-production systems.
      </p>
      <AuthForm error={params.error === '1'} mode="sign-up" />
    </main>
  );
}
