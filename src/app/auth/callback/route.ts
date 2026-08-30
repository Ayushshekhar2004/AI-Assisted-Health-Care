import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { getSupabaseConfig } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import {
  getCurrentRole,
  getRoleHome,
  getSafeRedirectPath,
} from '@/modules/auth';

const callbackSchema = z.object({
  code: z.string().min(1).max(4096),
  next: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { siteUrl } = getSupabaseConfig();
  const parsed = callbackSchema.safeParse({
    code: request.nextUrl.searchParams.get('code'),
    next: request.nextUrl.searchParams.get('next') ?? undefined,
  });

  if (!parsed.success) {
    redirect(new URL('/auth/login', siteUrl).toString());
  }

  let destination = '/auth/login';
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(
      parsed.data.code,
    );

    if (!error) {
      const role = await getCurrentRole();
      if (role) {
        destination = getSafeRedirectPath(parsed.data.next, getRoleHome(role));
      } else {
        await supabase.auth.signOut();
      }
    }
  } catch {
    // Redirect to the generic sign-in screen without exposing provider details.
  }

  redirect(new URL(destination, siteUrl).toString());
}
