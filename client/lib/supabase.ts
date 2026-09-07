import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL) as string | undefined;
const anonKey = (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

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

export async function uploadEventPoster(file: File, eventId: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${eventId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("event-posters").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return { path, url: supabase.storage.from("event-posters").getPublicUrl(path).data.publicUrl };
}

export async function getAdminEvents() {
  if (!supabase) return [] as AdminEvent[];
  const { data, error } = await supabase.from("events").select("*").order("event_date", { ascending: true });
  if (error) throw error;
  return (data || []) as AdminEvent[];
}

export async function createAdminEvent(event: Omit<AdminEvent, "id" | "created_at" | "updated_at">) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.from("events").insert(event).select().single();
  if (error) throw error;
  return data as AdminEvent;
}

export async function saveAdminEvent(event: Partial<AdminEvent> & { id: string }) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.from("events").update(event).eq("id", event.id).select().single();
  if (error) throw error;
  return data as AdminEvent;
}

export async function getAdminTicketTypes(eventId: string) {
  if (!supabase) return [] as AdminTicketType[];
  const { data, error } = await supabase.from("ticket_types").select("*").eq("event_id", eventId).order("sort_order");
  if (error) throw error;
  return (data || []) as AdminTicketType[];
}

export async function saveAdminTicketType(ticket: Partial<AdminTicketType> & { id?: string; event_id: string }) {
  if (!supabase) throw new Error("Supabase is not configured");
  const payload = {
    event_id: ticket.event_id,
    name: ticket.name,
    description: ticket.description ?? null,
    price_kes: ticket.price_kes,
    quantity_total: ticket.quantity_total,
    min_per_order: ticket.min_per_order ?? 1,
    max_per_order: ticket.max_per_order,
    sales_start: ticket.sales_start ?? null,
    sales_end: ticket.sales_end ?? null,
    is_visible: ticket.is_visible,
    is_active: ticket.is_active,
    sort_order: ticket.sort_order,
  };
  const query =
    ticket.id && !ticket.id.startsWith("new-")
      ? supabase.from("ticket_types").update(payload).eq("id", ticket.id)
      : supabase.from("ticket_types").insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as AdminTicketType;
}

export async function deleteAdminTicketType(id: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("ticket_types").delete().eq("id", id);
  if (error) throw error;
}

export async function getAdminTickets() {
  if (!supabase) return [] as AdminTicket[];
  const { data, error } = await supabase.from("tickets").select("id,ticket_number,attendee_name,checked_in_at,created_at,event:events(name),ticket_type:ticket_types(name)").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as AdminTicket[];
}

export function subscribeToAdminData(onChange: () => void) {
  if (!supabase) return () => undefined;
  const channel = supabase.channel("hili-admin-realtime").on("postgres_changes", { event: "*", schema: "public", table: "events" }, onChange).on("postgres_changes", { event: "*", schema: "public", table: "ticket_types" }, onChange).on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, onChange).on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onChange).on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, onChange).subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export async function getPublishedEvents() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("events").select("*, ticket_types(*)").eq("status", "published").order("event_date");
  if (error) throw error;
  return data;
}

// ── Prestige / role helpers ────────────────────────────────────────────────

import type { UserRole } from "@shared/api";

export type MemberRole = {
  role: UserRole;
};

/** Returns the current user's role from organization_members, or null if not logged in / not a member. */
export async function getCurrentUserRole(): Promise<UserRole | null> {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const userId = sessionData.session.user.id;

  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data.role as UserRole;
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
  const data = await prestigeGet<{ order: Order }>(`/api/prestige/orders/${orderId}`);
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
