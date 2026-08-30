'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import {
  emailCredentialsSchema,
  getCurrentRole,
  getRoleHome,
  getSafeRedirectPath,
  SupabaseAuthAdapter,
  type ProfileRole,
} from '@/modules/auth';

export type AuthActionState = Readonly<{
  message: string;
  status: 'idle' | 'error' | 'success';
}>;

const genericAuthError =
  'Unable to complete the request. Check your details and try again.';

function parseCredentials(formData: FormData) {
  return emailCredentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
}

export async function loginAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = parseCredentials(formData);
  if (!credentials.success) {
    return { message: genericAuthError, status: 'error' };
  }

  let adapter: SupabaseAuthAdapter;
  try {
    adapter = new SupabaseAuthAdapter(await createClient());
    const result = await adapter.signInWithEmail(credentials.data);
    if (!result.authenticated) {
      return { message: genericAuthError, status: 'error' };
    }
  } catch {
    return { message: genericAuthError, status: 'error' };
  }

  let role: ProfileRole | null = null;
  try {
    role = await getCurrentRole();
  } catch {
    // The response remains generic and no authentication details are logged.
  }

  if (!role) {
    try {
      await adapter.signOut();
    } catch {
      // Do not replace the generic response with provider details.
    }
    return { message: genericAuthError, status: 'error' };
  }

  const roleHome = getRoleHome(role);
  redirect(getSafeRedirectPath(formData.get('next'), roleHome));
}

export async function signUpAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = parseCredentials(formData);
  if (!credentials.success) {
    return { message: genericAuthError, status: 'error' };
  }

  let authenticated = false;
  try {
    const adapter = new SupabaseAuthAdapter(await createClient());
    const { siteUrl } = getSupabaseConfig();
    const result = await adapter.signUpWithEmail(credentials.data, {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    });
    authenticated = result.authenticated;
  } catch {
    return { message: genericAuthError, status: 'error' };
  }

  if (authenticated) {
    redirect('/patient');
  }

  return {
    message:
      'If the address can be registered, check its inbox for the next step.',
    status: 'success',
  };
}

export async function logoutAction(): Promise<void> {
  const adapter = new SupabaseAuthAdapter(await createClient());
  await adapter.signOut();
  redirect('/auth/login');
}
