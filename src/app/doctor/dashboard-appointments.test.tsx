import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DoctorDashboardPage } from '@/modules/scheduling/server';

import { DashboardAppointments } from './dashboard-appointments';

vi.mock('../_components/local-date-time', () => ({
  LocalDateTime: ({ startsAt }: { startsAt: string }) => (
    <time>{startsAt}</time>
  ),
}));

const dashboard: DoctorDashboardPage = {
  appointments: [
    {
      id: '71000000-0000-4000-8000-000000000001',
      patientDisplayName: 'Synthetic Patient Display',
      startsAt: '2026-09-01T10:00:00.000Z',
      endsAt: '2026-09-01T10:30:00.000Z',
      language: 'hi',
      status: 'CONFIRMED',
      intakeState: 'COMPLETED',
      urgency: 'URGENT',
    },
  ],
  page: 1,
  pageSize: 10,
  totalCount: 11,
  totalPages: 2,
  query: {
    page: 1,
    status: 'ALL',
    timezoneOffsetMinutes: -330,
    view: 'TODAY',
  },
};

describe('DashboardAppointments', () => {
  it('shows the minimum appointment list fields, urgency, and pagination', () => {
    render(<DashboardAppointments dashboard={dashboard} />);

    expect(screen.getByText('Synthetic Patient Display')).toBeInTheDocument();
    expect(screen.getByText('Hindi')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
    expect(screen.getByText('URGENT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      expect.stringContaining('page=2'),
    );
    expect(
      screen.queryByText(/city|date of birth|gender|contact/i),
    ).not.toBeInTheDocument();
  });
});
