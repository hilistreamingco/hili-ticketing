import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Minus, Plus } from "lucide-react";
import Layout from "@/components/layout/Layout";
import PlaceholderPage from "@/components/PlaceholderPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { events, formatPrice, getEventBySlug } from "@/lib/events";

export default function AttendeePage() {
  const { slug } = useParams();
  const event = getEventBySlug(slug || events[0].slug);
  const ticket = event?.ticketTypes[0];
  const [quantity, setQuantity] = useState(1);
  const [names, setNames] = useState([""]);
  const [email, setEmail] = useState("");
  const total = (ticket?.price || 0) * quantity;
  const canContinue = useMemo(() => names.every((name) => name.trim()) && /^\S+@\S+\.\S+$/.test(email), [names, email]);
  if (!event || !ticket) return <PlaceholderPage title="Ticket unavailable" description="Please return to the event and choose another ticket." />;
  const updateQuantity = (next: number) => {
    const value = Math.max(1, Math.min(ticket.maxPerOrder, next));
    setQuantity(value);
    setNames((current) => Array.from({ length: value }, (_, index) => current[index] || ""));
  };
  const checkoutUrl = () => {
    const params = new URLSearchParams({ ticket: ticket.id, quantity: String(quantity), email, names: JSON.stringify(names) });
    return `/checkout/${event.slug}?${params.toString()}`;
  };
  return <Layout><div className="container max-w-3xl py-12 md:py-20"><Link to={`/tickets/${event.slug}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Back to tickets</Link><p className="mt-10 text-[10px] font-semibold uppercase tracking-[.3em] text-primary">Step 2 / Attendees</p><div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="font-display text-4xl font-bold tracking-tight">Who is coming?</h1><p className="mt-2 text-muted-foreground">Each ticket gets its own name and unique ticket ID.</p></div><div className="flex items-center gap-3 rounded-full border border-border px-3 py-2"><button type="button" onClick={() => updateQuantity(quantity - 1)} className="rounded-full p-1 hover:bg-muted"><Minus className="h-4 w-4" /></button><span className="min-w-5 text-center font-semibold">{quantity}</span><button type="button" onClick={() => updateQuantity(quantity + 1)} className="rounded-full p-1 hover:bg-muted"><Plus className="h-4 w-4" /></button></div></div><div className="mt-8 space-y-3">{names.map((name, index) => <div key={index} className="rounded-2xl border border-border bg-card p-5"><label className="text-sm font-semibold">Ticket holder {index + 1}</label><Input className="mt-3" placeholder="Full name" value={name} onChange={(event) => setNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} required /></div>)}</div><div className="mt-5 rounded-2xl border border-border bg-card p-5"><label className="text-sm font-semibold">Delivery email</label><Input className="mt-3" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /><p className="mt-2 text-xs text-muted-foreground">Every issued ticket will be sent here after payment is confirmed.</p></div><div className="mt-8 flex items-center justify-between rounded-2xl bg-muted p-5"><div><p className="text-sm text-muted-foreground">Total</p><p className="font-display text-2xl font-bold">{formatPrice(total)}</p></div><Button asChild disabled={!canContinue}><Link to={canContinue ? checkoutUrl() : "#"}>Continue to payment <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div></div></Layout>;
}
