import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getRoleHome } from './redirects';
import { profileRoleSchema, type ProfileRole } from './types';

export async function resolveCurrentRole(
  supabase: SupabaseClient,
): Promise<ProfileRole | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const profile = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', data.user.id)
    .maybeSingle();
  if (profile.error) return null;

  const parsed = profileRoleSchema.safeParse(profile.data?.role);
  return parsed.success ? parsed.data : null;
}

export async function getCurrentRole(): Promise<ProfileRole | null> {
  return resolveCurrentRole(await createClient());
}

export async function requireRole(requiredRole: ProfileRole): Promise<void> {
  const role = await getCurrentRole();
  if (!role) redirect('/auth/login');
  if (role !== requiredRole) redirect(getRoleHome(role));
}
