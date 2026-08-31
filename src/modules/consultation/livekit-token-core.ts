import {
  AccessToken,
  RoomConfiguration,
  TrackSource,
} from 'livekit-server-sdk';
import { z } from 'zod';

import { getAppointmentRoomName } from './video';

export const VIDEO_TOKEN_TTL_SECONDS = 5 * 60;

const scopedTokenInputSchema = z
  .object({
    apiKey: z.string().trim().min(3).max(200),
    apiSecret: z.string().trim().min(16).max(500),
    appointmentId: z.string().uuid(),
    participantRole: z.enum(['patient', 'doctor']),
    userId: z.string().uuid(),
  })
  .strict();

export async function createScopedAppointmentToken(untrustedInput: unknown) {
  const input = scopedTokenInputSchema.parse(untrustedInput);
  const accessToken = new AccessToken(input.apiKey, input.apiSecret, {
    identity: `${input.participantRole}-${input.userId}`,
    ttl: VIDEO_TOKEN_TTL_SECONDS,
  });
  accessToken.addGrant({
    roomJoin: true,
    room: getAppointmentRoomName(input.appointmentId),
    canPublish: true,
    canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
    canSubscribe: true,
    // Data publishing is limited to LiveKit's ephemeral in-room text fallback.
    canPublishData: true,
    canUpdateOwnMetadata: false,
    roomCreate: false,
    roomAdmin: false,
    roomRecord: false,
  });
  accessToken.roomConfig = new RoomConfiguration({
    emptyTimeout: 5 * 60,
    maxParticipants: 2,
  });
  return accessToken.toJwt();
}
