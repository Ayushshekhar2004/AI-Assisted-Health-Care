import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isTrustedSameOriginForm } from '@/lib/security/request';
import { createRouteClient } from '@/lib/supabase/route';
import {
  emailCredentialsSchema,
  getRoleHome,
  getSafeRedirectPath,
  resolveCurrentRole,
  SupabaseAuthAdapter,
} from '@/modules/auth';

function loginRedirect(request: NextRequest, error = false) {
  const url = new URL('/auth/login', request.nextUrl.origin);
  if (error) url.searchParams.set('error', '1');
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  if (
    !isTrustedSameOriginForm(
      request.headers.get('origin'),
      request.nextUrl.origin,
      request.headers.get('sec-fetch-site'),
      request.headers.get('content-type'),
    )
  ) {
    return NextResponse.json(
      { error: 'Request is unavailable' },
      { status: 403 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const credentials = emailCredentialsSchema.safeParse({
    email: formData?.get('email'),
    password: formData?.get('password'),
  });
  if (!credentials.success) return loginRedirect(request, true);

  const { applyCookies, supabase } = createRouteClient(request);
  const adapter = new SupabaseAuthAdapter(supabase);
  try {
    const result = await adapter.signInWithEmail(credentials.data);
    if (!result.authenticated)
      return applyCookies(loginRedirect(request, true));
    const role = await resolveCurrentRole(supabase);
    if (!role) {
      await adapter.signOut();
      return applyCookies(loginRedirect(request, true));
    }
    const destination = getSafeRedirectPath(
      formData?.get('next'),
      getRoleHome(role),
    );
    return applyCookies(
      NextResponse.redirect(new URL(destination, request.nextUrl.origin), 303),
    );
  } catch {
    return applyCookies(loginRedirect(request, true));
  }
}
