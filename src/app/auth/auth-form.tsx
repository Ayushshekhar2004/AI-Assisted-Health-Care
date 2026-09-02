import Link from 'next/link';

type AuthFormProps = Readonly<{
  error?: boolean;
  mode: 'login' | 'sign-up';
  nextPath?: string | undefined;
}>;

export function AuthForm({ error = false, mode, nextPath }: AuthFormProps) {
  const isLogin = mode === 'login';

  return (
    <form
      action={isLogin ? '/api/auth/login' : '/api/auth/sign-up'}
      className="auth-form"
      method="post"
    >
      <label>
        Email
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label>
        Password
        <input
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          minLength={12}
          name="password"
          required
          type="password"
        />
      </label>
      {nextPath ? <input name="next" type="hidden" value={nextPath} /> : null}
      <button type="submit">
        {isLogin ? 'Sign in' : 'Create patient account'}
      </button>
      <p aria-live="polite" className="auth-message" role="status">
        {error
          ? 'Unable to complete the request. Check your details and try again.'
          : ''}
      </p>
      <p>
        {isLogin ? 'Need an account? ' : 'Already registered? '}
        <Link href={isLogin ? '/auth/sign-up' : '/auth/login'}>
          {isLogin ? 'Sign up' : 'Sign in'}
        </Link>
      </p>
    </form>
  );
}
