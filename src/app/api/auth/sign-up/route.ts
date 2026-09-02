import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isTrustedSameOriginForm } from '@/lib/security/request';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createRouteClient } from '@/lib/supabase/route';
import { emailCredentialsSchema, SupabaseAuthAdapter } from '@/modules/auth';

function signUpRedirect(request: NextRequest, error = false) {
  const url = new URL('/auth/sign-up', request.nextUrl.origin);
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
  if (!credentials.success) return signUpRedirect(request, true);

  const { applyCookies, supabase } = createRouteClient(request);
  try {
    const adapter = new SupabaseAuthAdapter(supabase);
    const { siteUrl } = getSupabaseConfig();
    const result = await adapter.signUpWithEmail(credentials.data, {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    });
    if (!result.authenticated) return applyCookies(signUpRedirect(request));
    return applyCookies(
      NextResponse.redirect(new URL('/patient', request.nextUrl.origin), 303),
    );
  } catch {
    return applyCookies(signUpRedirect(request, true));
  }
}
