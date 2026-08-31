import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DoctorAppointmentDetail } from '@/modules/consultation/server';

import { AppointmentDetail } from './appointment-detail';

vi.mock('../../../_components/local-date-time', () => ({
  LocalDateTime: ({ startsAt }: { startsAt: string }) => (
    <time>{startsAt}</time>
  ),
}));
vi.mock('./transcript-panel', () => ({
  TranscriptPanel: () => <button type="button">Expand transcript</button>,
}));
vi.mock('../../../_components/appointment-video-call', () => ({
  AppointmentVideoCall: () => (
    <button type="button">Join video consultation</button>
  ),
}));

const detail: DoctorAppointmentDetail = {
  id: '91000000-0000-4000-8000-000000000001',
  patient: {
    displayName: 'Synthetic Detail Patient',
    ageYears: 36,
    gender: 'prefer_not_to_say',
    city: 'Synthetic Detail City',
    language: 'hi',
  },
  startsAt: '2026-09-02T10:00:00.000Z',
  endsAt: '2026-09-02T10:30:00.000Z',
  status: 'CONFIRMED',
  intakeState: 'COMPLETED',
  structuredIntake: {
    chief_complaint: 'Synthetic patient-provided complaint.',
    onset: 'Synthetic onset.',
    duration: 'Two synthetic days.',
    severity: 'Moderate.',
    associated_symptoms: ['Synthetic associated information.'],
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
  },
  triage: {
    outcome: 'RED_FLAG',
    matchedRuleCodes: ['SEVERE_TRAUMA'],
    ruleSetVersion: 'red-flags-v1.0.0',
    evaluatedAt: '2026-09-01T09:00:00.000Z',
  },
  routing: {
    recommended_specialty: 'GENERAL_MEDICINE',
    alternate_specialty: null,
    urgency: 'EMERGENCY',
    rationale_for_doctor: 'Synthetic non-diagnostic routing rationale.',
    missing_information: [],
    decision_source: 'DETERMINISTIC_FALLBACK',
    fallback_reasons: ['RED_FLAG'],
  },
};

describe('AppointmentDetail', () => {
  it('shows scoped context and safety provenance without exposing confidence', () => {
    render(<AppointmentDetail detail={detail} />);

    expect(screen.getByText('Synthetic Detail Patient')).toBeInTheDocument();
    expect(screen.getByText('Hindi')).toBeInTheDocument();
    expect(
      screen.getAllByText(/unverified until reviewed by the doctor/i),
    ).toHaveLength(2);
    expect(
      screen.getByText(/not a diagnosis or prescription/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/red flag/i);
    expect(
      screen.getByText(/cannot rule out an emergency/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Synthetic non-diagnostic routing rationale.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('0.4')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand transcript' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Join video consultation' }),
    ).toBeInTheDocument();
  });
});
