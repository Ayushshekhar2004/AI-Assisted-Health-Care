import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  isTrustedRealtimeSessionRequest,
  realtimeSessionRequestSchema,
} from '@/modules/intake';
import { createIntakeRealtimeClientSecret } from '@/modules/intake/realtime-server';

const noStoreHeaders = { 'Cache-Control': 'no-store, private' } as const;

export async function POST(request: NextRequest) {
  if (
    !isTrustedRealtimeSessionRequest(
      request.headers.get('origin'),
      request.nextUrl.origin,
      request.headers.get('content-type'),
    )
  ) {
    return NextResponse.json(
      { error: 'Voice input is unavailable' },
      { status: 403, headers: noStoreHeaders },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Voice input is unavailable' },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const input = realtimeSessionRequestSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      { error: 'Voice input is unavailable' },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const clientSecret = await createIntakeRealtimeClientSecret(input.data);
    return NextResponse.json(clientSecret, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json(
      { error: 'Voice input is unavailable' },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
