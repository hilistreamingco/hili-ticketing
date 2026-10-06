import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Shared by every route handler. Lives outside /api on purpose: Vercel's free plan allows
// 12 serverless functions in total, so /api holds a single entry point (api/index.ts).
//
// The old per-file copies decoded the JWT payload WITHOUT checking its
// signature, so anyone could forge a token carrying an allowed email. This
// version asks Supabase Auth to validate the token, then checks the email
// against ADMIN_EMAILS / PRESTIGE_EMAILS.

export type AuthRole = 'hili_admin' | 'prestige_admin';

export interface VerifiedUser {
  uid: string;
  email: string;
}

export interface AuthedUser extends VerifiedUser {
  role: AuthRole;
}

let client: SupabaseClient | null = null;

/** Service-role client, or null when the environment is not configured. */
export function getServiceClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

function emailList(name: 'ADMIN_EMAILS' | 'PRESTIGE_EMAILS'): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Validates the bearer token with Supabase Auth and returns the signed-in
 * user, whether or not they are on an allow-list. Null when the token is
 * missing, forged, expired, or the email is unconfirmed.
 */
export async function getVerifiedUser(authHeader?: string): Promise<VerifiedUser | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const supabase = getServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  // An unconfirmed address could belong to someone who merely signed up with it.
  if (error || !user?.email || !user.email_confirmed_at) return null;

  return { uid: user.id, email: user.email.toLowerCase() };
}

/** Verified user who is on ADMIN_EMAILS or PRESTIGE_EMAILS, with their role. */
export async function getAuthedUser(authHeader?: string): Promise<AuthedUser | null> {
  const user = await getVerifiedUser(authHeader);
  if (!user) return null;
  if (emailList('ADMIN_EMAILS').includes(user.email)) return { ...user, role: 'hili_admin' };
  if (emailList('PRESTIGE_EMAILS').includes(user.email)) return { ...user, role: 'prestige_admin' };
  return null;
}

export function isHiliAdmin(user: AuthedUser | null): user is AuthedUser {
  return user?.role === 'hili_admin';
}

/** Hili admins can also open the Prestige dashboard. */
export function canUsePrestige(user: AuthedUser | null): user is AuthedUser {
  return Boolean(user);
}

export function isAllowListed(email: string): { admin: boolean; prestige: boolean } {
  return {
    admin: emailList('ADMIN_EMAILS').includes(email),
    prestige: emailList('PRESTIGE_EMAILS').includes(email),
  };
}
