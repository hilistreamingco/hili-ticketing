/**
 * Seat map data for cinema events: the fixed layout, which seats are taken,
 * live updates, and the hold a buyer gets while they pay.
 *
 * Storage strategy:
 *   - SESSIONSTORAGE: the hold TOKEN (security sensitive; SHA-256 hashed before DB)
 *   - LOCALSTORAGE: the SeatOrder (chosen seats / tier / price / expires) so a buyer
 *                   can leave to pay via the M-Pesa app, close the tab, reopen, and
 *                   not have to start from zero.
 * Seats are NEVER locked permanently until the buyer submits a paid order
 * ("I've Completed Payment" button). The 20-minute soft hold is a courtesy lock;
 * expired holds are removed server-side by migration 014 RPC (see supabase/014_*.sql).
 */
import { supabase } from "./supabase";

export interface SeatLayoutRow {
  label: string;
  count: number;
  section: string;
  /** Seat widths this row starts in from the left (rows are right-aligned like the blueprint). */
  offset?: number;
}

export interface SeatLayoutConfig {
  rows: SeatLayoutRow[];
  aisle_after_row?: string;
  screen?: string;
  exits?: Array<{ name: string; position: string }>;
}

export interface Seat {
  id: string;
  row_label: string;
  seat_number: number;
  label: string;
  section: string;
}

export type SeatStatus = "held" | "sold" | "blocked";

export async function getSeatLayout(layoutId: string): Promise<{ config: SeatLayoutConfig; seats: Seat[] } | null> {
  if (!supabase) return null;
  const [layout, seats] = await Promise.all([
    supabase.from("seat_layouts").select("config").eq("id", layoutId).maybeSingle(),
    supabase.from("seats").select("id, row_label, seat_number, label, section").eq("layout_id", layoutId).limit(1000),
  ]);
  if (layout.error || !layout.data || seats.error || !seats.data) return null;
  return { config: layout.data.config as SeatLayoutConfig, seats: seats.data as Seat[] };
}

/** seat id -> status for every seat that is not free (expired soft holds are already hidden by the database). */
export async function getTakenSeats(eventId: string): Promise<Map<string, SeatStatus>> {
  const map = new Map<string, SeatStatus>();
  if (!supabase) return map;

  try {
    // Use the server RPC if available — it also hides seat_holds attached to
    // pending/processing cinema orders older than 24h (auto-canceled stale orders).
    // Falls back to the direct client query when the RPC isn't deployed yet.
    const rpc = await supabase.rpc("get_taken_seats", { p_event: eventId });
    if (rpc.error) throw rpc.error;
    const rows = Array.isArray(rpc.data) ? rpc.data : [];
    for (const row of rows) map.set((row as any).seat_id as string, (row as any).status as SeatStatus);
    return map;
  } catch {
    // Fallback: direct table query (the old behaviour, still works without the 011 migration)
    const { data } = await supabase
      .from("seat_reservations")
      .select("seat_id, status")
      .eq("event_id", eventId)
      .limit(1000);
    for (const row of data ?? []) map.set(row.seat_id as string, row.status as SeatStatus);
    return map;
  }
}

