'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { AuthActionState } from './actions';

type AuthFormProps = Readonly<{
  action: (
    state: AuthActionState,
    formData: FormData,
  ) => Promise<AuthActionState>;
  mode: 'login' | 'sign-up';
  nextPath?: string | undefined;
}>;

const initialState: AuthActionState = { message: '', status: 'idle' };

export function AuthForm({ action, mode, nextPath }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const isLogin = mode === 'login';

  return (
    <form action={formAction} className="auth-form">
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
      <button disabled={pending} type="submit">
        {pending
          ? 'Please wait…'
          : isLogin
            ? 'Sign in'
            : 'Create patient account'}
      </button>
      <p aria-live="polite" className="auth-message" role="status">
        {state.message}
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
