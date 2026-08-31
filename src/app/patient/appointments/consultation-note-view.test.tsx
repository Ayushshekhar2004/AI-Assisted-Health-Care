import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConsultationNoteView } from './consultation-note-view';

describe('ConsultationNoteView', () => {
  it('labels the patient view as an assigned-doctor finalized note', () => {
    render(
      <ConsultationNoteView
        note={{
          id: '99000000-0000-4000-8000-000000000001',
          appointmentId: '89000000-0000-4000-8000-000000000001',
          subjectiveHistory: 'Synthetic finalized history.',
          examinationObservations: 'Remote examination limitations.',
          assessment: 'Synthetic finalized assessment.',
          plan: 'Synthetic finalized plan.',
          followUp: '',
          telemedicineAdequacy: 'REQUIRES_IN_PERSON',
          status: 'FINALIZED',
          finalizedAt: '2026-08-31T10:00:00.000Z',
          finalizedByDoctorId: '59000000-0000-4000-8000-000000000002',
          aiDraftGeneratedAt: null,
          aiModelName: null,
          aiModelVersion: null,
          aiPromptVersion: null,
          updatedAt: '2026-08-31T10:00:00.000Z',
        }}
      />,
    );
    expect(
      screen.getByText('View finalized consultation note'),
    ).toBeInTheDocument();
    expect(screen.getByText('Requires in-person care')).toBeInTheDocument();
    expect(
      screen.getByText(/finalized note from your assigned doctor/i),
    ).toBeInTheDocument();
  });
});
