import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ bookFollowUpAction: vi.fn() }));

import { FollowUpBooking } from './follow-up-booking';

describe('FollowUpBooking', () => {
  it('submits only recommendation and availability IDs and warns context is not copied', () => {
    const { container } = render(
      <FollowUpBooking
        recommendation={{
          id: '71000000-0000-4000-8000-000000000001',
          sourceAppointmentId: '81000000-0000-4000-8000-000000000001',
          doctorName: 'Dr Synthetic Follow-up',
          timing: 'WITHIN_14_DAYS',
          createdAt: '2026-09-01T10:00:00.000Z',
          bookedAppointmentId: null,
        }}
        options={[
          {
            id: '61000000-0000-4000-8000-000000000001',
            startsAt: '2026-09-10T10:00:00.000Z',
            endsAt: '2026-09-10T10:30:00.000Z',
          },
        ]}
      />,
    );
    expect(
      screen.getByText(/prior prescription and intake will not be copied/i),
    ).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll('[name]')).map((node) =>
        node.getAttribute('name'),
      ),
    ).toEqual(['recommendationId', 'availabilityId']);
    expect(container.querySelector('[name="patientId"]')).toBeNull();
    expect(container.querySelector('[name="doctorId"]')).toBeNull();
  });
});
