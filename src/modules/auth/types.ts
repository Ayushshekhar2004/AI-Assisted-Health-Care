import { z } from 'zod';

export const profileRoleSchema = z.enum(['patient', 'doctor', 'operations']);
export type ProfileRole = z.infer<typeof profileRoleSchema>;

export type EmailCredentials = Readonly<{ email: string; password: string }>;
export type EmailSignUpOptions = Readonly<{ emailRedirectTo: string }>;
export type AuthResult = Readonly<{ authenticated: boolean }>;

export interface AuthAdapter {
  signInWithEmail(credentials: EmailCredentials): Promise<AuthResult>;
  signUpWithEmail(credentials: EmailCredentials, options: EmailSignUpOptions): Promise<AuthResult>;
  signOut(): Promise<void>;
}
