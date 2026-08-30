import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IntakeSafetyBanner } from './intake-safety-banner';

describe('IntakeSafetyBanner', () => {
  it('states the assistant limits and directs emergencies away from chat', () => {
    render(<IntakeSafetyBanner />);

    expect(
      screen.getByRole('heading', { name: /not emergency care/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not provide a diagnosis or prescription/i),
    ).toBeVisible();
    expect(screen.getByText(/contact local emergency services/i)).toBeVisible();
    expect(screen.getByText(/do not wait for a response here/i)).toBeVisible();
  });
});
