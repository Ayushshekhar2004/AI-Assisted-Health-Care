import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { StoredDoctorHandoff } from '@/modules/consultation/server';

import { HandoffPanel, HandoffSummary } from './handoff-panel';

vi.mock('./handoff-actions', () => ({
  generateDoctorHandoffAction: vi.fn(),
  markHandoffItemInaccurateAction: vi.fn(),
}));

const handoff: StoredDoctorHandoff = {
  summaryVersion: 'doctor-handoff-v2',
  generatedAt: '2026-08-31T08:00:00.000Z',
  summary: {
    chief_complaint: 'Synthetic concern.',
    timeline: { onset: 'Synthetic onset.', duration: 'One synthetic day.' },
    positives: ['Synthetic positive.'],
    important_negatives: [
      {
        question_id: 'severe_trauma',
        statement: 'Synthetic explicit negative?',
      },
    ],
    relevant_history: ['Synthetic history.'],
    medications: ['Synthetic medicine.'],
    allergies: ['Synthetic allergy.'],
    red_flag_status: {
      outcome: 'RED_FLAG',
      matched_rule_codes: ['SEVERE_TRAUMA'],
      rule_set_version: 'red-flags-v1.0.0',
    },
    routing_reason: 'Synthetic non-diagnostic routing reason.',
    unanswered_questions: ['Synthetic unanswered question.'],
    patient_quotes: [],
    source_trace: [
      {
        item_key: 'chief_complaint',
        source_kind: 'STRUCTURED_INTAKE',
        source_field: 'chief_complaint',
        recorded_answer: null,
      },
      {
        item_key: 'important_negatives.0',
        source_kind: 'EXPLICIT_SCREENING_ANSWER',
        source_field: 'emergency_screening.severe_trauma',
        recorded_answer: 'no',
      },
      {
        item_key: 'red_flag_status',
        source_kind: 'DETERMINISTIC_TRIAGE',
        source_field: 'triage_results.outcome',
        recorded_answer: null,
      },
    ],
  },
};

describe('doctor handoff panel', () => {
  it('offers generation without exposing source transcript content', () => {
    render(
      <HandoffPanel
        appointmentId="91000000-0000-4000-8000-000000000001"
        initialHandoff={null}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Generate handoff' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Transcript content is not used/i),
    ).toBeInTheDocument();
  });

  it('renders every handoff section and preserves emergency caution', () => {
    render(
      <HandoffSummary
        appointmentId="91000000-0000-4000-8000-000000000001"
        handoff={handoff}
      />,
    );
    expect(screen.getByText('Chief complaint')).toBeInTheDocument();
    expect(
      screen.getByText('Important negatives explicitly asked'),
    ).toBeInTheDocument();
    expect(screen.getByText('Patient quotes')).toBeInTheDocument();
    expect(screen.getByText(/unverified until reviewed/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'cannot rule out an emergency',
    );
    expect(screen.queryByText(/diagnosis:/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('View source').length).toBeGreaterThan(0);
    expect(screen.getByText('Structured intake field')).toBeInTheDocument();
    expect(screen.getByText('Recorded answer: no')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Mark inaccurate' }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/never rewrites the original summary/i),
    ).toBeInTheDocument();
  });
});
