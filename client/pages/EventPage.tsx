import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CalendarDays, Clock3, ExternalLink, MapPin,
  ShieldCheck, Ticket, Loader2, CalendarClock, CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Layout from "@/components/layout/Layout";
import PlaceholderPage from "@/components/PlaceholderPage";
import { formatEventDate, formatEventTime, getEventBySlug, salesStatus, subscribeToEvents, startingPrice, type HiliEvent } from "@/lib/events";
import { formatNairobi } from "@/lib/time";

export default function EventPage() {
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
    return <PlaceholderPage title="Event not found" description="This event may have ended or the link may be incorrect." />;
  }

  const sales = salesStatus(event);
  const isCinema = event.eventType === "cinema";
  const isGate = event.eventType === "gate";
  const buyPath = isCinema ? `/seats/${event.slug}` : `/tickets/${event.slug}`;

  const themeVars = {
    "--event-primary": event.theme.primary,
    "--event-background": event.theme.background,
    "--event-foreground": event.theme.foreground,
    "--event-card": event.theme.card,
    "--event-radius": event.theme.radius,
  } as React.CSSProperties;

  // Horizontal / landscape banner (poster2). Hidden for cinema events (those use a tall
  // cover layout instead) and hidden when the image is not set — no empty gap.
  const hasCover2 = !isCinema && Boolean(event.coverImage2);
  const descriptionHTML = event.description
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((block) => {
      const trimmed = block.trim();
      const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
      const isList = lines.length >= 2 && lines.every((l) => /^([\*\-\•\d+[\.\)\]]|\w[:：]|(Item|Step|Note|What)|1\s)/.test(l) || /^[A-Z0-9]/.test(l));
      if (isList) {
        return (
          <ul key={block} className="mt-5 w-full max-w-full space-y-2 text-lg leading-8 break-words opacity-80 list-none">
            {lines.map((line, i) => (
              <li key={i} className="w-full max-w-full pl-0 break-words">
                {line.replace(/^([\*\-\•]\s*|\d+[\.\)\]]\s*)/, "")}
              </li>
            ))}
          </ul>
        );
      }
      return (
        <p key={block} className="mt-5 w-full max-w-full text-lg leading-8 whitespace-pre-wrap break-words opacity-75">
          {trimmed}
        </p>
      );
    });

  return (
    <Layout>
      <div style={themeVars} className="overflow-x-hidden bg-[var(--event-background)] text-[var(--event-foreground)]">
        <div className="container w-full max-w-full pt-6 md:pt-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium opacity-65 hover:opacity-100">
            <ArrowLeft className="h-4 w-4 shrink-0" /> Back to home
          </Link>
        </div>

        {/* Hero / posters */}
        <section className="container w-full max-w-full pt-5 pb-4 md:pt-6 md:pb-6">
          <div className="relative w-full max-w-full overflow-hidden rounded-[var(--event-radius)]">
            <img src={event.coverImage} alt={event.title} className="aspect-[16/8] w-full max-w-full object-cover sm:aspect-[16/6]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 max-w-full text-white md:bottom-8 md:left-8">
              <span
                className="mb-3 inline-flex max-w-full rounded-full px-3 py-1 text-xs font-semibold break-words"
                style={{ backgroundColor: "var(--event-primary)", color: "var(--event-foreground)" }}
              >
                {isGate ? "Hili Event · Gate entry" : event.category}
              </span>
              <h1 className="w-full max-w-full font-display text-3xl font-bold leading-tight tracking-tight break-words sm:text-4xl md:text-6xl">
                {event.title}
              </h1>
            </div>
          </div>

          {/* Horizontal / alternate banner. Rendered ONLY when set. */}
          {hasCover2 && (
            <div className="mt-5 w-full max-w-full overflow-hidden rounded-[var(--event-radius)] md:mt-6">
              <img
                src={event.coverImage2 as string}
                alt={`${event.title} — banner`}
                className="aspect-[16/6] w-full max-w-full object-cover"
              />
            </div>
          )}
        </section>

        {/* Body + sidebar */}
        <div className="container w-full max-w-full grid gap-10 pb-16 md:gap-14 md:pb-24 lg:grid-cols-[1fr_380px] lg:gap-20">
          <div className="w-full max-w-full space-y-12 md:space-y-16">
            {/* Date / time / location card */}
            <div className="w-full max-w-full grid gap-4 rounded-[var(--event-radius)] p-5 sm:gap-6 sm:grid-cols-3 sm:p-7" style={{ backgroundColor: "var(--event-card)" }}>
              {event.date && <Info icon={CalendarDays} label="Date" value={formatEventDate(event.date)} />}
              {event.startTime && event.endTime && (
                <Info icon={Clock3} label="Time" value={`${formatEventTime(event.startTime)} – ${formatEventTime(event.endTime)}`} />
              )}
              {event.venue && <Info icon={MapPin} label="Location" value={`${event.venue}, ${event.city}`} />}
            </div>

            {/* Description */}
            <section className="w-full max-w-full">
              <h2 className="w-full max-w-full font-display text-2xl font-bold break-words md:text-3xl">About this event</h2>
              <div className="w-full max-w-full">
                {event.description && descriptionHTML.length
                  ? descriptionHTML
                  : <p className="mt-5 w-full max-w-full text-lg leading-8 break-words opacity-60">More details coming soon.</p>}
              </div>
              <div className="mt-8 flex w-full max-w-full flex-wrap gap-2">
                {event.policies.map((policy) => (
                  <span key={policy} className="max-w-full rounded-full border border-current/15 px-3 py-1.5 text-xs font-medium break-words opacity-70">
                    {policy}
                  </span>
                ))}
              </div>
            </section>

            {/* Getting there / map */}
            {event.venue && event.address && (
              <section className="w-full max-w-full">
                <h2 className="w-full max-w-full font-display text-2xl font-bold break-words md:text-3xl">Getting there</h2>
                <p className="mt-3 w-full max-w-full text-sm break-words opacity-65">
                  {event.venue} · {event.address}
                </p>
                <div className="mt-6 w-full max-w-full overflow-hidden rounded-2xl border border-current/10">
                  <iframe
                    title={`${event.venue} map`}
                    src={`https://www.google.com/maps?q=${encodeURIComponent(`${event.venue}, ${event.address}`)}&output=embed`}
                    className="h-72 w-full max-w-full border-0 md:h-80"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                {event.mapUrl && (
                  <a href={event.mapUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex max-w-full items-center gap-2 text-sm font-semibold break-words hover:underline">
                    Open in Google Maps <ExternalLink className="h-4 w-4 shrink-0" />
                  </a>
                )}
              </section>
            )}

            {/* Organizer */}
            <section className="flex w-full max-w-full items-center gap-3">
              <img src={event.organizer.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-xs break-words opacity-55">Organised by</p>
                <p className="text-sm font-semibold break-words">{event.organizer.name}</p>
              </div>
            </section>
          </div>

          {/* Sidebar — sticky on desktop, inline on mobile.
              Gate events get a static "Tickets sold at the gate" card instead of the Buy CTA. */}
          <aside className="w-full max-w-full lg:order-last">
            {isGate ? (
              <div className="w-full max-w-full rounded-[var(--event-radius)] p-6 shadow-xl" style={{ backgroundColor: "var(--event-card)" }}>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "var(--event-primary)/10", color: "var(--event-primary)" }}>
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs break-words opacity-55">Entry</p>
                    <p className="w-full max-w-full font-display text-2xl font-bold leading-tight break-words">Tickets sold at the gate</p>
                  </div>
                </div>
                <Separator className="my-6 opacity-15" />

                <div className="w-full max-w-full rounded-2xl border border-current/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider break-words opacity-50">Price at the venue</p>
                  <p className="mt-1 w-full max-w-full font-display text-3xl font-bold leading-tight break-words">
                    {event.gatePriceText ? event.gatePriceText : "At the gate"}
                  </p>
                </div>

                <div className="mt-6 w-full max-w-full space-y-3 text-sm opacity-75">
                  <div className="flex items-start gap-2">
                    <CreditCard className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                    <span className="min-w-0 flex-1 break-words">Pay at the entrance on the day of the event. Cash and M-Pesa accepted at the gate.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Ticket className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                    <span className="min-w-0 flex-1 break-words">Arrive early — your spot is not reserved until you buy your ticket in person.</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-full sticky top-24 rounded-[var(--event-radius)] p-6 shadow-xl" style={{ backgroundColor: "var(--event-card)" }}>
                <div className="flex items-start gap-3">
                  <Ticket className="h-5 w-5 shrink-0" style={{ color: "var(--event-primary)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs break-words opacity-55">{isCinema ? "Seats from" : "Tickets from"}</p>
                    <p className="w-full max-w-full font-display text-2xl font-bold break-words">{startingPrice(event)}</p>
                  </div>
                </div>
                <Separator className="my-6 opacity-15" />
                {sales.canBuy ? (
                  <Button asChild className="h-12 w-full max-w-full" style={{ backgroundColor: "var(--event-primary)", color: "var(--event-foreground)" }}>
                    <Link to={buyPath} className="w-full max-w-full items-center justify-center">
                      <span className="min-w-0 break-words">{isCinema ? "Choose seats" : "Choose tickets"}</span>
                      <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
                    </Link>
                  </Button>
                ) : (
                  <Button disabled className="h-12 w-full max-w-full">
                    <span className="min-w-0 break-words">{sales.label}</span>
                  </Button>
                )}
                {sales.canBuy && event.salesCloseAt && (
                  <p className="mt-3 w-full max-w-full text-center text-xs break-words opacity-60">Sales close {formatNairobi(event.salesCloseAt)}</p>
                )}
                {!sales.canBuy && !isGate && (
                  <p className="mt-3 w-full max-w-full text-center text-xs break-words opacity-60">
                    {event.salesState === "not_started" ? "Tickets are not on sale yet. Check back soon." : "Tickets can't be bought for this event any more."}
                  </p>
                )}
                {isCinema && event.seatsTotal > 0 && sales.canBuy && (
                  <p className="mt-2 w-full max-w-full text-center text-xs break-words opacity-60">{Math.max(0, event.seatsTotal - event.seatsTaken)} of {event.seatsTotal} seats left</p>
                )}
                <div className="mt-5 flex w-full max-w-full items-start gap-2 text-xs opacity-55">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 break-words">Secure checkout with M-Pesa</span>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </Layout>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 w-full max-w-full">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--event-primary)]/10 text-[var(--event-primary)]">
        <Icon className="h-4 w-4 shrink-0" />
      </span>
      <div className="min-w-0 flex-1 w-full">
        <p className="text-xs break-words opacity-55">{label}</p>
        <p className="w-full max-w-full text-sm font-semibold break-words sm:truncate">{value}</p>
      </div>
    </div>
  );
}
