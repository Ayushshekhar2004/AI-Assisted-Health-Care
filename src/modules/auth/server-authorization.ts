import 'server-only';

import { createClient } from '../../lib/supabase/server';

import { profileRoleSchema, type ProfileRole } from './types';

export async function createRoleAuthorizedClient(
  allowedRoles: readonly ProfileRole[],
  unavailableMessage: string,
) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error(unavailableMessage);

  const profile = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  const parsedRole = profileRoleSchema.safeParse(profile.data?.role);
  if (
    profile.error ||
    !parsedRole.success ||
    !allowedRoles.includes(parsedRole.data)
  ) {
    throw new Error(unavailableMessage);
  }

  return {
    role: parsedRole.data,
    supabase,
    userId: authData.user.id,
  };
}
