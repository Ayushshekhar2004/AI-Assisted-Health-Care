import { loginAction } from '../actions';
import { AuthForm } from '../auth-form';

type LoginPageProps = Readonly<{
  searchParams: Promise<{ next?: string | string[] }>;
}>;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const next = (await searchParams).next;

  return (
    <main className="auth-card">
      <h1>Sign in</h1>
      <AuthForm
        action={loginAction}
        mode="login"
        nextPath={typeof next === 'string' ? next : undefined}
      />
    </main>
  );
}
