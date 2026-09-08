import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL) as string | undefined;
const anonKey = (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

// ── Types ──────────────────────────────────────────────────────────────────

export type AdminEvent = {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  poster_path: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue_map_url: string | null;
  status: "draft" | "published" | "archived";
  is_current: boolean;
  theme: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export type AdminTicketType = {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price_kes: number;
  quantity_total: number;
  quantity_sold: number;
  min_per_order: number;
  max_per_order: number;
  sales_start: string | null;
  sales_end: string | null;
  is_visible: boolean;
  is_active: boolean;
  sort_order: number;
};

export type AdminTicket = {
  id: string;
  ticket_number: string;
  attendee_name: string;
  checked_in_at: string | null;
  created_at: string;
  event: { name: string } | null;
  ticket_type: { name: string } | null;
};

// ── Auth header helper ─────────────────────────────────────────────────────

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function adminGet<T>(path: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(path, { headers });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function adminPut<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function adminDelete(path: string): Promise<void> {
  const headers = await authHeader();
  const res = await fetch(path, { method: "DELETE", headers });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
}

// ── Event CRUD (via server — bypasses RLS) ─────────────────────────────────

export async function getAdminEvents(): Promise<AdminEvent[]> {
  const data = await adminGet<{ events: AdminEvent[] }>("/api/admin/events");
  return data.events;
}

export async function createAdminEvent(
  event: Omit<AdminEvent, "id" | "organization_id" | "slug" | "created_at" | "updated_at">,
): Promise<AdminEvent> {
  const data = await adminPost<{ event: AdminEvent }>("/api/admin/events", event);
  return data.event;
}

export async function saveAdminEvent(
  event: Partial<AdminEvent> & { id: string },
): Promise<AdminEvent> {
  const { id, ...rest } = event;
  const data = await adminPut<{ event: AdminEvent }>(`/api/admin/events/${id}`, rest);
  return data.event;
}

// ── Ticket type CRUD (via server) ──────────────────────────────────────────

export async function getAdminTicketTypes(eventId: string): Promise<AdminTicketType[]> {
  const data = await adminGet<{ tickets: AdminTicketType[] }>(
    `/api/admin/events/${eventId}/tickets`,
  );
  return data.tickets;
}

export async function saveAdminTicketType(
  ticket: Partial<AdminTicketType> & { id?: string; event_id: string },
): Promise<AdminTicketType> {
  if (ticket.id && !ticket.id.startsWith("new-")) {
    const { id, ...rest } = ticket;
    const data = await adminPut<{ ticket: AdminTicketType }>(`/api/admin/tickets/${id}`, rest);
    return data.ticket;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...rest } = ticket;
  const data = await adminPost<{ ticket: AdminTicketType }>("/api/admin/tickets", rest);
  return data.ticket;
}

export async function deleteAdminTicketType(id: string): Promise<void> {
  await adminDelete(`/api/admin/tickets/${id}`);
}

// ── Poster upload (via server — uses service role for storage) ─────────────

export async function uploadEventPoster(file: File, eventId: string): Promise<{ url: string }> {
  // Compress image before upload if it's too large
  let fileToUpload = file;
  
  // If image is larger than 1MB, compress it
  if (file.size > 1024 * 1024) {
    fileToUpload = await compressImage(file, 1920, 0.85); // Max width 1920px, 85% quality
  }
  
  // Convert to base64 and send to server; server uses service role to upload
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip "data:image/...;base64,"
    };
    reader.onerror = reject;
    reader.readAsDataURL(fileToUpload);
  });

  const data = await adminPost<{ url: string }>("/api/admin/upload-poster", {
    eventId,
    base64,
    mimeType: fileToUpload.type,
  });
  return { url: data.url };
}

// Helper function to compress images
async function compressImage(file: File, maxWidth: number, quality: number): Promise<File> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Scale down if needed
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file); // Fallback to original if compression fails
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ── Attendee tickets (direct Supabase read — admins have RLS read access) ──

