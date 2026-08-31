import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ConsultationNote } from '@/modules/consultation';

vi.mock('./consultation-actions', () => ({
  saveConsultationDraftAction: vi.fn(),
  finalizeConsultationAction: vi.fn(),
  generateConsultationAIDraftAction: vi.fn(),
}));

import { ConsultationNoteForm } from './consultation-note-form';

const note: ConsultationNote = {
  id: '99000000-0000-4000-8000-000000000001',
  appointmentId: '89000000-0000-4000-8000-000000000001',
  subjectiveHistory: 'Synthetic history.',
  examinationObservations: 'Remote examination limitations.',
  assessment: 'Synthetic assessment.',
  plan: 'Synthetic plan.',
  followUp: 'Synthetic follow-up.',
  telemedicineAdequacy: 'ADEQUATE',
  status: 'DRAFT',
  finalizedAt: null,
  finalizedByDoctorId: null,
  aiDraftGeneratedAt: null,
  aiModelName: null,
  aiModelVersion: null,
  aiPromptVersion: null,
  updatedAt: '2026-08-31T10:00:00.000Z',
};

describe('ConsultationNoteForm', () => {
  it('shows the complete doctor workflow only during an in-progress appointment', () => {
    render(
      <ConsultationNoteForm
        appointmentId={note.appointmentId}
        appointmentStatus="IN_PROGRESS"
        note={note}
      />,
    );
    expect(screen.getByLabelText('Subjective history')).toHaveValue(
      'Synthetic history.',
    );
    expect(
      screen.getByLabelText('Examination limitations and observations'),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Finalize and close consultation' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Generate optional AI draft' }),
    ).toBeEnabled();
    expect(
      screen.getByLabelText(/I have reviewed the patient intake/i),
    ).not.toBeChecked();
    expect(screen.getByText(/AI output is unverified/i)).toHaveTextContent(
      /cannot finalize.*issue a diagnosis.*prescribe/i,
    );
    expect(
      screen.getByText(/finalization is irreversible/i),
    ).toBeInTheDocument();
  });

  it('renders finalized notes read-only without mutation actions', () => {
    render(
      <ConsultationNoteForm
        appointmentId={note.appointmentId}
        appointmentStatus="COMPLETED"
        note={{
          ...note,
          status: 'FINALIZED',
          finalizedAt: note.updatedAt,
          finalizedByDoctorId: '59000000-0000-4000-8000-000000000002',
        }}
      />,
    );
    expect(screen.getByLabelText('Assessment')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.getByText(/cannot be edited/i)).toBeInTheDocument();
  });
});
