import { describe, expect, it, vi } from 'vitest';

import { DevelopmentNotificationProvider } from './development-provider';

describe('DevelopmentNotificationProvider', () => {
  it('acknowledges delivery without logging content or recipient data', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const provider = new DevelopmentNotificationProvider();

    await expect(
      provider.send({
        eventId: '75000000-0000-4000-8000-000000000001',
        idempotencyKey: '75000000-0000-4000-8000-000000000001',
        recipientProfileId: '25000000-0000-4000-8000-000000000001',
        type: 'APPOINTMENT_CONFIRMED',
        content: {
          subject: 'Appointment confirmed',
          preview: 'Open the app for scheduling details.',
        },
      }),
    ).resolves.toEqual({
      providerMessageId: 'development-75000000-0000-4000-8000-000000000001',
    });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
