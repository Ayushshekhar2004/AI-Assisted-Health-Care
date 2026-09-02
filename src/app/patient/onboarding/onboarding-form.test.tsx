import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OnboardingForm } from './onboarding-form';

describe('patient onboarding form', () => {
  it('submits through the stable server route', () => {
    const { container } = render(<OnboardingForm />);
    const form = container.querySelector('form');

    expect(form).toHaveAttribute('action', '/api/patient/onboarding');
    expect(form).toHaveAttribute('method', 'post');
  });

  it('shows only the generic onboarding error', () => {
    render(<OnboardingForm error />);

    expect(
      screen.getByText(
        'Unable to save onboarding. Review the form and try again.',
      ),
    ).toBeInTheDocument();
  });
});
