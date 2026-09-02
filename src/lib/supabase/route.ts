import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, type NextResponse } from 'next/server';

import { getSupabaseConfig } from './config';

type CookieToSet = Readonly<{
  name: string;
  options: CookieOptions;
  value: string;
}>;

export function createRouteClient(request: NextRequest) {
  const pendingCookies: CookieToSet[] = [];
  const { publishableKey, url } = getSupabaseConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies: CookieToSet[]) => pendingCookies.push(...cookies),
    },
  });

  function applyCookies(response: NextResponse): NextResponse {
    pendingCookies.forEach(({ name, options, value }) => {
      response.cookies.set(name, value, {
        ...options,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
      });
    });
    return response;
  }

  return { applyCookies, supabase };
}
