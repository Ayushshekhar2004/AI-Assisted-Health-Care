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
  useTracks,
} from '@livekit/components-react';
import { useState } from 'react';
import { Track } from 'livekit-client';

import { appointmentVideoTokenResponseSchema } from '../../modules/consultation/video';

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

export function AppointmentVideoCall({
  appointmentId,
}: Readonly<{ appointmentId: string }>) {
  const [connection, setConnection] = useState<VideoConnection | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function markConsultationStarted() {
    try {
      await fetch('/api/consultation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId }),
        cache: 'no-store',
      });
    } catch {
      // Joining remains available: the database independently prevents an
      // unauthorized status transition and the doctor can retry by rejoining.
    }
  }

  async function joinCall() {
    setPending(true);
    setMessage('');
    try {
      const response = await fetch('/api/consultation/video-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unavailable');
      const result = appointmentVideoTokenResponseSchema.parse(
        await response.json(),
      );
      setConnection({ serverUrl: result.serverUrl, token: result.token });
    } catch {
      setMessage('Video consultation is unavailable. Please try again.');
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
          setMessage(
            'The call ended or could not reconnect. You can join again when ready.',
          );
        }}
        onError={() =>
          setMessage('The call connection had a problem. Please try again.')
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
