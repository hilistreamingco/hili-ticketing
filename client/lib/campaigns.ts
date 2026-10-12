import { supabase } from "./supabase";
import { mapEvent, type HiliEvent } from "./events";

export interface Campaign {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  posterPath: string | null;
  status: "draft" | "published" | "archived";
  sortOrder: number;
  events: HiliEvent[];
}

const CAMPAIGN_SELECT =
  "id, slug, name, short_description, description, poster_path, status, sort_order, events(" +
  "*, ticket_types(*), event_price_brackets(from_seat, price_kes))";

function mapCampaign(row: any): Campaign {
  const rawEvents = Array.isArray(row.events) ? row.events : [];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description ?? "",
    description: row.description ?? "",
    posterPath: row.poster_path ?? null,
    status: (row.status as Campaign["status"]) ?? "draft",
    sortOrder: row.sort_order ?? 0,
    events: rawEvents.map((ev: any) => mapEvent(ev, null)),
  };
}

export async function getCampaigns(): Promise<Campaign[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("Error fetching campaigns:", error);
    return [];
  }
  return data.map(mapCampaign);
}

export async function getCampaignBySlug(slug: string): Promise<Campaign | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("Error fetching campaign by slug:", slug, error);
    return null;
  }
  return mapCampaign(data);
}
