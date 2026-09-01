import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('./outcome-actions', () => ({ recordOutcomeAction: vi.fn() }));
import { OutcomeForm } from './outcome-form';
const appointmentId = '81000000-0000-4000-8000-000000000001';
describe('OutcomeForm', () => {
  it('waits for doctor note finalization', () => {
    render(
      <OutcomeForm
        appointmentId={appointmentId}
        noteFinalized={false}
        outcome={null}
      />,
    );
    expect(screen.getByText(/Finalize.*before recording/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /record consultation/i }),
    ).toBeNull();
  });
  it('reveals required physical visit handoff fields', () => {
    render(
      <OutcomeForm
        appointmentId={appointmentId}
        noteFinalized
        outcome={null}
      />,
    );
    fireEvent.change(screen.getByLabelText('Outcome'), {
      target: { value: 'PHYSICAL_EXAM_REQUIRED' },
    });
    expect(screen.getByLabelText('Clinic/location')).toBeRequired();
    expect(screen.getByLabelText('Location instructions')).toBeRequired();
    expect(screen.getByLabelText('Appointment note')).toBeRequired();
  });
});
