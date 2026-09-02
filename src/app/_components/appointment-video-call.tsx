'use client';

import {
  Chat,
  ConnectionState,
  ConnectionStateToast,
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useRemoteParticipants,
  useTracks,
} from '@livekit/components-react';
import { useRef, useState } from 'react';
import { Track } from 'livekit-client';

import {
  fetchWithTimeout,
  RequestTimeoutError,
} from '../../lib/client/fetch-with-timeout';
import { appointmentVideoTokenResponseSchema } from '../../modules/consultation/video';

const VIDEO_REQUEST_TIMEOUT_MILLISECONDS = 15_000;

type VideoConnection = Readonly<{
  serverUrl: string;
  token: string;
}>;

function ParticipantGrid() {
  const cameraTracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
  ]).slice(0, 2);
  return (
    <GridLayout tracks={cameraTracks}>
      <ParticipantTile />
    </GridLayout>
  );
}

function OtherParticipantState() {
  const remoteParticipants = useRemoteParticipants();
  if (remoteParticipants.length > 0) return null;
  return (
    <p aria-live="polite" className="consultation-connection-state">
      The other participant has not joined or was disconnected. Keep this room
      open for reconnection, or use the text fallback.
    </p>
  );
}

export function AppointmentVideoCall({
  appointmentId,
}: Readonly<{ appointmentId: string }>) {
  const [connection, setConnection] = useState<VideoConnection | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const startRequestedRef = useRef(false);

  async function markConsultationStarted() {
    if (startRequestedRef.current) return;
    startRequestedRef.current = true;
    try {
      const response = await fetchWithTimeout(
        '/api/consultation/start',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId }),
          cache: 'no-store',
        },
        VIDEO_REQUEST_TIMEOUT_MILLISECONDS,
      );
      if (!response.ok) throw new Error('Consultation start unavailable');
    } catch {
      startRequestedRef.current = false;
      // Joining remains available: the database independently prevents an
      // unauthorized status transition and the doctor can retry by rejoining.
    }
  }

  async function joinCall() {
    setPending(true);
    setMessage('');
    try {
      const response = await fetchWithTimeout(
        '/api/consultation/video-token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId }),
          cache: 'no-store',
        },
        VIDEO_REQUEST_TIMEOUT_MILLISECONDS,
      );
      if (!response.ok) throw new Error('Unavailable');
      const result = appointmentVideoTokenResponseSchema.parse(
        await response.json(),
      );
      setConnection({ serverUrl: result.serverUrl, token: result.token });
    } catch (error) {
      setMessage(
        error instanceof RequestTimeoutError
          ? 'The video connection timed out on a slow network. Check your connection and try again.'
          : 'The video provider is unavailable. Please try again or contact the clinic using your usual channel.',
      );
    } finally {
      setPending(false);
    }
  }

  if (!connection) {
    return (
      <div className="appointment-video-entry">
        <button disabled={pending} onClick={joinCall} type="button">
          {pending ? 'Preparing secure call…' : 'Join video consultation'}
        </button>
        {message ? (
          <p aria-live="polite" className="auth-message" role="status">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section aria-label="Video consultation" className="appointment-video-call">
      <p>
        This private call is limited to the assigned patient and doctor. It is
        not an emergency service. This call screen does not start recording.
      </p>
      <LiveKitRoom
        audio
        connect
        data-lk-theme="default"
        onConnected={() => void markConsultationStarted()}
        onDisconnected={() => {
          setConnection(null);
          startRequestedRef.current = false;
          setMessage(
            'The call ended or could not reconnect. You can join again when ready.',
          );
        }}
        onError={() =>
          setMessage(
            'The network connection is unstable. Reconnection will be attempted automatically; use text if needed.',
          )
        }
        onMediaDeviceFailure={() =>
          setMessage(
            'Camera or microphone access is unavailable. You can continue using text.',
          )
        }
        serverUrl={connection.serverUrl}
        token={connection.token}
        video
      >
        <p aria-live="polite" className="consultation-connection-state">
          Connection: <ConnectionState />
        </p>
        <ParticipantGrid />
        <OtherParticipantState />
        <ConnectionStateToast />
        <ControlBar
          controls={{
            camera: true,
            chat: false,
            leave: true,
            microphone: true,
            screenShare: false,
          }}
        />
        <RoomAudioRenderer />
        <aside
          aria-label="Text fallback"
          className="consultation-text-fallback"
        >
          <h3>Text fallback</h3>
          <p>
            Messages here are temporary and are not added to the medical record.
            They are lost after leaving or refreshing the room.
          </p>
          <Chat />
        </aside>
      </LiveKitRoom>
      {message ? (
        <p aria-live="polite" className="auth-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
