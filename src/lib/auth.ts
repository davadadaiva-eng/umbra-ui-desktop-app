import { createClient, type SupabaseClient, type AuthError } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = supabaseConfigured ? createClient(url!, key!) : null;

export interface AuthResult {
  ok: boolean;
  error?: string;
  /** Set when sign-in failed only because the email hasn't been verified yet. */
  emailNotConfirmed?: boolean;
}

function fmtError(err: AuthError | null, fallback: string): string {
  if (!err) return fallback;
  const msg = err.message;
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(msg)) return 'Email not confirmed — check your inbox, or turn off “Confirm email” in Supabase → Authentication.';
  if (/user already registered/i.test(msg)) return 'That email is already registered.';
  if (/password should be/i.test(msg)) return 'Password is too weak (min. 6 characters).';
  if (/unable to validate/i.test(msg)) return 'Account not found.';
  if (/rate limit/i.test(msg)) return 'Too many attempts — wait a moment and retry.';
  return msg;
}

function noClient(): AuthResult {
  return { ok: false, error: 'Supabase auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.' };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return noClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    const emailNotConfirmed = error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message);
    return { ok: false, error: fmtError(error, error.message), emailNotConfirmed };
  }
  return { ok: true };
}

export async function signUp(name: string, email: string, password: string): Promise<AuthResult> {
  if (!supabase) return noClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { name: name.trim(), umbra_verified: false, onboarded: false } },
  });
  if (error) return { ok: false, error: fmtError(error, error.message) };
  // When "Confirm email" is off, signUp with an existing email returns the
  // existing user (no error) but with no new identity. Tell the user instead
  // of silently failing the sign-in attempt that follows.
  const identities = data?.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return { ok: false, error: 'That email is already registered — sign in instead, or use a different email.' };
  }
  const session = data?.session;
  if (session && isEmailVerified(session)) {
    try {
      await supabase.auth.updateUser({ data: { umbra_verified: true } });
    } catch {
      // ignore
    }
  }
  return { ok: true };
}

export async function sendVerificationCode(email: string): Promise<AuthResult> {
  if (!supabase) return noClient();
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
  if (error) return { ok: false, error: fmtError(error, error.message) };
  return { ok: true };
}

export async function verifyEmailCode(email: string, token: string): Promise<AuthResult> {
  if (!supabase) return noClient();
  if (!/^\d{6}$/.test(token.trim())) {
    return { ok: false, error: 'Enter the 6-digit code from your email.' };
  }
  const { error } = await supabase.auth.verifyOtp({ type: 'email', email: email.trim(), token: token.trim() });
  if (error) return { ok: false, error: fmtError(error, error.message) };
  try {
    await supabase.auth.updateUser({ data: { umbra_verified: true } });
  } catch {
    // ignore
  }
  return { ok: true };
}

export async function signOut(): Promise<AuthResult> {
  if (!supabase) return noClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function resetPassword(email: string): Promise<AuthResult> {
  if (!supabase) return noClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) return { ok: false, error: fmtError(error, error.message) };
  return { ok: true };
}

export interface AuthSession {
  email: string;
  name: string;
}

type SessionLike = { user?: { email?: string | null; user_metadata?: Record<string, unknown>; email_confirmed_at?: string | null } } | null | undefined;

export function isEmailVerified(session: SessionLike): boolean {
  if (session?.user?.email_confirmed_at) return true;
  return session?.user?.user_metadata?.umbra_verified === true;
}

export function isOnboarded(session: SessionLike): boolean {
  return session?.user?.user_metadata?.onboarded === true;
}

export function sessionToAuthUser(session: SessionLike): AuthSession | null {
  const email = session?.user?.email;
  if (!email) return null;
  const metaName = typeof session.user?.user_metadata?.name === 'string' ? session.user.user_metadata.name.trim() : '';
  const fallback = email.split('@')[0] || 'User';
  return {
    email,
    name: metaName.length > 0 ? metaName : fallback.charAt(0).toUpperCase() + fallback.slice(1),
  };
}

export interface AuthView {
  user: AuthSession | null;
  emailVerified: boolean;
  isOnboarded: boolean;
}

export function sessionToAuthView(session: SessionLike): AuthView {
  return {
    user: sessionToAuthUser(session),
    emailVerified: isEmailVerified(session),
    isOnboarded: isOnboarded(session),
  };
}