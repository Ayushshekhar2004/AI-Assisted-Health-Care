// @vitest-environment node

import { TokenVerifier } from 'livekit-server-sdk';
import { describe, expect, it } from 'vitest';

import {
  createScopedAppointmentToken,
  VIDEO_TOKEN_TTL_SECONDS,
} from './livekit-token-core';

const apiKey = 'synthetic-key';
const apiSecret = 'synthetic-secret-value-at-least-32-characters';

describe('LiveKit appointment token grants', () => {
  it('issues a short-lived token scoped to one deterministic room and media sources', async () => {
    const token = await createScopedAppointmentToken({
      apiKey,
      apiSecret,
      appointmentId: '91000000-0000-4000-8000-000000000001',
      participantRole: 'doctor',
      userId: '11000000-0000-4000-8000-000000000001',
    });
    const claims = await new TokenVerifier(apiKey, apiSecret).verify(token);

    expect(claims.sub).toBe('doctor-11000000-0000-4000-8000-000000000001');
    expect(claims.video).toMatchObject({
      roomJoin: true,
      room: 'appointment-91000000-0000-4000-8000-000000000001',
      canPublish: true,
      canPublishSources: ['camera', 'microphone'],
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: false,
      roomCreate: false,
      roomAdmin: false,
      roomRecord: false,
    });
    expect(claims.roomConfig).toMatchObject({
      emptyTimeout: 300,
      maxParticipants: 2,
    });
    expect(Number(claims.exp) - Number(claims.nbf)).toBe(
      VIDEO_TOKEN_TTL_SECONDS,
    );
  });

  it('rejects arbitrary identity and room permission fields', async () => {
    await expect(
      createScopedAppointmentToken({
        apiKey,
        apiSecret,
        appointmentId: '91000000-0000-4000-8000-000000000001',
        participantRole: 'patient',
        userId: '11000000-0000-4000-8000-000000000001',
        room: 'arbitrary-room',
        roomAdmin: true,
      }),
    ).rejects.toThrow();
  });
});
