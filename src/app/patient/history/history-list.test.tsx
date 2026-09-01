import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PatientHistoryPage } from '@/modules/patient/history-server';

import { PatientHistoryList } from './history-list';

const history: PatientHistoryPage = {
  items: [
    {
      appointmentId: '81000000-0000-4000-8000-000000000001',
      startsAt: '2026-08-01T09:00:00.000Z',
      endsAt: '2026-08-01T09:30:00.000Z',
      status: 'COMPLETED',
      doctorName: 'Dr Synthetic History',
      doctorSpecialty: 'GENERAL_MEDICINE',
      outcome: {
        outcome: 'FOLLOW_UP_REQUIRED',
        referral_specialty: null,
        clinic_location: null,
        location_instructions: null,
        appointment_note: null,
        recorded_at: '2026-08-01T10:00:00.000Z',
      },
      prescription: {
        id: '91000000-0000-4000-8000-000000000001',
        prescription_date: '2026-08-01',
        follow_up: 'Synthetic follow-up instruction',
        finalized_at: '2026-08-01T10:00:00.000Z',
        items: [
          {
            id: '92000000-0000-4000-8000-000000000001',
            item_type: 'INSTRUCTION',
            item_name: 'Synthetic instruction',
            dosage: '',
            frequency: '',
            duration: '',
            instructions: 'Synthetic clinician-reviewed detail',
            sort_order: 0,
          },
        ],
      },
      documents: [
        {
          id: '93000000-0000-4000-8000-000000000001',
          filename: 'synthetic-report.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1024,
          scan_status: 'CLEAN',
          created_at: '2026-08-01T08:00:00.000Z',
        },
        {
          id: '93000000-0000-4000-8000-000000000002',
          filename: 'synthetic-pending.png',
          mime_type: 'image/png',
          size_bytes: 2048,
          scan_status: 'PENDING_SCAN',
          created_at: '2026-08-01T08:01:00.000Z',
        },
      ],
    },
  ],
  page: 2,
  pageSize: 10,
  totalCount: 21,
  totalPages: 3,
};

describe('PatientHistoryList', () => {
  it('shows history content, pagination, and only clean document downloads', () => {
    render(<PatientHistoryList history={history} />);

    expect(screen.getByText('Dr Synthetic History')).toBeInTheDocument();
    expect(screen.getByText(/follow-up required/i)).toBeInTheDocument();
    expect(screen.getByText('Synthetic instruction')).toBeInTheDocument();
    expect(screen.getByText(/synthetic-report\.pdf/i)).toBeInTheDocument();
    expect(screen.getByText(/synthetic-pending\.png/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Download' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/patient/history?page=1',
    );
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/patient/history?page=3',
    );
  });
});
