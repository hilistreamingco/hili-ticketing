import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Loader2, MapPin } from "lucide-react";
import Layout from "@/components/layout/Layout";
import PlaceholderPage from "@/components/PlaceholderPage";
import EventCard from "@/components/EventCard";
import { formatEventDate, formatEventTime, salesStatus, startingPrice, type HiliEvent } from "@/lib/events";
import { getCampaignBySlug, type Campaign } from "@/lib/campaigns";

function CampaignEventRow({ event }: { event: HiliEvent }) {
  const sales = salesStatus(event);
  const isGate = event.eventType === "gate";
  return (
    <Link
      to={`/events/${event.slug}`}
      className="group flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 sm:flex-row sm:items-center"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            {event.eventType === "cinema" ? "Cinema" : event.eventType === "gate" ? "Gate" : "General"}
          </span>
          <h3 className="font-display text-lg font-semibold truncate">{event.title}</h3>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {formatEventDate(event.date)} · {formatEventTime(event.startTime)}
          </span>
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{event.venue}</span>
          </span>
        </div>
        {event.shortDescription && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{event.shortDescription}</p>
        )}
      </div>
      <div className="flex items-center justify-between sm:flex-col sm:items-end sm:gap-2">
        <span className="text-sm font-semibold">
          {isGate
            ? event.gatePriceText || "At the gate"
            : sales.canBuy
              ? `From ${startingPrice(event)}`
              : sales.label}
        </span>
        <span className="text-xs text-primary font-semibold group-hover:underline">View event →</span>
      </div>
    </Link>
  );
}

export default function CampaignPage() {
  const { slug } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    void getCampaignBySlug(slug).then((c) => {
      if (active) {
        setCampaign(c);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [slug]);

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!campaign) {
    return <PlaceholderPage title="Campaign not found" description="This event campaign may have ended or been removed." />;
  }

  const publishedEvents = campaign.events.filter((e) => e);
  const upcoming = publishedEvents.filter((e) => {
    const today = new Date().toISOString().slice(0, 10);
    return !e.date || e.date >= today;
  });
  const past = publishedEvents.filter((e) => e.date && e.date < new Date().toISOString().slice(0, 10));

  return (
    <Layout>
      <div className="container max-w-4xl py-12 md:py-20">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to all events
        </Link>

        {campaign.posterPath && (
          <div className="mt-8 overflow-hidden rounded-3xl border border-border">
            <img src={campaign.posterPath} alt={campaign.name} className="h-auto w-full object-cover" />
          </div>
        )}

        <p className="mt-8 text-[10px] font-semibold uppercase tracking-[.3em] text-primary">Event campaign</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-5xl">{campaign.name}</h1>
        {campaign.shortDescription && (
          <p className="mt-4 text-lg text-muted-foreground">{campaign.shortDescription}</p>
        )}
        {campaign.description && (
          <p className="mt-4 leading-7 text-muted-foreground whitespace-pre-line">{campaign.description}</p>
        )}

        {upcoming.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold">Choose your experience</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each event below is booked separately. Pick the one you want and follow it through to payment.
            </p>
            <div className="mt-6 space-y-4">
              {upcoming.map((e) => <CampaignEventRow key={e.id} event={e} />)}
            </div>
          </section>
        )}

        {past.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-xl font-bold text-muted-foreground">Past events in this campaign</h2>
            <div className="mt-4 space-y-4 opacity-70">
              {past.map((e) => <CampaignEventRow key={e.id} event={e} />)}
            </div>
          </section>
        )}

        {publishedEvents.length === 0 && (
          <p className="mt-12 text-muted-foreground">No events are published in this campaign yet. Check back soon.</p>
        )}

        <div className="mt-12">
          <h2 className="font-display text-2xl font-bold">Posters</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        </div>
      </div>
    </Layout>
  );
}
