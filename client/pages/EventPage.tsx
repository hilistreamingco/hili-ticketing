import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Layout from "@/components/layout/Layout";
import PlaceholderPage from "@/components/PlaceholderPage";
import { formatEventDate, formatEventTime, formatPrice, getEventBySlug, ticketsLeft } from "@/lib/events";

export default function EventPage() {
  const { slug } = useParams();
  const event = slug ? getEventBySlug(slug) : undefined;
  const [selectedTicket, setSelectedTicket] = useState(0);
  const [quantity, setQuantity] = useState(1);

  if (!event) return <PlaceholderPage title="Event not found" description="This event may have ended or the link may be incorrect." />;

  const ticket = event.ticketTypes[selectedTicket];
  const total = ticket.price * quantity;
  const left = ticketsLeft(ticket);
  const themeVars = {
    "--event-primary": `hsl(${event.theme.primary})`,
    "--event-background": `hsl(${event.theme.background})`,
    "--event-foreground": `hsl(${event.theme.foreground})`,
    "--event-card": `hsl(${event.theme.card})`,
    "--event-radius": event.theme.radius,
  } as React.CSSProperties;

  return (
    <Layout>
      <div style={themeVars} className="bg-[var(--event-background)] text-[var(--event-foreground)]">
        <div className="container pt-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium opacity-65 transition-opacity hover:opacity-100">
            <ArrowLeft className="h-4 w-4" /> Back to discover
          </Link>
        </div>
        <section className="container pt-5">
          <div className="relative overflow-hidden rounded-[var(--event-radius)]" style={{ boxShadow: "0 20px 60px -25px rgba(0,0,0,.45)" }}>
            <img src={event.coverImage} alt={event.title} className="aspect-[16/7] w-full object-cover sm:aspect-[16/6]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 text-white md:bottom-8 md:left-9 md:right-9">
              <div>
                <span className="mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: "var(--event-primary)" }}>{event.category}</span>
                <h1 className="font-display text-3xl font-bold tracking-tight md:text-5xl">{event.title}</h1>
              </div>
              <div className="hidden shrink-0 items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-sm backdrop-blur sm:flex"><Ticket className="h-4 w-4" /> {event.attendeeCount} going</div>
            </div>
          </div>
        </section>

        <div className="container grid gap-12 py-12 lg:grid-cols-[1fr_380px] lg:gap-16">
          <div>
            <div className="grid gap-4 rounded-[var(--event-radius)] p-5 sm:grid-cols-3" style={{ backgroundColor: "var(--event-card)" }}>
              <Info icon={CalendarDays} label="Date" value={formatEventDate(event.date)} />
              <Info icon={Clock3} label="Time" value={`${formatEventTime(event.startTime)} – ${formatEventTime(event.endTime)}`} />
              <Info icon={MapPin} label="Location" value={event.venue} />
            </div>
            <div className="mt-12">
              <h2 className="font-display text-2xl font-bold">About the event</h2>
              <p className="mt-4 max-w-2xl text-base leading-8 opacity-75">{event.description}</p>
              <div className="mt-7 flex flex-wrap gap-2 text-sm opacity-75">
                <span className="rounded-full border border-current/15 px-3 py-1.5">{event.ageRestriction}</span>
                <span className="rounded-full border border-current/15 px-3 py-1.5">{event.city}</span>
                <a href={event.mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-current/15 px-3 py-1.5 hover:opacity-100">Open map <ExternalLink className="h-3 w-3" /></a>
              </div>
            </div>
            <Separator className="my-10 opacity-20" />
            <div className="flex items-center gap-3">
              <img src={event.organizer.avatar} alt={event.organizer.name} className="h-12 w-12 rounded-full object-cover" />
              <div><p className="text-xs opacity-60">Organized by</p><p className="font-semibold">{event.organizer.name}</p></div>
              <Button variant="outline" size="sm" className="ml-auto border-current/20 bg-transparent">View organizer</Button>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <div className="rounded-[var(--event-radius)] p-5 shadow-card" style={{ backgroundColor: "var(--event-card)" }}>
              <div className="mb-5 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Get your tickets</h2><span className="text-xs opacity-60">Secure checkout</span></div>
              <div className="space-y-3">
                {event.ticketTypes.map((item, index) => {
                  const itemLeft = ticketsLeft(item);
                  const isSelected = index === selectedTicket;
                  return <button key={item.id} type="button" onClick={() => { setSelectedTicket(index); setQuantity(1); }} disabled={itemLeft === 0} className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${isSelected ? "border-[var(--event-primary)] ring-2 ring-[var(--event-primary)]/20" : "border-current/10 hover:border-current/25"} ${itemLeft === 0 ? "cursor-not-allowed opacity-45" : ""}`}>
                    <span><span className="block font-semibold">{item.name}</span><span className="mt-1 block text-xs opacity-60">{itemLeft === 0 ? "Sold out" : itemLeft <= 15 ? `Only ${itemLeft} left` : item.description}</span></span>
                    <span className="font-semibold">{formatPrice(item.price)}</span>
                  </button>;
                })}
              </div>
              <div className="mt-5 flex items-center justify-between rounded-xl border border-current/10 px-4 py-3"><span className="text-sm opacity-70">Quantity</span><div className="flex items-center gap-3"><button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="flex h-7 w-7 items-center justify-center rounded-full border border-current/15 hover:bg-black/5"><Minus className="h-3.5 w-3.5" /></button><span className="w-4 text-center font-semibold">{quantity}</span><button type="button" aria-label="Increase quantity" onClick={() => setQuantity(Math.min(Math.min(ticket.maxPerOrder, left), quantity + 1))} className="flex h-7 w-7 items-center justify-center rounded-full border border-current/15 hover:bg-black/5"><Plus className="h-3.5 w-3.5" /></button></div></div>
              <div className="mt-6 flex items-center justify-between border-t border-current/10 pt-5"><span className="font-semibold">Total</span><span className="font-display text-xl font-bold">{formatPrice(total)}</span></div>
              <Button className="mt-5 h-12 w-full" style={{ backgroundColor: "var(--event-primary)" }} asChild><Link to={`/checkout/${event.slug}?ticket=${ticket.id}&quantity=${quantity}`}>Continue <ChevronRight className="h-4 w-4" /></Link></Button>
              <div className="mt-4 flex items-center justify-center gap-1.5 text-xs opacity-55"><ShieldCheck className="h-3.5 w-3.5" /> Secure M-Pesa checkout</div>
            </div>
          </aside>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur lg:hidden"><Button className="w-full" style={{ backgroundColor: "var(--event-primary)" }} onClick={() => document.querySelector("aside")?.scrollIntoView({ behavior: "smooth" })}>Get tickets from {formatPrice(Math.min(...event.ticketTypes.map((item) => item.price)))}</Button></div>
    </Layout>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return <div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--event-primary)]/10 text-[var(--event-primary)]"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs opacity-55">{label}</p><p className="truncate text-sm font-semibold">{value}</p></div></div>;
}
