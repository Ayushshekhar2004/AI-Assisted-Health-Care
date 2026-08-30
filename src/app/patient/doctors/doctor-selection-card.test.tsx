import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DoctorMatch } from '../../../modules/doctor';
import { DoctorSelectionCard } from './doctor-selection-card';

vi.mock('../appointments/booking-form', () => ({
  BookingForm: ({ availabilityId }: { availabilityId: string }) => (
    <button type="button">Book {availabilityId}</button>
  ),
}));

const doctor: DoctorMatch = {
  doctorId: '51000000-0000-4000-8000-000000000001',
  doctorName: 'Dr Synthetic Selection',
  qualification: 'Synthetic Medical Degree',
  registrationNumber: 'SYN-SELECT-1',
  specialty: 'GENERAL_MEDICINE',
  consultationLanguages: ['en', 'hi'],
  feePaise: 60000,
  clinicCity: null,
  consultationMode: 'TELECONSULTATION',
  routingDecisionSource: 'AI',
  nextSlots: [
    {
      id: '61000000-0000-4000-8000-000000000001',
      startsAt: '2026-09-02T10:00:00.000Z',
      endsAt: '2026-09-02T10:30:00.000Z',
    },
  ],
};

describe('DoctorSelectionCard', () => {
  it('shows verified display credentials, mode, slots, and a non-diagnostic explanation', () => {
    render(<DoctorSelectionCard doctor={doctor} />);

    expect(
      screen.getByRole('heading', { name: doctor.doctorName }),
    ).toBeInTheDocument();
    expect(screen.getByText(doctor.qualification)).toBeInTheDocument();
    expect(screen.getByText(doctor.registrationNumber)).toBeInTheDocument();
    expect(screen.getByText('General Medicine')).toBeInTheDocument();
    expect(screen.getByText('English, Hindi')).toBeInTheDocument();
    expect(screen.getByText('Teleconsultation')).toBeInTheDocument();
    expect(
      screen.getByText('Why this doctor was suggested'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/routing suggestion, not a diagnosis/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /book 61000000/i }),
    ).toBeInTheDocument();
  });
});
