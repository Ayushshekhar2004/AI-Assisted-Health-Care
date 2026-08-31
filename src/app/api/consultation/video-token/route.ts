import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  appointmentVideoTokenRequestSchema,
  isTrustedVideoTokenRequest,
} from '../../../../modules/consultation/index';
import { createAppointmentVideoToken } from '../../../../modules/consultation/video-server';

const noStoreHeaders = { 'Cache-Control': 'no-store, private' } as const;

export async function POST(request: NextRequest) {
  if (
    !isTrustedVideoTokenRequest(
      request.headers.get('origin'),
      request.nextUrl.origin,
      request.headers.get('content-type'),
    )
  ) {
    return NextResponse.json(
      { error: 'Video consultation is unavailable' },
      { status: 403, headers: noStoreHeaders },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Video consultation is unavailable' },
      { status: 400, headers: noStoreHeaders },
    );
  }
  const input = appointmentVideoTokenRequestSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      { error: 'Video consultation is unavailable' },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    return NextResponse.json(await createAppointmentVideoToken(input.data), {
      headers: noStoreHeaders,
    });
  } catch {
    return NextResponse.json(
      { error: 'Video consultation is unavailable' },
      { status: 403, headers: noStoreHeaders },
    );
  }
}
