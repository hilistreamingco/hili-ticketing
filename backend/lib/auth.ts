import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Shared by every route handler. Lives outside /api on purpose: Vercel's free plan allows
// 12 serverless functions in total, so /api holds a single entry point (api/index.ts).
//
// The old per-file copies decoded the JWT payload WITHOUT checking its
// signature, so anyone could forge a token carrying an allowed email. This
// version asks Supabase Auth to validate the token, then checks the email
// against ADMIN_EMAILS / PRESTIGE_EMAILS.

export type AuthRole = 'hili_admin' | 'prestige_admin' | 'company_admin';

export interface VerifiedUser {
  uid: string;
  email: string;
}

export interface AuthedUser extends VerifiedUser {
  role: AuthRole;
  /** Set for company_admin: the companies this person may manage (and nothing else). */
  companyIds?: string[];
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
  const companyIds = await companyIdsForEmail(user.email);
  if (companyIds.length) return { ...user, role: 'company_admin', companyIds };
  return null;
}

/** Companies whose staff list (public.company_staff) contains this email. */
export async function companyIdsForEmail(email: string): Promise<string[]> {
  const supabase = getServiceClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('company_staff').select('company_id').eq('email', email.toLowerCase());
  if (error || !data) return [];
  return data.map((r: any) => r.company_id as string);
}

export function isHiliAdmin(user: AuthedUser | null): user is AuthedUser {
  return user?.role === 'hili_admin';
}

/** Hili admins and Prestige staff can open the Prestige dashboard. Company staff cannot. */
export function canUsePrestige(user: AuthedUser | null): user is AuthedUser {
  return Boolean(user) && user!.role !== 'company_admin';
}

export function isCompanyAdmin(user: AuthedUser | null): user is AuthedUser {
  return user?.role === 'company_admin';
}

/** Hili admin, or company staff (who are then limited by the owns* checks below). */
export function canManageEvents(user: AuthedUser | null): user is AuthedUser {
  return isHiliAdmin(user) || isCompanyAdmin(user);
}

/** True when this user may act on rows belonging to the given company. */
export function ownsCompany(user: AuthedUser, companyId: string | null | undefined): boolean {
  if (isHiliAdmin(user)) return true;
  return Boolean(companyId) && Boolean(user.companyIds?.includes(companyId as string));
}

export async function ownsEvent(supabase: any, user: AuthedUser, eventId: string): Promise<boolean> {
  if (isHiliAdmin(user)) return true;
  const { data } = await supabase.from('events').select('company_id').eq('id', eventId).maybeSingle();
  return ownsCompany(user, data?.company_id);
}

export async function ownsCampaign(supabase: any, user: AuthedUser, campaignId: string): Promise<boolean> {
  if (isHiliAdmin(user)) return true;
  const { data } = await supabase.from('campaigns').select('company_id').eq('id', campaignId).maybeSingle();
  return ownsCompany(user, data?.company_id);
}

export async function ownsTier(supabase: any, user: AuthedUser, tierId: string): Promise<boolean> {
  if (isHiliAdmin(user)) return true;
  const { data } = await supabase.from('ticket_types').select('event_id').eq('id', tierId).maybeSingle();
  return data?.event_id ? ownsEvent(supabase, user, data.event_id) : false;
}

export function isAllowListed(email: string): { admin: boolean; prestige: boolean } {
  return {
    admin: emailList('ADMIN_EMAILS').includes(email),
    prestige: emailList('PRESTIGE_EMAILS').includes(email),
  };
}
