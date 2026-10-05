import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Minus, Plus } from "lucide-react";
import Layout from "@/components/layout/Layout";
import PlaceholderPage from "@/components/PlaceholderPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice, getEventBySlug, salesStatus, subscribeToEvents, type HiliEvent } from "@/lib/events";
import { holdIsActive, loadSeatOrder } from "@/lib/seats";

export default function AttendeePage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const [event, setEvent] = useState<HiliEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [names, setNames] = useState([""]);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!slug) return;
    let active = true;
    const load = async () => {
      const ev = await getEventBySlug(slug);
      if (active) {
        setEvent(ev);
        setLoading(false);
      }
    };
    void load();
    const unsub = subscribeToEvents(() => void load());
    return () => { active = false; unsub(); };
  }, [slug]);

  const isCinema = event?.eventType === "cinema";
  // Seat bookings come from the seat map; the chosen seats are kept in this tab's storage.
  const seatOrder = useMemo(() => (slug && isCinema ? loadSeatOrder(slug) : null), [slug, isCinema]);
  const seatCount = seatOrder?.seatIds.length ?? 0;

  const ticketId = searchParams.get("ticket");
  const ticket = !isCinema ? event?.ticketTypes.find((t) => t.id === ticketId) : undefined;

  // Seat bookings: one name per seat. Tier bookings: start at the tier's minimum.
  useEffect(() => {
    if (isCinema && seatCount > 0) {
      setQuantity(seatCount);
      setNames((current) => Array.from({ length: seatCount }, (_, i) => current[i] || ""));
    } else if (ticket) {
      setQuantity((q) => Math.max(ticket.minPerOrder, q));
      setNames((current) => Array.from({ length: Math.max(ticket.minPerOrder, current.length) }, (_, i) => current[i] || ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCinema, seatCount, ticket?.id]);

  const unitPrice = isCinema ? seatOrder?.unitPrice ?? 0 : ticket?.price ?? 0;
  const total = unitPrice * quantity;
  const canContinue = useMemo(() => names.every((name) => name.trim()) && /^\S+@\S+\.\S+$/.test(email), [names, email]);

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-black/30" />
        </div>
      </Layout>
    );
  }

  if (!event) {
    return <PlaceholderPage title="Event not found" description="This event is no longer available." />;
  }

  if (isCinema) {
    if (!seatOrder) {
      return (
        <PlaceholderPage
          title="Choose your seats first"
          description={`Your seat selection was not found. Please pick your seats on the seating plan: /seats/${event.slug}`}
        />
      );
    }
  } else {
    const status = salesStatus(event);
    if (!ticket || ticket.state !== "on_sale" || !status.canBuy) {
      return (
        <PlaceholderPage
          title={status.canBuy ? "Ticket unavailable" : status.label}
          description="This ticket is not on sale right now. Please return to the event and choose another ticket."
        />
      );
    }
  }

  const maxAllowed = ticket
    ? (ticket.remaining !== null ? Math.min(ticket.maxPerOrder, ticket.remaining) : ticket.maxPerOrder)
    : seatCount;
  const minAllowed = ticket ? Math.min(ticket.minPerOrder, maxAllowed) : seatCount;

  const updateQuantity = (next: number) => {
    const value = Math.max(minAllowed, Math.min(maxAllowed, next));
    setQuantity(value);
    setNames((current) => Array.from({ length: value }, (_, index) => current[index] || ""));
  };

  const checkoutUrl = () => {
    const params = new URLSearchParams({
      quantity: String(quantity),
      email,
      names: JSON.stringify(names),
    });
    if (isCinema) params.set("mode", "seats");
    else params.set("ticket", ticket!.id);
    return `/checkout/${event.slug}?${params.toString()}`;
  };

  return (
    <Layout>
      <div className="container max-w-3xl py-12 md:py-20">
        <Link to={isCinema ? `/seats/${event.slug}` : `/tickets/${event.slug}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {isCinema ? "Back to seats" : "Back to tickets"}
        </Link>
        <p className="mt-10 text-[10px] font-semibold uppercase tracking-[.3em] text-primary">Step 2 / Attendee details</p>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight">Attendee details</h1>
            <p className="mt-2 text-muted-foreground">
              {isCinema ? "Please enter the name for each seat." : "Please enter the name for each ticket."}
            </p>
            {isCinema && !holdIsActive(seatOrder) && (
              <p className="mt-2 text-sm text-amber-700">Your seat hold has run out. You can still continue; we'll try to keep the same seats if they are free.</p>
            )}
          </div>
          {!isCinema && (
            <div>
              <p className="mb-2 text-sm font-semibold">Number of tickets</p>
              <div className="flex items-center gap-3 rounded-full border border-border px-3 py-2">
                <button
                  type="button"
                  onClick={() => updateQuantity(quantity - 1)}
                  aria-label="Decrease number of tickets"
                  className="rounded-full p-1 hover:bg-muted"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-5 text-center font-semibold">{quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQuantity(quantity + 1)}
                  aria-label="Increase number of tickets"
                  className="rounded-full p-1 hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="mt-8 space-y-3">
          {names.map((name, index) => (
            <div key={index} className="rounded-2xl border border-border bg-card p-5">
              <label className="text-sm font-semibold">
                {isCinema ? `Seat ${seatOrder?.labels[index] ?? index + 1}` : `Attendee ${index + 1}`}
              </label>
              <Input
                className="mt-3"
                placeholder="Full name"
                value={name}
                onChange={(e) =>
                  setNames((current) => current.map((item, itemIndex) => (itemIndex === index ? e.target.value : item)))
                }
                required
              />
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-2xl border border-border bg-card p-5">
          <label className="text-sm font-semibold">Email address</label>
          <Input className="mt-3" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <p className="mt-2 text-xs text-muted-foreground">Your tickets will be sent to this email address after payment.</p>
        </div>
        <div className="mt-8 flex items-center justify-between rounded-2xl bg-muted p-5">
          <div>
            <p className="text-sm text-muted-foreground">
              Total{isCinema ? ` · ${quantity} seat${quantity > 1 ? "s" : ""} × ${formatPrice(unitPrice)}` : ""}
            </p>
            <p className="font-display text-2xl font-bold">{formatPrice(total)}</p>
          </div>
          <Button asChild disabled={!canContinue}>
            <Link to={canContinue ? checkoutUrl() : "#"}>
              Proceed to payment <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </Layout>
  );
}
