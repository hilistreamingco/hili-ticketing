import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, Loader2, MapPin, TriangleAlert } from "lucide-react";
import Layout from "@/components/layout/Layout";
import PlaceholderPage from "@/components/PlaceholderPage";
import SeatMap from "@/components/SeatMap";
import { Button } from "@/components/ui/button";
import {
  formatEventDate,
  formatEventTime,
  formatPrice,
  getEventBySlug,
  priceForNextSeat,
  salesStatus,
  subscribeToEvents,
  tierWindowText,
  type HiliEvent,
} from "@/lib/events";
import {
  getSeatLayout,
  getTakenSeats,
  holdIsActive,
  holdSeats,
  loadSeatOrder,
  saveSeatOrder,
  subscribeToSeatReservations,
  type Seat,
  type SeatLayoutConfig,
  type SeatStatus,
} from "@/lib/seats";

export default function SeatSelectionPage() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState<HiliEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<{ config: SeatLayoutConfig; seats: Seat[] } | null>(null);
  const [layoutFailed, setLayoutFailed] = useState(false);
  const [taken, setTaken] = useState<Map<string, SeatStatus>>(new Map());
  const [selected, setSelected] = useState<string[]>([]);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [tierId, setTierId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const restored = useRef(false);

  // Event (with live sales state)
  useEffect(() => {
    if (!slug) return;
    let active = true;
    const load = async () => {
      const ev = await getEventBySlug(slug);
      if (active) { setEvent(ev); setLoading(false); }
    };
    void load();
    const unsub = subscribeToEvents(() => void load());
    return () => { active = false; unsub(); };
  }, [slug]);

  // Seat layout (fixed)
  useEffect(() => {
    if (!event?.seatLayoutId) return;
    let active = true;
    void getSeatLayout(event.seatLayoutId).then((l) => {
      if (!active) return;
      if (l) setLayout(l); else setLayoutFailed(true);
    });
    return () => { active = false; };
  }, [event?.seatLayoutId]);

  // Taken seats: live, with a slow refetch so expired holds free up on screen.
  // Also, on the very first refresh, fire a best-effort cleanup: cinema orders
  // that have been pending for >24h get cancelled and their seats are released
  // for other buyers (RPC is idempotent, safe to call many times).
  const eventId = event?.id;
  const firstCleanup = useRef(false);
  const refreshTaken = useCallback(async () => {
    if (!eventId) return;
    if (!firstCleanup.current) {
      firstCleanup.current = true;
      void fetch("/api/x/cleanup-stale-orders", { method: "POST" }).catch(() => undefined);
    }
    setTaken(await getTakenSeats(eventId));
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    void refreshTaken();
    const unsub = subscribeToSeatReservations(eventId, () => void refreshTaken());
    const timer = setInterval(() => void refreshTaken(), 30_000);
    return () => { unsub(); clearInterval(timer); };
  }, [eventId, refreshTaken]);

  // Coming back from the next page: the seats are still held for this buyer
  useEffect(() => {
    if (restored.current || !slug || !layout) return;
    restored.current = true;
    const prior = loadSeatOrder(slug);
    if (prior && holdIsActive(prior)) {
      setSelected(prior.seatIds);
      setMine(new Set(prior.seatIds));
      setTierId(prior.tierId);
    }
  }, [slug, layout]);

  const seatById = useMemo(() => new Map((layout?.seats ?? []).map((s) => [s.id, s])), [layout]);

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-black/30" /></div>
      </Layout>
    );
  }
  if (!event) return <PlaceholderPage title="Event not found" description="This event is no longer available." />;
  if (event.eventType === "gate") return <Navigate to={`/events/${event.slug}`} replace />;
  if (event.eventType !== "cinema") return <Navigate to={`/tickets/${event.slug}`} replace />;

  const status = salesStatus(event);
  const max = event.maxSeatsPerOrder;
  const seatsMode = event.pricingMode === "seats_taken";
  const onSaleTiers = event.ticketTypes.filter((t) => t.state === "on_sale");
  const tier = event.ticketTypes.find((t) => t.id === tierId && t.state === "on_sale") ?? null;

  // Others' seats only: the buyer's own hold must not push the price up.
  const takenByOthers = [...taken.entries()].filter(([id, s]) => s !== "blocked" && !mine.has(id)).length;
  const unitPrice = seatsMode ? priceForNextSeat(event.brackets, takenByOthers) : tier?.price ?? null;
  const total = unitPrice !== null ? unitPrice * selected.length : null;

  const toggle = (seat: Seat) => {
    setMessage(null);
    if (selected.includes(seat.id)) {
      setSelected(selected.filter((id) => id !== seat.id));
    } else if (selected.length >= max) {
      setMessage(`You can book up to ${max} seats in one order.`);
    } else {
      setSelected([...selected, seat.id]);
    }
  };

  const canContinue = status.canBuy && selected.length > 0 && (seatsMode ? unitPrice !== null : Boolean(tier)) && !holding;

  const onContinue = async () => {
    if (!canContinue) return;
    setHolding(true);
    setMessage(null);
    const result = await holdSeats(event.id, selected);
    setHolding(false);

    if (!result.ok) {
      setMessage(result.message);
      if (result.code === "SEAT_TAKEN" && result.seatId) {
        setSelected((sel) => sel.filter((id) => id !== result.seatId));
      }
      void refreshTaken();
      return;
    }

    saveSeatOrder({
      eventId: event.id,
      slug: event.slug,
      seatIds: selected,
      labels: selected.map((id) => seatById.get(id)?.label ?? ""),
      unitPrice: result.unitPrice ?? unitPrice ?? null,
      tierId: seatsMode ? null : tierId,
      expiresAt: result.expiresAt as string,
    });
    navigate(`/attendee/${event.slug}?mode=seats`);
  };

  return (
    <Layout>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:py-16 lg:px-8">
        <Link to={`/events/${event.slug}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to event
        </Link>

        <p className="mt-6 text-[10px] font-semibold uppercase tracking-[.3em] text-primary md:mt-8">Step 1 / Seats</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">Choose your seats</h1>
        <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-1">
          <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {formatEventDate(event.date)}{event.startTime ? ` · ${formatEventTime(event.startTime)}` : ""}</span>
          <span className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {event.venue}{event.city ? `, ${event.city}` : ""}</span>
        </div>

        {!status.canBuy && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <TriangleAlert className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{status.label}</p>
              <p className="mt-0.5">You can look at the seating plan, but seats can't be booked right now.</p>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6 md:mt-8 md:gap-8 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            {layoutFailed && (
              <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                The seating plan could not be loaded. Please refresh the page.
              </p>
            )}
            {!layoutFailed && !layout && (
              <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-black/30" /></div>
            )}
            {layout && (
              <SeatMap
                config={layout.config}
                seats={layout.seats}
                taken={taken}
                selected={selected}
                mine={mine}
                disabled={!status.canBuy}
                onToggle={toggle}
              />
            )}
          </div>

          <aside className="lg:order-last">
            <div className="space-y-4 rounded-3xl border border-border bg-card p-5 md:p-6
                            lg:sticky lg:top-24
                            fixed bottom-0 left-0 right-0 z-30 lg:static
                            rounded-t-2xl rounded-b-none border-b-0 lg:rounded-3xl lg:border-b
                            shadow-[0_-8px_30px_rgba(0,0,0,0.08)] lg:shadow-none
                            pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-6
                            max-h-[55vh] lg:max-h-[calc(100vh-7rem)] overflow-y-auto">
              {!seatsMode && (
                <div>
                  <p className="text-sm font-semibold">Ticket type</p>
                  <div className="mt-2 space-y-2">
                    {event.ticketTypes.length === 0 && <p className="text-sm text-muted-foreground">No tickets are on sale yet.</p>}
                    {event.ticketTypes.map((t) => {
                      const available = t.state === "on_sale";
                      return (
                        <button key={t.id} type="button" disabled={!available} onClick={() => setTierId(t.id)}
                          className={`w-full rounded-xl border p-3 text-left text-sm transition-colors ${tierId === t.id ? "border-foreground bg-muted" : "border-border"} ${available ? "hover:border-foreground/50" : "cursor-not-allowed opacity-50"}`}>
                          <span className="flex items-center justify-between gap-3 font-semibold">
                            {t.name}<span>{formatPrice(t.price)}</span>
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{tierWindowText(t)}</span>
                          {t.description && <span className="mt-1 block text-xs text-muted-foreground">{t.description}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {onSaleTiers.length === 0 && event.ticketTypes.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">No ticket type is on sale right now.</p>
                  )}
                </div>
              )}

              <div>
                <p className="text-sm font-semibold">Your seats <span className="font-normal text-muted-foreground">({selected.length}/{max})</span></p>
                {selected.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Tap a seat on the map to select it.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.map((id) => (
                      <button key={id} type="button" onClick={() => setSelected(selected.filter((s) => s !== id))}
                        className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground" title="Tap to remove">
                        {seatById.get(id)?.label ?? "?"} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4">
                {unitPrice !== null ? (
                  <>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Price per seat</span><span>{formatPrice(unitPrice)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <span className="font-display text-2xl font-bold">{total !== null ? formatPrice(total) : "—"}</span>
                    </div>
                    {seatsMode && <p className="mt-2 text-xs text-muted-foreground">The price rises as seats are taken. You pay the price shown when you continue.</p>}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{seatsMode ? "Prices are not available yet." : "Choose a ticket type to see the price."}</p>
                )}
              </div>

              {message && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}

              <Button onClick={() => void onContinue()} disabled={!canContinue} className="h-12 w-full">
                {holding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Holding your seats…</> : <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
              <p className="text-center text-xs text-muted-foreground pb-2 lg:pb-0">Your seats are held for 20 minutes while you pay.</p>
            </div>
            {/* Spacer so mobile content above bottom-fixed card isn't hidden */}
            <div className="h-[260px] w-full lg:hidden" aria-hidden="true" />
          </aside>
        </div>
      </div>
    </Layout>
  );
}
