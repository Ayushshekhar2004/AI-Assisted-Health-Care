import { AuthForm } from '../auth-form';

type LoginPageProps = Readonly<{
  searchParams: Promise<{ error?: string; next?: string | string[] }>;
}>;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = params.next;

  return (
    <main className="auth-card">
      <h1>Sign in</h1>
      <AuthForm
        error={params.error === '1'}
        mode="login"
        nextPath={typeof next === 'string' ? next : undefined}
      />
    </main>
  );
}
