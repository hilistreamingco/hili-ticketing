/**
 * Event data fetching — all data comes from Supabase, no mock/stock data.
 */
import { supabase } from "./supabase";

export interface EventTheme {
  mode: "light" | "dark";
  primary: string;
  background: string;
  foreground: string;
  card: string;
  radius: string;
}

export interface TicketType {
  id: string;
  name: string;
  description: string;
  price: number;
  quantityTotal: number;
  quantitySold: number;
  maxPerOrder: number;
}

export interface Organizer {
  name: string;
  avatar: string;
}

export interface HiliEvent {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  coverImage: string;
  logoText: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  city: string;
  address: string;
  mapUrl: string;
  organizer: Organizer;
  ageRestriction: string;
  policies: string[];
  theme: EventTheme;
  ticketTypes: TicketType[];
  featured?: boolean;
  popular?: boolean;
  attendeeCount: number;
}

export const categories = [
  "Nightlife",
  "Music",
  "Business",
  "Festival",
  "Comedy",
  "Food & Drink",
] as const;

// ── Fetch all published events from Supabase ──────────────────────────────────
export async function getEvents(): Promise<HiliEvent[]> {
  if (!supabase) return [];
  
  const { data: eventsData, error: eventsError } = await supabase
    .from("events")
    .select("*, ticket_types(*)")
    .eq("status", "published")
    .order("event_date", { ascending: false });

  if (eventsError || !eventsData) {
    console.error("Error fetching events:", eventsError);
    return [];
  }

  console.log("Fetched events with tickets:", eventsData.map(e => ({
    name: e.name,
    ticket_count: e.ticket_types?.length || 0,
    tickets: e.ticket_types?.map((t: any) => ({
      name: t.name,
      visible: t.is_visible,
      active: t.is_active
    }))
  })));

  return eventsData.map((ev): HiliEvent => {
    const tickets = (ev.ticket_types ?? []) as Array<{
      id: string;
      name: string;
      description: string | null;
      price_kes: number;
      quantity_total: number;
      quantity_sold: number;
      max_per_order: number;
    }>;

    return {
      id: ev.id as string,
      slug: ev.slug as string,
      title: (ev.name as string) ?? "Untitled Event",
      shortDescription: (ev.short_description as string) ?? "",
      description: (ev.description as string) ?? "",
      category: "Festival",
      coverImage: (ev.poster_path as string) ?? "/placeholder-event.jpg",
      logoText: ((ev.name as string) ?? "HILI").toUpperCase(),
      date: (ev.event_date as string) ?? "",
      startTime: (ev.start_time as string) ?? "",
      endTime: (ev.end_time as string) ?? "",
      venue: (ev.venue as string) ?? "",
      city: (ev.city as string) ?? "Nairobi",
      address: (ev.address as string) ?? "",
      mapUrl: (ev.venue_map_url as string) ?? "",
      organizer: {
        name: "Hili Streaming",
        avatar: "/favicon.svg",
      },
      ageRestriction: "18+",
      policies: [
        "Valid ID required for entry",
        "No refunds after purchase",
        "Ticket is non-transferable",
      ],
      theme: (ev.theme as EventTheme) ?? {
        mode: "dark",
        primary: "#c1ff1a",
        background: "#0b0b0b",
        foreground: "#ffffff",
        card: "#1a1a1a",
        radius: "1rem",
      },
      ticketTypes: tickets.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description ?? "",
        price: t.price_kes,
        quantityTotal: t.quantity_total,
        quantitySold: t.quantity_sold,
        maxPerOrder: t.max_per_order,
      })),
      featured: (ev as { is_current?: boolean }).is_current ?? false,
      popular: false,
      attendeeCount: tickets.reduce((sum, t) => sum + t.quantity_sold, 0),
    };
  });
}

// ── Get single event by slug ───────────────────────────────────────────────────
export async function getEventBySlug(slug: string): Promise<HiliEvent | null> {
  if (!supabase) return null;

  const { data: ev, error } = await supabase
    .from("events")
    .select("*, ticket_types(*)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !ev) {
    console.error("Error fetching event by slug:", slug, error);
    return null;
  }

  console.log(`Event ${slug} fetched:`, {
    name: ev.name,
    ticket_count: ev.ticket_types?.length || 0,
    tickets: ev.ticket_types?.map((t: any) => ({
      name: t.name,
      visible: t.is_visible,
      active: t.is_active,
      price: t.price_kes
    }))
  });

  const tickets = (ev.ticket_types ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    price_kes: number;
    quantity_total: number;
    quantity_sold: number;
    max_per_order: number;
  }>;

  return {
    id: ev.id as string,
    slug: ev.slug as string,
    title: (ev.name as string) ?? "Untitled Event",
    shortDescription: (ev.short_description as string) ?? "",
    description: (ev.description as string) ?? "",
    category: "Festival",
    coverImage: (ev.poster_path as string) ?? "/placeholder-event.jpg",
    logoText: ((ev.name as string) ?? "HILI").toUpperCase(),
    date: (ev.event_date as string) ?? "",
    startTime: (ev.start_time as string) ?? "",
    endTime: (ev.end_time as string) ?? "",
    venue: (ev.venue as string) ?? "",
    city: (ev.city as string) ?? "Nairobi",
    address: (ev.address as string) ?? "",
    mapUrl: (ev.venue_map_url as string) ?? "",
    organizer: {
      name: "Hili Streaming",
      avatar: "/favicon.svg",
    },
    ageRestriction: "18+",
    policies: [
      "Valid ID required for entry",
      "No refunds after purchase",
      "Ticket is non-transferable",
      "Event is subject to change",
    ],
    theme: (ev.theme as EventTheme) ?? {
      mode: "dark",
      primary: "#c1ff1a",
      background: "#0b0b0b",
      foreground: "#ffffff",
      card: "#1a1a1a",
      radius: "1rem",
    },
    ticketTypes: tickets.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      price: t.price_kes,
      quantityTotal: t.quantity_total,
      quantitySold: t.quantity_sold,
      maxPerOrder: t.max_per_order,
    })),
    featured: (ev as { is_current?: boolean }).is_current ?? false,
    popular: false,
    attendeeCount: tickets.reduce((sum, t) => sum + t.quantity_sold, 0),
  };
}

// ── Real-time subscription to events ───────────────────────────────────────────
export function subscribeToEvents(callback: () => void) {
  if (!supabase) return () => {};
  
  const channel = supabase
    .channel("events-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "events" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "ticket_types" }, callback)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

// Export empty array for backwards compatibility — use getEvents() instead
export const events: HiliEvent[] = [];


// ── Helper functions ───────────────────────────────────────────────────────────
export function formatEventDate(dateStr: string): string {
  if (!dateStr) return "Date TBA";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatEventTime(timeStr: string): string {
  if (!timeStr) return "";
  const [hours, minutes] = timeStr.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

export function startingPrice(event: HiliEvent): string {
  if (!event.ticketTypes || event.ticketTypes.length === 0) return "Free";
  const minPrice = Math.min(...event.ticketTypes.map((t) => t.price));
  if (minPrice === 0) return "Free";
  return `KES ${minPrice.toLocaleString("en-KE")}`;
}

export function formatPrice(price: number): string {
  if (price === 0) return "Free";
  return `KES ${price.toLocaleString("en-KE")}`;
}

export function ticketsLeft(ticketType: TicketType): number {
  return ticketType.quantityTotal - ticketType.quantitySold;
}
