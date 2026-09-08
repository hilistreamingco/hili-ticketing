import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, Loader2 } from "lucide-react";
import Layout from "@/components/layout/Layout";
import PlaceholderPage from "@/components/PlaceholderPage";
import { Button } from "@/components/ui/button";
import { formatEventDate, formatPrice, getEventBySlug, subscribeToEvents, ticketsLeft, type HiliEvent } from "@/lib/events";

export default function TicketSelectionPage() {
  const { slug } = useParams();
  const [event, setEvent] = useState<HiliEvent | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <Layout>
      <div className="container max-w-4xl py-12 md:py-20">
        <Link to={`/events/${event.slug}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to event
        </Link>
        <div className="mt-10 grid gap-10 md:grid-cols-[.7fr_1.3fr]">
          <div>
            <img src={event.coverImage} alt={event.title} className="aspect-[4/5] w-full rounded-3xl object-cover" />
            <h1 className="mt-5 font-display text-2xl font-bold">{event.title}</h1>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p className="flex gap-2">
                <CalendarDays className="h-4 w-4" /> {formatEventDate(event.date)}
              </p>
              <p className="flex gap-2">
                <MapPin className="h-4 w-4" /> {event.venue}, {event.city}
              </p>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-primary">Step 1 / Tickets</p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Choose your tickets</h2>
            <p className="mt-3 text-muted-foreground">Select a ticket type to continue. You can choose the quantity next.</p>
            <div className="mt-8 space-y-3">
              {event.ticketTypes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                  <p className="text-sm text-muted-foreground">No tickets available yet. Check back soon!</p>
                </div>
              ) : (
                event.ticketTypes.map((ticket) => (
                  <div key={ticket.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div>
                      <h3 className="font-display font-semibold">{ticket.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{ticket.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{ticketsLeft(ticket)} available</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-bold">{formatPrice(ticket.price)}</p>
                      <Button asChild size="sm" className="mt-3">
                        <Link to={`/attendee/${event.slug}?ticket=${ticket.id}`}>
                          Select <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
