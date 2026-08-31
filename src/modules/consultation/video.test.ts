import { describe, expect, it } from 'vitest';

import {
  appointmentConsultationStartRequestSchema,
  appointmentConsultationStartResponseSchema,
  appointmentVideoTokenRequestSchema,
  appointmentVideoTokenResponseSchema,
  getAppointmentRoomName,
  isTrustedVideoTokenRequest,
} from './video';

const appointmentId = '91000000-0000-4000-8000-000000000001';

describe('appointment video boundaries', () => {
  it('derives a stable room and rejects client-selected permissions', () => {
    expect(getAppointmentRoomName(appointmentId)).toBe(
      `appointment-${appointmentId}`,
    );
    expect(() =>
      appointmentVideoTokenRequestSchema.parse({
        appointmentId,
        room: 'client-selected-room',
        canPublish: false,
      }),
    ).toThrow();
  });

  it('accepts only same-origin JSON requests', () => {
    expect(
      isTrustedVideoTokenRequest(
        'https://synthetic-app.invalid',
        'https://synthetic-app.invalid',
        'application/json; charset=utf-8',
      ),
    ).toBe(true);
    expect(
      isTrustedVideoTokenRequest(
        'https://cross-site.invalid',
        'https://synthetic-app.invalid',
        'application/json',
      ),
    ).toBe(false);
    expect(
      isTrustedVideoTokenRequest(
        'https://synthetic-app.invalid',
        'https://synthetic-app.invalid',
        'text/plain',
      ),
    ).toBe(false);
  });

  it('requires a secure server URL in the browser response', () => {
    expect(() =>
      appointmentVideoTokenResponseSchema.parse({
        serverUrl: 'ws://video.invalid',
        token: 'synthetic-short-lived-token-value',
        expiresAt: '2026-08-31T10:05:00.000Z',
      }),
    ).toThrow();
  });

  it('does not accept client-selected consultation status or role', () => {
    expect(() =>
      appointmentConsultationStartRequestSchema.parse({
        appointmentId,
        status: 'IN_PROGRESS',
      }),
    ).toThrow();
    expect(
      appointmentConsultationStartResponseSchema.parse({
        status: 'IN_PROGRESS',
      }),
    ).toEqual({ status: 'IN_PROGRESS' });
  });
});
