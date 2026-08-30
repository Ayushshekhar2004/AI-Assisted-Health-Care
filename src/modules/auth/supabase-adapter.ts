import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthAdapter,
  AuthResult,
  EmailCredentials,
  EmailSignUpOptions,
} from './types';

export class SupabaseAuthAdapter implements AuthAdapter {
  constructor(private readonly client: SupabaseClient) {}

  async signInWithEmail(credentials: EmailCredentials): Promise<AuthResult> {
    const { data, error } =
      await this.client.auth.signInWithPassword(credentials);
    return { authenticated: !error && data.user !== null };
  }

  async signUpWithEmail(
    credentials: EmailCredentials,
    options: EmailSignUpOptions,
  ): Promise<AuthResult> {
    const { data, error } = await this.client.auth.signUp({
      ...credentials,
      options,
    });
    return { authenticated: !error && data.session !== null };
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}
