/**
 * Event data fetching — all data comes from Supabase, no mock/stock data.
 *
 * Every event is just an event: there is no "current" or "upcoming" slot.
 * What the buyer can do (sales open, closed, sold out) is decided by the
 * database (public.event_sales_overview), so the pages and the order API agree.
 */
import { supabase } from "./supabase";
import { formatNairobi } from "./time";

export interface EventTheme {
  mode: "light" | "dark";
  primary: string;
  background: string;
  foreground: string;
  card: string;
  radius: string;
}

export type SalesState = "open" | "not_started" | "sold_out" | "closed";
export type TierState = "on_sale" | "not_started" | "ended" | "sold_out";

export interface TicketType {
  id: string;
  name: string;
  description: string;
  price: number;
  quantityTotal: number;
  quantitySold: number;
  minPerOrder: number;
  maxPerOrder: number;
  salesStart: string | null;
  salesEnd: string | null;
  state: TierState;
  /** Tickets left, or null when the tier has no limit. */
  remaining: number | null;
}

export interface PriceBracket {
  fromSeat: number;
  price: number;
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
  popular?: boolean;
  attendeeCount: number;
  // multi-event / cinema / sales
  eventType: "general" | "cinema";
  pricingMode: "tiers" | "seats_taken";
  seatLayoutId: string | null;
  maxSeatsPerOrder: number;
  salesCloseAt: string | null;
  salesState: SalesState;
  brackets: PriceBracket[];
  seatsTotal: number;
  seatsTaken: number;
}

export const categories = [
  "Nightlife",
  "Music",
  "Business",
  "Festival",
  "Comedy",
  "Food & Drink",
] as const;

// ── Mapping ────────────────────────────────────────────────────────────────────

type SalesOverview = {
  state: SalesState;
  sales_close_at: string | null;
  pricing_mode: "tiers" | "seats_taken";
  tiers: Array<{ id: string; state: TierState | "hidden"; remaining: number | null }>;
  seats_total: number;
  seats_taken: number;
} | null;

/** Dates-only fallback, used when the sales RPC is unavailable. Mirrors public.tier_state(). */
function localTierState(t: { sales_start: string | null; sales_end: string | null }): TierState {
  const now = Date.now();
  if (t.sales_start && now < new Date(t.sales_start).getTime()) return "not_started";
  if (t.sales_end && now >= new Date(t.sales_end).getTime()) return "ended";
  return "on_sale";
}

function mapEvent(ev: any, overview: SalesOverview, listState?: SalesState): HiliEvent {
  const tierRows = ((ev.ticket_types ?? []) as any[])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.price_kes - b.price_kes);
  const tierInfo = new Map((overview?.tiers ?? []).map((t) => [t.id, t]));

  const ticketTypes: TicketType[] = tierRows.map((t) => {
    const info = tierInfo.get(t.id);
    const state = (info?.state && info.state !== "hidden" ? info.state : localTierState(t)) as TierState;
    return {
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      price: t.price_kes,
      quantityTotal: t.quantity_total,
      quantitySold: t.quantity_sold ?? 0,
      minPerOrder: t.min_per_order ?? 1,
      maxPerOrder: t.max_per_order ?? 6,
      salesStart: t.sales_start ?? null,
      salesEnd: t.sales_end ?? null,
      state,
      remaining: info ? info.remaining : null,
    };
  });

  const brackets: PriceBracket[] = ((ev.event_price_brackets ?? []) as any[])
    .map((b) => ({ fromSeat: b.from_seat as number, price: b.price_kes as number }))
    .sort((a, b) => a.fromSeat - b.fromSeat);

  const pricingMode = (overview?.pricing_mode ?? ev.pricing_mode ?? "tiers") as "tiers" | "seats_taken";

  // Without the RPC (migration not run yet) assume open when something is for sale.
  const fallbackState: SalesState =
    pricingMode === "seats_taken" ? (brackets.length ? "open" : "closed")
      : ticketTypes.some((t) => t.state === "on_sale") ? "open"
      : ticketTypes.some((t) => t.state === "not_started") ? "not_started" : "closed";

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
    organizer: { name: "Hili Streaming", avatar: "/favicon.svg" },
    ageRestriction: "18+",
    policies: [
      "Valid ID required for entry",
      "No refunds after purchase",
      "Ticket is non-transferable",
      "Event is subject to change",
    ],
    theme: (ev.theme as EventTheme) && Object.keys(ev.theme ?? {}).length
      ? (ev.theme as EventTheme)
      : {
          mode: "dark",
          primary: "#c1ff1a",
          background: "#0b0b0b",
          foreground: "#ffffff",
          card: "#1a1a1a",
          radius: "1rem",
        },
    ticketTypes,
    popular: false,
    attendeeCount: ticketTypes.reduce((sum, t) => sum + t.quantitySold, 0),
    eventType: (ev.event_type as "general" | "cinema") ?? "general",
    pricingMode,
    seatLayoutId: (ev.seat_layout_id as string) ?? null,
    maxSeatsPerOrder: (ev.max_seats_per_order as number) ?? 6,
    salesCloseAt: (overview?.sales_close_at ?? ev.sales_close_at ?? null) as string | null,
    salesState: overview?.state ?? listState ?? fallbackState,
    brackets,
    seatsTotal: overview?.seats_total ?? 0,
    seatsTaken: overview?.seats_taken ?? 0,
  };
}