export async function getAdminTickets(): Promise<AdminTicket[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tickets")
    .select("id,ticket_number,attendee_name,checked_in_at,created_at,event:events(name),ticket_type:ticket_types(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as AdminTicket[];
}

// ── Realtime ───────────────────────────────────────────────────────────────

export function subscribeToAdminData(onChange: () => void) {
  if (!supabase) return () => undefined;
  const channel = supabase
    .channel("hili-admin-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "events" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "ticket_types" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export async function getPublishedEvents() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("events")
    .select("*, ticket_types(*)")
    .eq("status", "published")
    .order("event_date");
  if (error) throw error;
  return data;
}

// ── Prestige / role helpers ────────────────────────────────────────────────

import type { UserRole } from "@shared/api";

export type MemberRole = {
  role: UserRole;
};

/** Returns the current user's role via the server email-based auth check. */
export async function getCurrentUserRole(): Promise<UserRole | null> {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) return null;

  try {
    const res = await fetch("/api/admin/me", {
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { role: string | null };
    return (data.role as UserRole) ?? null;
  } catch {
    return null;
  }
}

export function isHiliAdminRole(role: UserRole | null): boolean {
  return role === "hili_admin";
}

export function isPrestigeRole(role: UserRole | null): boolean {
  return role === "hili_admin" || role === "prestige_admin";
}

// hili_admin is superadmin — they can do everything prestige_admin can
export function isPrestigeAdminRole(role: UserRole | null): boolean {
  return role === "hili_admin" || role === "prestige_admin";
}

// ── Prestige API client helpers ────────────────────────────────────────────
// All Prestige API calls go through the Express server using the Supabase JWT
// so server-side RLS and role checks are enforced.

async function getAuthHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function prestigeGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeader();
  const res = await fetch(path, { headers });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function prestigePost<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeader();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function prestigePut<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeader();
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

import type {
  Order,
  PrestigeStats,
  PaymentConfig,
  ConfirmPaymentResponse,
  SendTicketResponse,
  UpsertPaymentConfigRequest,
} from "@shared/api";

export async function fetchPrestigeStats(): Promise<PrestigeStats> {
  return prestigeGet<PrestigeStats>("/api/prestige/stats");
}

export async function fetchPrestigeOrders(
  status?: "pending" | "confirmed" | "sent" | "all",
): Promise<Order[]> {
  const qs = status && status !== "all" ? `?status=${status}` : "";
  const data = await prestigeGet<{ orders: Order[] }>(`/api/prestige/orders${qs}`);
  return data.orders;
}

export async function fetchPrestigeOrder(orderId: string): Promise<Order> {
  const data = await prestigeGet<{ order: Order }>(`/api/prestige/orders?orderId=${orderId}`);
  return data.order;
}

export async function confirmPrestigePayment(orderId: string): Promise<ConfirmPaymentResponse> {
  return prestigePost<ConfirmPaymentResponse>("/api/prestige/orders/confirm", { orderId });
}

export async function markPrestigeNotFound(orderId: string, note?: string): Promise<void> {
  await prestigePost("/api/prestige/orders/not-found", { orderId, note });
}

export async function sendPrestigeTicket(orderId: string): Promise<SendTicketResponse> {
  return prestigePost<SendTicketResponse>("/api/prestige/orders/send-ticket", { orderId });
}

export async function savePrestigePaymentConfig(
  req: UpsertPaymentConfigRequest,
): Promise<void> {
  await prestigePut("/api/prestige/payment-config", req);
}

export async function fetchPaymentConfig(eventSlug: string): Promise<PaymentConfig | null> {
  const data = await fetch(`/api/payment-config/${eventSlug}`)
    .then((r) => r.json() as Promise<{ config: PaymentConfig | null }>)
    .catch(() => ({ config: null }));
  return data.config;
}

export function subscribeToPrestigeOrders(onChange: () => void) {
  if (!supabase) return () => undefined;
  const channel = supabase
    .channel("prestige-orders-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
