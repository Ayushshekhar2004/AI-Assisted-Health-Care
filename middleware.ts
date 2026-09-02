import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { getSecurityConfig } from '@/lib/security/config';
import {
  checkRateLimit,
  type RateLimitPolicy,
} from '@/lib/security/rate-limit';
import {
  isSameOriginRequest,
  isTrustedSameOriginForm,
} from '@/lib/security/request';
import { recordOperationalMetric } from '@/modules/monitoring/server';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const endpointPolicies: ReadonlyArray<
  readonly [RegExp, RateLimitPolicy, number]
> = [
  [
    /^\/(?:api\/)?auth\/(login|sign-up)\/?$/,
    { limit: 10, windowMs: 15 * 60_000 },
    16 * 1024,
  ],
  [/^\/patient\/intake\/?$/, { limit: 60, windowMs: 60_000 }, 64 * 1024],
  [
    /^\/api\/intake\/realtime-session\/?$/,
    { limit: 20, windowMs: 60_000 },
    4 * 1024,
  ],
  [
    /^\/api\/consultation\/(video-token|start)\/?$/,
    { limit: 20, windowMs: 60_000 },
    4 * 1024,
  ],
];

async function opaqueClientKey(request: NextRequest): Promise<string> {
  const { rateLimitSalt = 'local-development-rate-limit-salt' } =
    getSecurityConfig();
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  const identifier = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const encoded = new TextEncoder().encode(`${rateLimitSalt}:${identifier}`);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function middleware(request: NextRequest) {
  if (request.method === 'GET' && request.nextUrl.pathname === '/health') {
    return NextResponse.next();
  }
  if (unsafeMethods.has(request.method)) {
    const expectedOrigin =
      process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
    const isTrustedRequest =
      isSameOriginRequest(request.headers.get('origin'), expectedOrigin) ||
      isTrustedSameOriginForm(
        request.headers.get('origin'),
        expectedOrigin,
        request.headers.get('sec-fetch-site'),
        request.headers.get('content-type'),
      );
    if (!isTrustedRequest) {
      recordOperationalMetric({
        event: 'request.error',
        category: 'csrf',
        method: request.method,
        status: 403,
      });
      return NextResponse.json(
        { error: 'Request is unavailable' },
        { status: 403, headers: { 'Cache-Control': 'no-store, private' } },
      );
    }

    const matched = endpointPolicies.find(([pattern]) =>
      pattern.test(request.nextUrl.pathname),
    );
    if (matched) {
      const [, policy, maximumBytes] = matched;
      const contentLength = Number(request.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
        recordOperationalMetric({
          event: 'request.error',
          category: 'request_size',
          method: request.method,
          status: 413,
        });
        return NextResponse.json(
          { error: 'Request is unavailable' },
          { status: 413, headers: { 'Cache-Control': 'no-store, private' } },
        );
      }
      const key = `${request.nextUrl.pathname}:${await opaqueClientKey(request)}`;
      const rateLimit = checkRateLimit(key, policy);
      if (!rateLimit.allowed) {
        recordOperationalMetric({
          event: 'request.error',
          category: 'rate_limit',
          method: request.method,
          status: 429,
        });
        return NextResponse.json(
          { error: 'Request is unavailable' },
          {
            status: 429,
            headers: {
              'Cache-Control': 'no-store, private',
              'Retry-After': String(rateLimit.retryAfterSeconds),
            },
          },
        );
      }
    }
  }
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
