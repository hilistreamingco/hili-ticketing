/**
 * Simple email-based auth — no organization_members table needed.
 *
 * Set these in your .env:
 *   ADMIN_EMAILS=hilistreaming.co@gmail.com
 *   PRESTIGE_EMAILS=social@prestigeplaza.co.ke,hilistreaming.co@gmail.com
 *
 * ADMIN_EMAILS   → full Hili Admin access (event management + prestige ops)
 * PRESTIGE_EMAILS → Prestige dashboard access (orders, payments, tickets)
 * Any email in ADMIN_EMAILS automatically gets prestige access too.
 */
import { createClient } from "@supabase/supabase-js";

let _client: ReturnType<typeof createClient> | null = null;

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set in environment");
  _client ??= createClient(url, key, { 
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options = {}) => {
        return fetch(url, {
          ...options,
          signal: AbortSignal.timeout(8000) // 8 second timeout
        });
      }
    }
  });
  return _client;
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function prestigeEmails(): string[] {
  return (process.env.PRESTIGE_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export type AuthUser = { uid: string; email: string; role: "hili_admin" | "prestige_admin" };

/** Validates a Supabase JWT and returns the user with their role, or null. */
export async function getAuthedUser(authHeader: string | undefined): Promise<AuthUser | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.email) {
      console.error("Auth error:", error?.message || "No user email");
      return null;
    }

    const email = data.user.email.toLowerCase();
    const admins = adminEmails();
    const prestige = prestigeEmails();

    if (admins.includes(email)) return { uid: data.user.id, email, role: "hili_admin" };
    if (prestige.includes(email)) return { uid: data.user.id, email, role: "prestige_admin" };

    return null; // not in any list
  } catch (err) {
    console.error("getAuthedUser failed:", err);
    return null; // Return null instead of throwing on timeout
  }
}

export function requireHiliAdmin(user: AuthUser | null): boolean {
  return user?.role === "hili_admin";
}

export function requirePrestigeAccess(user: AuthUser | null): boolean {
  return user?.role === "hili_admin" || user?.role === "prestige_admin";
}