const EVENT_SELECT = "*, ticket_types(*), event_price_brackets(from_seat, price_kes)";

// ── Dates ──────────────────────────────────────────────────────────────────────

/** Today's date in Nairobi as YYYY-MM-DD. */
export function nairobiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
}

export function isPastEvent(event: HiliEvent): boolean {
  return Boolean(event.date) && event.date < nairobiToday();
}

/** Upcoming events soonest first, then past ones (most recent first). */
export function sortEvents(list: HiliEvent[]): HiliEvent[] {
  const key = (e: HiliEvent) => `${e.date || "9999-12-31"}T${e.startTime || "00:00"}`;
  const upcoming = list.filter((e) => !isPastEvent(e)).sort((a, b) => key(a).localeCompare(key(b)));
  const past = list.filter(isPastEvent).sort((a, b) => key(b).localeCompare(key(a)));
  return [...upcoming, ...past];
}

/** Keeps the order of a sorted list and groups events that share a date. */
export function groupEventsByDate(list: HiliEvent[]): { date: string; events: HiliEvent[] }[] {
  const groups: { date: string; events: HiliEvent[] }[] = [];
  for (const ev of list) {
    const last = groups[groups.length - 1];
    if (last && last.date === ev.date) last.events.push(ev);
    else groups.push({ date: ev.date, events: [ev] });
  }
  return groups;
}

// ── Fetch all published events from Supabase ──────────────────────────────────
export async function getEvents(): Promise<HiliEvent[]> {
  if (!supabase) return [];

  const { data: eventsData, error: eventsError } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("status", "published");

  if (eventsError || !eventsData) {
    console.error("Error fetching events:", eventsError);
    return [];
  }

  let states: Record<string, SalesState> = {};
  try {
    const { data } = await supabase.rpc("event_sales_states", { p_events: eventsData.map((e) => e.id) });
    if (data && typeof data === "object") states = data as Record<string, SalesState>;
  } catch {
    // migration not applied yet: fall back to the local guess
  }

  return sortEvents(eventsData.map((ev) => mapEvent(ev, null, states[ev.id])));
}

// ── Get single event by slug ───────────────────────────────────────────────────
export async function getEventBySlug(slug: string): Promise<HiliEvent | null> {
  if (!supabase) return null;

  const { data: ev, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !ev) {
    if (error) console.error("Error fetching event by slug:", slug, error);
    return null;
  }

  let overview: SalesOverview = null;
  try {
    const { data } = await supabase.rpc("event_sales_overview", { p_event: ev.id });
    overview = (data ?? null) as SalesOverview;
  } catch {
    // migration not applied yet
  }

  return mapEvent(ev, overview);
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

// ── Helper functions ───────────────────────────────────────────────────────────
export function formatEventDate(dateStr: string): string {
  if (!dateStr) return "Date TBA";
  const date = new Date(`${dateStr}T00:00:00`);
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

export function formatPrice(price: number): string {
  if (price === 0) return "Free";
  return `KES ${price.toLocaleString("en-KE")}`;
}

/** The price the next seat sells for in "seats taken" pricing. */
export function priceForNextSeat(brackets: PriceBracket[], seatsTaken: number): number | null {
  const next = seatsTaken + 1;
  let price: number | null = null;
  for (const b of brackets) if (b.fromSeat <= next) price = b.price;
  return price;
}

export function startingPrice(event: HiliEvent): string {
  if (event.pricingMode === "seats_taken" && event.eventType === "cinema") {
    if (!event.brackets.length) return "TBA";
    return formatPrice(Math.min(...event.brackets.map((b) => b.price)));
  }
  if (!event.ticketTypes.length) return "TBA";
  const live = event.ticketTypes.filter((t) => t.state === "on_sale" || t.state === "not_started");
  const pool = live.length ? live : event.ticketTypes;
  return formatPrice(Math.min(...pool.map((t) => t.price)));
}

export function ticketsLeft(ticketType: TicketType): number | null {
  return ticketType.remaining;
}

/** Text and tone for the sales state shown on cards and the event page. */
export function salesStatus(event: HiliEvent): { label: string; canBuy: boolean } {
  switch (event.salesState) {
    case "open":
      return { label: event.salesCloseAt ? `Sales close ${formatNairobi(event.salesCloseAt)}` : "On sale", canBuy: true };
    case "not_started":
      return { label: "Sales open soon", canBuy: false };
    case "sold_out":
      return { label: "Sold out", canBuy: false };
    default:
      return { label: "Sales closed", canBuy: false };
  }
}

/** One line describing a tier's window, for the ticket page. */
export function tierWindowText(t: TicketType): string {
  switch (t.state) {
    case "on_sale":
      return t.salesEnd ? `Available until ${formatNairobi(t.salesEnd)}` : "Available now";
    case "not_started":
      return t.salesStart ? `Starts ${formatNairobi(t.salesStart)}` : "Not on sale yet";
    case "ended":
      return "Sales for this ticket have ended";
    default:
      return "Sold out";
  }
}
