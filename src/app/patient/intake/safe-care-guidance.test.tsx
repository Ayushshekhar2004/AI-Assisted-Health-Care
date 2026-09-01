import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SafeCareWhileWaiting } from '@/modules/triage/server';

import { SafeCareGuidance } from './safe-care-guidance';

const guidance: SafeCareWhileWaiting = {
  symptom_category: 'MILD_HEADACHE',
  allowed_interim_actions: ['Synthetic temporary action.'],
  prohibited_actions: ['Synthetic prohibited action.'],
  red_flags: ['Synthetic urgent warning.'],
  escalation_message: 'Synthetic escalation message.',
  disclaimer: 'Temporary guidance, not a diagnosis or prescription.',
  language: 'en',
  disposition: 'GUIDANCE',
  library_version: 'safe-care-development-v1',
};

describe('SafeCareGuidance', () => {
  it('renders centralized guidance sections and disclaimer', () => {
    render(<SafeCareGuidance guidance={guidance} />);
    expect(
      screen.getByRole('heading', { name: /while you wait/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Synthetic temporary action.')).toBeInTheDocument();
    expect(
      screen.getByText(/not a diagnosis or prescription/i),
    ).toBeInTheDocument();
  });

  it('does not render normal actions when guidance is suppressed', () => {
    render(
      <SafeCareGuidance
        guidance={{
          ...guidance,
          allowed_interim_actions: [],
          disposition: 'HIGH_RISK',
        }}
      />,
    );
    expect(
      screen.queryByText(/temporary self-care steps/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Synthetic escalation message.'),
    ).toBeInTheDocument();
  });
});
