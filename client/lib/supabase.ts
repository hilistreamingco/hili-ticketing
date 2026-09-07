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

export async function saveAdminEvent(event: Partial<AdminEvent> & { id: string }) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.from("events").update(event).eq("id", event.id).select().single();
  if (error) throw error;
  return data as AdminEvent;
}

export async function getAdminTickets() {
  if (!supabase) return [] as AdminTicket[];
  const { data, error } = await supabase.from("tickets").select("id,ticket_number,attendee_name,checked_in_at,created_at,event:events(name),ticket_type:ticket_types(name)").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as AdminTicket[];
}

export function subscribeToAdminData(onChange: () => void) {
  if (!supabase) return () => undefined;
  const channel = supabase.channel("hili-admin-realtime").on("postgres_changes", { event: "*", schema: "public", table: "events" }, onChange).on("postgres_changes", { event: "*", schema: "public", table: "ticket_types" }, onChange).on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, onChange).subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export async function getPublishedEvents() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("events").select("*, ticket_types(*)").eq("status", "published").order("event_date");
  if (error) throw error;
  return data;
}
