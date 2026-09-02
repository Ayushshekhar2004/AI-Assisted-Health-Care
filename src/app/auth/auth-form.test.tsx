import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthForm } from './auth-form';

describe('AuthForm', () => {
  it('submits login through the stable same-origin route boundary', () => {
    render(<AuthForm mode="login" nextPath="/patient/history" />);

    const form = screen
      .getByRole('button', { name: 'Sign in' })
      .closest('form');
    expect(form).toHaveAttribute('action', '/api/auth/login');
    expect(form).toHaveAttribute('method', 'post');
    expect(screen.getByDisplayValue('/patient/history')).toHaveAttribute(
      'name',
      'next',
    );
  });

  it('submits signup through the stable route and renders a generic error', () => {
    render(<AuthForm error mode="sign-up" />);

    const form = screen
      .getByRole('button', { name: 'Create patient account' })
      .closest('form');
    expect(form).toHaveAttribute('action', '/api/auth/sign-up');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Unable to complete the request',
    );
  });
});
