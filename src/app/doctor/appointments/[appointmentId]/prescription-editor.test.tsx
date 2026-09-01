import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Prescription } from '@/modules/prescription';

vi.mock('./prescription-actions', () => ({
  savePrescriptionDraftAction: vi.fn(),
  finalizePrescriptionAction: vi.fn(),
}));
import { PrescriptionEditor } from './prescription-editor';

const finalPrescription: Prescription = {
  id: '91000000-0000-4000-8000-000000000001',
  appointmentId: '81000000-0000-4000-8000-000000000001',
  patientId: '31000000-0000-4000-8000-000000000001',
  doctorId: '51000000-0000-4000-8000-000000000001',
  doctorName: 'Synthetic Doctor',
  registrationNumber: 'SYN-001',
  registrationCouncil: 'Synthetic Council',
  registrationState: 'Synthetic State',
  prescriptionDate: '2026-09-01',
  followUp: 'Synthetic follow-up.',
  status: 'FINAL',
  finalizedAt: '2026-09-01T10:00:00.000Z',
  items: [
    {
      id: '71000000-0000-4000-8000-000000000001',
      itemType: 'MEDICINE',
      itemName: 'Synthetic medicine',
      dosage: 'Synthetic dose',
      frequency: '',
      duration: '',
      instructions: '',
      sortOrder: 0,
    },
  ],
};

describe('PrescriptionEditor', () => {
  it('requires explicit doctor entry and review before finalization', () => {
    render(
      <PrescriptionEditor
        appointmentId={finalPrescription.appointmentId}
        prescription={null}
      />,
    );
    expect(
      screen.getByText(/AI cannot finalize or submit/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review and finalize prescription' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    expect(screen.getByLabelText('Name or instruction')).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Review and finalize prescription' }),
    ).toBeEnabled();
  });

  it('shows doctor registration and makes final prescriptions immutable', () => {
    render(
      <PrescriptionEditor
        appointmentId={finalPrescription.appointmentId}
        prescription={finalPrescription}
      />,
    );
    expect(
      screen.getByText(/SYN-001.*Synthetic Council.*Synthetic State/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name or instruction')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /finalize prescription/i }),
    ).toBeNull();
    expect(screen.getByText(/final and cannot be edited/i)).toBeInTheDocument();
  });
});
