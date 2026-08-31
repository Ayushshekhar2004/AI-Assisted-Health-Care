import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('livekit-client', () => ({
  Track: { Source: { Camera: 'camera' } },
}));

vi.mock('@livekit/components-react', () => ({
  Chat: () => <div>Ephemeral room chat</div>,
  ConnectionState: () => <>connected</>,
  ConnectionStateToast: () => <div>Reconnect notice</div>,
  ControlBar: () => <div>Camera microphone and leave controls</div>,
  GridLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ParticipantTile: () => <div>Participant video</div>,
  RoomAudioRenderer: () => null,
  useTracks: () => [],
  LiveKitRoom: ({
    children,
    onConnected,
    onDisconnected,
  }: {
    children: ReactNode;
    onConnected: () => void;
    onDisconnected: () => void;
  }) => {
    useEffect(() => onConnected(), [onConnected]);
    return (
      <div>
        {children}
        <button onClick={onDisconnected} type="button">
          Simulate leave
        </button>
      </div>
    );
  },
}));

import { AppointmentVideoCall } from './appointment-video-call';

const appointmentId = '91000000-0000-4000-8000-000000000001';
const fetchMock = vi.fn();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppointmentVideoCall', () => {
  it('offers media controls, connection state, reconnect UX, and ephemeral text', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          serverUrl: 'wss://synthetic.livekit.invalid',
          token: 'synthetic-short-lived-token-value',
          expiresAt: '2026-08-31T10:05:00.000Z',
        }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<AppointmentVideoCall appointmentId={appointmentId} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Join video consultation' }),
    );

    expect(
      await screen.findByText(/connection: connected/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/camera microphone and leave/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/ephemeral room chat/i)).toBeInTheDocument();
    expect(screen.getByText(/does not start recording/i)).toBeInTheDocument();
    expect(
      screen.getByText(/messages here are temporary/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/consultation/start');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      appointmentId,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Simulate leave' }));
    expect(screen.getByText(/could not reconnect/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Join video consultation' }),
    ).toBeInTheDocument();
  });
});
