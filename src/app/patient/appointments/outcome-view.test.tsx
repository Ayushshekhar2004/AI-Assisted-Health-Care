import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutcomeView } from './outcome-view';
describe('OutcomeView', () => {
  it('shows patient-readable physical visit details', () => {
    render(
      <OutcomeView
        outcome={{
          id: '91000000-0000-4000-8000-000000000001',
          appointmentId: '81000000-0000-4000-8000-000000000001',
          outcome: 'PHYSICAL_EXAM_REQUIRED',
          referralSpecialty: null,
          clinicLocation: 'Synthetic Clinic',
          locationInstructions: 'Synthetic directions',
          appointmentNote: 'Synthetic appointment note',
          recordedAt: '2026-09-01T10:00:00.000Z',
        }}
      />,
    );
    expect(screen.getByText(/Synthetic Clinic/)).toBeInTheDocument();
    expect(screen.getByText(/Synthetic directions/)).toBeInTheDocument();
  });
});
