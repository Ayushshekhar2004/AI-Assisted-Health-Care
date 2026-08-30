import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({
  bookAvailabilityAction: vi.fn(),
}));

import { BookingForm } from './booking-form';

describe('BookingForm', () => {
  it('submits only the opaque availability identifier', () => {
    const { container } = render(
      <BookingForm availabilityId="61000000-0000-4000-8000-000000000001" />,
    );

    expect(
      screen.getByRole('button', { name: 'Request appointment' }),
    ).toBeEnabled();
    expect(
      Array.from(
        container.querySelectorAll<HTMLInputElement>('input[name]'),
      ).map((input) => input.name),
    ).toEqual(['availabilityId']);
    expect(
      container.querySelector('[name="doctorId"]'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[name="patientId"]'),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[name="price"]')).not.toBeInTheDocument();
  });
});
