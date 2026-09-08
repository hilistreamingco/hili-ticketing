import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Minus, Plus } from "lucide-react";
import Layout from "@/components/layout/Layout";
import PlaceholderPage from "@/components/PlaceholderPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice, getEventBySlug, subscribeToEvents, type HiliEvent } from "@/lib/events";

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

  const ticketId = searchParams.get("ticket");
  const ticket = event?.ticketTypes.find((t) => t.id === ticketId) || event?.ticketTypes[0];
  const total = (ticket?.price || 0) * quantity;
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

  if (!event || !ticket) {
    return <PlaceholderPage title="Ticket unavailable" description="Please return to the event and choose another ticket." />;
  }

  const updateQuantity = (next: number) => {
    const value = Math.max(1, Math.min(ticket.maxPerOrder, next));
    setQuantity(value);
    setNames((current) => Array.from({ length: value }, (_, index) => current[index] || ""));
  };

  const checkoutUrl = () => {
    const params = new URLSearchParams({
      ticket: ticket.id,
      quantity: String(quantity),
      email,
      names: JSON.stringify(names),
    });
    return `/checkout/${event.slug}?${params.toString()}`;
  };

  return (
    <Layout>
      <div className="container max-w-3xl py-12 md:py-20">
        <Link to={`/tickets/${event.slug}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to tickets
        </Link>
        <p className="mt-10 text-[10px] font-semibold uppercase tracking-[.3em] text-primary">Step 2 / Attendee details</p>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight">Attendee details</h1>
            <p className="mt-2 text-muted-foreground">Please enter the name for each ticket.</p>
          </div>
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
        </div>
        <div className="mt-8 space-y-3">
          {names.map((name, index) => (
            <div key={index} className="rounded-2xl border border-border bg-card p-5">
              <label className="text-sm font-semibold">Attendee {index + 1}</label>
              <Input
                className="mt-3"
                placeholder="Full name"
                value={name}
                onChange={(event) =>
                  setNames((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                }
                required
              />
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-2xl border border-border bg-card p-5">
          <label className="text-sm font-semibold">Email address</label>
          <Input className="mt-3" type="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <p className="mt-2 text-xs text-muted-foreground">Your tickets will be sent to this email address after payment.</p>
        </div>
        <div className="mt-8 flex items-center justify-between rounded-2xl bg-muted p-5">
          <div>
            <p className="text-sm text-muted-foreground">Total</p>
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
