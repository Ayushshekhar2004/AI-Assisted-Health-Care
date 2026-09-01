import { describe, expect, it } from 'vitest';

import {
  getAppointmentNotificationContent,
  isEssentialNotification,
  notificationContentSchema,
  notificationEventTypeSchema,
} from './notification';

describe('appointment notification content', () => {
  it.each(notificationEventTypeSchema.options)(
    'uses minimal fixed content for %s',
    (type) => {
      const content = getAppointmentNotificationContent(type);
      expect(() => notificationContentSchema.parse(content)).not.toThrow();
      expect(`${content.subject} ${content.preview}`).not.toMatch(
        /symptom|diagnos|prescri|medicine|allerg|intake|patient name/i,
      );
    },
  );

  it('does not include participant names or appointment identifiers', () => {
    const serialized = JSON.stringify(
      notificationEventTypeSchema.options.map((type) =>
        getAppointmentNotificationContent(type),
      ),
    );
    expect(serialized).not.toMatch(/Synthetic|[0-9a-f]{8}-[0-9a-f-]{27}/i);
  });

  it('treats only appointment reminders as non-essential', () => {
    expect(isEssentialNotification('APPOINTMENT_REMINDER')).toBe(false);
    expect(isEssentialNotification('APPOINTMENT_CONFIRMED')).toBe(true);
    expect(isEssentialNotification('APPOINTMENT_CANCELLED')).toBe(true);
    expect(isEssentialNotification('DOCTOR_READY')).toBe(true);
  });
});
