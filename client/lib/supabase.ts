import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL) as string | undefined;
const anonKey = (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export async function uploadEventPoster(file: File, eventId: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${eventId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("event-posters").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("event-posters").getPublicUrl(path).data.publicUrl;
}

export async function getPublishedEvents() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("events").select("*, ticket_types(*)").eq("status", "published").order("event_date");
  if (error) throw error;
  return data;
}
