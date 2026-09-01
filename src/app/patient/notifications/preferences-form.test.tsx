import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NotificationPreferencesForm } from './preferences-form';

vi.mock('./actions', () => ({
  updateNotificationPreferencesAction: vi.fn(),
}));
vi.mock('react', async () => ({
  ...(await vi.importActual('react')),
  useActionState: () => [{ message: '', status: 'idle' }, vi.fn(), false],
}));

describe('NotificationPreferencesForm', () => {
  it('allows reminder opt-out while explaining essential notifications', () => {
    render(<NotificationPreferencesForm appointmentRemindersEnabled={false} />);

    expect(
      screen.getByLabelText(/send appointment reminders/i),
    ).not.toBeChecked();
    expect(
      screen.getByText(/confirmations.*essential logistics/i),
    ).toBeInTheDocument();
  });
});
