import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { startAppointmentConsultation } = vi.hoisted(() => ({
  startAppointmentConsultation: vi.fn(),
}));

vi.mock('../../../../modules/consultation/video-server', () => ({
  startAppointmentConsultation,
}));

import { POST } from './route';

const endpoint = 'https://synthetic-app.invalid/api/consultation/start';
const appointmentId = '91000000-0000-4000-8000-000000000001';

function request(body: string, origin = 'https://synthetic-app.invalid') {
  return new NextRequest(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body,
  });
}

describe('consultation start endpoint', () => {
  beforeEach(() => startAppointmentConsultation.mockReset());

  it('returns no-store state for authorized server logic', async () => {
    startAppointmentConsultation.mockResolvedValue({ status: 'IN_PROGRESS' });
    const response = await POST(request(JSON.stringify({ appointmentId })));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(startAppointmentConsultation).toHaveBeenCalledWith({
      appointmentId,
    });
  });

  it('rejects cross-origin requests before status logic', async () => {
    const response = await POST(
      request(JSON.stringify({ appointmentId }), 'https://cross-site.invalid'),
    );
    expect(response.status).toBe(403);
    expect(startAppointmentConsultation).not.toHaveBeenCalled();
  });

  it('rejects browser-supplied status and participant fields', async () => {
    const response = await POST(
      request(
        JSON.stringify({
          appointmentId,
          status: 'IN_PROGRESS',
          participantRole: 'doctor',
        }),
      ),
    );
    expect(response.status).toBe(400);
    expect(startAppointmentConsultation).not.toHaveBeenCalled();
  });
});
