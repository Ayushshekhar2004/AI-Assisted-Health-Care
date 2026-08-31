import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAppointmentVideoToken } = vi.hoisted(() => ({
  createAppointmentVideoToken: vi.fn(),
}));

vi.mock('../../../../modules/consultation/video-server', () => ({
  createAppointmentVideoToken,
}));

import { POST } from './route';

const endpoint = 'https://synthetic-app.invalid/api/consultation/video-token';
const appointmentId = '91000000-0000-4000-8000-000000000001';

function request(body: string, origin = 'https://synthetic-app.invalid') {
  return new NextRequest(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body,
  });
}

describe('appointment video token endpoint', () => {
  beforeEach(() => createAppointmentVideoToken.mockReset());

  it('returns a no-store short-lived token for validated input', async () => {
    createAppointmentVideoToken.mockResolvedValue({
      serverUrl: 'wss://synthetic.livekit.invalid',
      token: 'synthetic-short-lived-token-value',
      expiresAt: '2026-08-31T10:05:00.000Z',
    });
    const response = await POST(request(JSON.stringify({ appointmentId })));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(createAppointmentVideoToken).toHaveBeenCalledWith({ appointmentId });
  });

  it('rejects cross-origin requests before token generation', async () => {
    const response = await POST(
      request(JSON.stringify({ appointmentId }), 'https://cross-site.invalid'),
    );
    expect(response.status).toBe(403);
    expect(createAppointmentVideoToken).not.toHaveBeenCalled();
  });

  it('rejects extra client-selected room permissions', async () => {
    const response = await POST(
      request(
        JSON.stringify({ appointmentId, room: 'arbitrary', roomAdmin: true }),
      ),
    );
    expect(response.status).toBe(400);
    expect(createAppointmentVideoToken).not.toHaveBeenCalled();
  });
});