export function subscribeToSeatReservations(eventId: string, callback: () => void) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`seat-reservations-${eventId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "seat_reservations", filter: `event_id=eq.${eventId}` },
      callback,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// ── Hold token: identifies this browser's holds. Only its hash is stored.
// Written to sessionStorage first; also mirrored in localStorage so the same
// buyer can close a tab, open a new one, and keep their in-flight seat lock.
// (Abandoned locks expire server-side via migration 014 anyway; this only
//  makes the buyer's own life easier when they leave for M-Pesa.)
const TOKEN_KEY = "hili-seat-token";
const TOKEN_KEY_LOCAL = "hili-seat-token-local";
let memoryToken: string | null = null;

export function getHoldToken(): string {
  try {
    let token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY_LOCAL);
    if (!token || token.length < 16) {
      token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
      sessionStorage.setItem(TOKEN_KEY, token);
      try { localStorage.setItem(TOKEN_KEY_LOCAL, token); } catch { /* private mode */ }
    } else {
      // make sure session has a copy too
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
    }
    return token;
  } catch {
    if (!memoryToken) memoryToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    return memoryToken;
  }
}

export function clearHoldToken(): void {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(TOKEN_KEY_LOCAL); } catch { /* ignore */ }
  memoryToken = null;
}

// One flat shape (not a union): the project compiles with strictNullChecks off,
// where TypeScript cannot narrow a union on ok: true / false.
export interface HoldResult {
  ok: boolean;
  expiresAt?: string;
  unitPrice?: number | null;
  code?: string;
  seatId?: string;
  message?: string;
}

const ERROR_TEXT: Record<string, string> = {
  SEAT_TAKEN: "Sorry, one of those seats was just taken. It has been removed from your selection.",
  SALES_CLOSED: "Sales for this event are closed.",
  BAD_SEAT_COUNT: "Please choose a valid number of seats.",
  DUPLICATE_SEAT: "A seat was selected twice.",
  BAD_SEAT: "One of those seats is not part of this cinema.",
  NO_PRICE_CONFIGURED: "Ticket prices have not been set up for this event yet.",
  EVENT_NOT_SEATED: "This event does not have a seat map.",
};

export function parseSeatError(raw: string): { code: string; seatId?: string; message: string } {
  const taken = /SEAT_TAKEN:([0-9a-f-]{36})/i.exec(raw);
  if (taken) return { code: "SEAT_TAKEN", seatId: taken[1], message: ERROR_TEXT.SEAT_TAKEN };
  for (const code of Object.keys(ERROR_TEXT)) {
    if (raw.includes(code)) return { code, message: ERROR_TEXT[code] };
  }
  return { code: "ERROR", message: "Could not hold your seats. Please try again." };
}

export async function holdSeats(eventId: string, seatIds: string[]): Promise<HoldResult> {
  if (!supabase) return { ok: false, code: "ERROR", message: "The site is not configured." };
  const { data, error } = await supabase.rpc("hold_seats", {
    p_event: eventId,
    p_seat_ids: seatIds,
    p_token: getHoldToken(),
    p_minutes: 20,
  });
  if (error) return { ok: false, ...parseSeatError(error.message) };
  const result = data as { expires_at: string; unit_price_kes: number | null };
  return { ok: true, expiresAt: result.expires_at, unitPrice: result.unit_price_kes ?? null };
}

export async function releaseSeats(eventId: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc("release_seats", { p_event: eventId, p_token: getHoldToken() });
}

export async function releaseExpiredHolds(eventId?: string): Promise<void> {
  if (!supabase) return;
  // Client-side RPC: drop ALL expired/abandoned/cancelled seat holds
  // (p_event=null cleans every event, p_event set cleans only the given one)
  try {
    await supabase.rpc("release_expired_seat_holds", { p_event: eventId ?? null });
  } catch {
    // fall back to the existing 24h cleanup endpoint
    try { await fetch("/api/x/cleanup-stale-orders", { method: "POST" }); } catch { /* ignore */ }
  }
}

// ── The buyer's current selection, kept between pages ──────────────────────────
export interface SeatOrder {
  eventId: string;
  slug: string;
  seatIds: string[];
  labels: string[];
  unitPrice: number | null;
  tierId: string | null;
  expiresAt: string;
}

const orderKeySession = (slug: string) => `hili-seat-order-${slug}`;
const orderKeyLocal    = (slug: string) => `hili-seat-order-local-${slug}`;

export function saveSeatOrder(order: SeatOrder) {
  const payload = JSON.stringify(order);
  try { sessionStorage.setItem(orderKeySession(order.slug), payload); } catch { /* ignore */ }
  try { localStorage.setItem(orderKeyLocal(order.slug), payload); }   catch { /* private mode: user picks again */ }
}

export function loadSeatOrder(slug: string): SeatOrder | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(orderKeySession(slug))
       || localStorage.getItem(orderKeyLocal(slug));
  } catch { /* ignore */ }
  if (!raw) return null;
  try {
    const order = JSON.parse(raw) as SeatOrder;
    if (!Array.isArray(order.seatIds) || order.seatIds.length === 0) return null;
    // Mirror back: if only local had it, keep the session cache warm too.
    try { sessionStorage.setItem(orderKeySession(slug), raw); } catch { /* ignore */ }
    return order;
  } catch {
    return null;
  }
}

export function clearSeatOrder(slug: string) {
  try { sessionStorage.removeItem(orderKeySession(slug)); } catch { /* ignore */ }
  try { localStorage.removeItem(orderKeyLocal(slug)); }   catch { /* ignore */ }
}

export function holdIsActive(order: SeatOrder | null): boolean {
  return Boolean(order) && Date.parse(order!.expiresAt) > Date.now();
}
