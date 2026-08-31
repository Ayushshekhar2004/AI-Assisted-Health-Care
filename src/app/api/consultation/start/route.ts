import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  appointmentConsultationStartRequestSchema,
  isTrustedVideoTokenRequest,
} from '../../../../modules/consultation/index';
import { startAppointmentConsultation } from '../../../../modules/consultation/video-server';

const noStoreHeaders = { 'Cache-Control': 'no-store, private' } as const;
const unavailable = { error: 'Consultation is unavailable' } as const;

export async function POST(request: NextRequest) {
  if (
    !isTrustedVideoTokenRequest(
      request.headers.get('origin'),
      request.nextUrl.origin,
      request.headers.get('content-type'),
    )
  ) {
    return NextResponse.json(unavailable, {
      status: 403,
      headers: noStoreHeaders,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(unavailable, {
      status: 400,
      headers: noStoreHeaders,
    });
  }
  const input = appointmentConsultationStartRequestSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(unavailable, {
      status: 400,
      headers: noStoreHeaders,
    });
  }

  try {
    return NextResponse.json(await startAppointmentConsultation(input.data), {
      headers: noStoreHeaders,
    });
  } catch {
    return NextResponse.json(unavailable, {
      status: 403,
      headers: noStoreHeaders,
    });
  }
}
