import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmergencyGuidance } from './emergency-guidance';
import { IntakeHandoffSummary } from './intake-handoff-summary';

describe('emergency pathway', () => {
  it('prominently directs urgent in-person care without reassurance', () => {
    render(<EmergencyGuidance />);

    expect(screen.getByRole('alert')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: /seek urgent in-person help now/i }),
    ).toBeVisible();
    expect(screen.getByText(/cannot rule out an emergency/i)).toBeVisible();
    expect(screen.getByText(/local emergency services now/i)).toBeVisible();
    expect(screen.getByText(/do not wait for an AI response/i)).toBeVisible();
    expect(screen.queryByText(/you are safe/i)).not.toBeInTheDocument();
  });

  it('preserves and labels the patient-provided structured summary for handoff', () => {
    render(
      <IntakeHandoffSummary
        summary={{
          chief_complaint: 'Synthetic handoff concern',
          onset: 'Synthetic onset',
          duration: 'Synthetic duration',
          severity: 'Synthetic severity',
          associated_symptoms: ['Synthetic associated detail'],
          relevant_history: [],
          current_medicines: [],
          allergies: [],
          pregnancy_possibility: {
            clinically_relevant: false,
            response: 'not_clinically_relevant',
          },
          missing_information: [],
          follow_up_question: null,
          intake_complete: true,
        }}
      />,
    );

    expect(screen.getByText('Synthetic handoff concern')).toBeVisible();
    expect(screen.getByText(/patient-provided information/i)).toBeVisible();
    expect(
      screen.getByText(/unreviewed, may be incomplete or incorrect/i),
    ).toBeVisible();
    expect(screen.getByText(/not a diagnosis or prescription/i)).toBeVisible();
    expect(screen.getByText(/do not delay seeking help/i)).toBeVisible();
  });
});
