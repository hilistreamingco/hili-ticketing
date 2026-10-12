import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Clock3, Loader2, MapPin, Sparkles, Ticket } from "lucide-react";
import Layout from "@/components/layout/Layout";
import EventCard from "@/components/EventCard";
import { Button } from "@/components/ui/button";
import {
  getEvents,
  groupEventsByDate,
  isPastEvent,
  subscribeToEvents,
  formatEventDate,
  formatEventTime,
  type HiliEvent,
} from "@/lib/events";
import { getCampaigns, type Campaign } from "@/lib/campaigns";

const HERO_BG = "/hero-ticketing.jpg.jpeg";

export default function Index() {
  const [events, setEvents] = useState<HiliEvent[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [rows, camps] = await Promise.all([getEvents(), getCampaigns()]);
      if (active) {
        setEvents(rows);
        setCampaigns(camps);
        setLoading(false);
      }
    };
    void load();
    const unsub = subscribeToEvents(() => void load());
    return () => { active = false; unsub(); };
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-black/30" />
        </div>
      </Layout>
    );
  }

  // Events that belong to a campaign are surfaced through the campaign page, not
  // the standalone "More events" grid.
  const standalone = events.filter((e) => !e.campaignId);
  const groups = groupEventsByDate(standalone);

  return (
    <Layout>
      {/* Hero — site introduction with the ticket image as an atmospheric background */}
      <section className="relative isolate overflow-hidden bg-[#0b0b0b] text-white">
        <div className="absolute inset-0 -z-10">
          <img src={HERO_BG} alt="" className="h-full w-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-[#0b0b0b]/30" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b0b0b]/50 via-transparent to-[#0b0b0b]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b0b] via-[#0b0b0b]/30 to-transparent" />
        </div>
        <div className="container flex min-h-[calc(100vh-4rem)] items-center py-16 lg:py-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c1ff1a]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/80">Hili Events</span>
            </div>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[.95] tracking-tight break-words [word-break:normal] sm:text-7xl">
              Your seat to <span className="text-[#c1ff1a] whitespace-nowrap">unforgettable</span> nights.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-white/70">
              From cinema screenings to afterparties and everything in between — discover events, grab your tickets, and show up ready to make memories.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="bg-[#c1ff1a] text-black hover:bg-[#a8e616]">
                <Link to="/events">
                  Browse events <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              {campaigns.length > 0 && (
                <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                  <a href="#campaigns">
                    <Ticket className="mr-2 h-4 w-4" /> View campaigns
                  </a>
                </Button>
              )}
            </div>
            <div className="mt-12 flex flex-wrap gap-6 text-sm text-white/50">
              <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#c1ff1a]/70" /> Cinema & live events</span>
              <span className="inline-flex items-center gap-2"><Ticket className="h-4 w-4 text-[#c1ff1a]/70" /> Instant e-tickets</span>
              <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#c1ff1a]/70" /> Nairobi & beyond</span>
            </div>
          </div>
        </div>
      </section>

      {campaigns.length > 0 && (
        <section id="campaigns" className="bg-[#f4f1ea]">
          <div className="container py-16 md:py-20">
            <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-black/45">Event campaigns</p>
            <h2 className="mt-5 max-w-md font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Multi-event experiences.
            </h2>
            <p className="mt-3 max-w-lg text-muted-foreground">
              Pick a campaign to see every event inside it — cinema, afterparty and more — and book the ones you want.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {campaigns.map((c) => (
                <Link
                  key={c.id}
                  to={`/campaign/${c.slug}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-transform duration-300 hover:-translate-y-1"
                >
                  {c.posterPath ? (
                    <div className="aspect-[4/3] overflow-hidden">
                      <img src={c.posterPath} alt={c.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    </div>
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center bg-primary/10">
                      <Sparkles className="h-10 w-10 text-primary" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="font-display text-xl font-bold leading-snug">{c.name}</h3>
                    {c.shortDescription && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.shortDescription}</p>}
                    <p className="mt-auto pt-4 text-sm font-semibold text-primary group-hover:underline">
                      View campaign <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {groups.length > 0 && (
        <section className="bg-[#f4f1ea]">
          <div className="container py-20 md:py-28">
            <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-black/45">More events</p>
            <h2 className="mt-5 max-w-md font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Also happening at Hili.
            </h2>
            <div className="mt-12 space-y-12">
              {groups.map((group) => (
                <div key={group.date || "tba"}>
                  <h3 className="border-b border-black/15 pb-3 font-display text-lg font-bold">
                    {group.date ? formatEventDate(group.date) : "Date to be announced"}
                  </h3>
                  <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.events.map((event) => <EventCard key={event.id} event={event} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <HiliEventsCalendar events={events} />
    </Layout>
  );
}

function HiliEventsCalendar({ events }: { events: HiliEvent[] }) {
  const upcoming = events.filter((e) => !isPastEvent(e));
  const hasEvents = upcoming.length > 0;

  return (
    <section className="bg-[#0b0b0b] text-white overflow-hidden">
      <div className="container py-20 md:py-28">
        <div className="flex items-center gap-3 mb-8 md:mb-12">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#c1ff1a]/10">
            <CalendarDays className="h-6 w-6 text-[#c1ff1a]" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-white/45">Hili Events</p>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Events Calendar</h2>
          </div>
        </div>

        {hasEvents ? (
          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-[#c1ff1a]/10 via-transparent to-[#c1ff1a]/5 blur-2xl" />
            <div className="relative rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-5 sm:p-8 md:p-12 shadow-2xl">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c1ff1a]/40 to-transparent" />

              <div className="grid gap-6 sm:gap-8">
                {upcoming.map((event, index) => (
                  <Link
                    key={event.id}
                    to={`/events/${event.slug}`}
                    className="group relative grid gap-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all duration-300 hover:border-[#c1ff1a]/30 hover:bg-white/[0.06] sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-6 sm:p-6"
                  >
                    <div className="pointer-events-none absolute -left-20 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-[#c1ff1a]/10 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                    <div className="relative flex items-center gap-4 sm:flex-col sm:items-start sm:gap-2">
                      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#c1ff1a] text-[#0b0b0b] sm:h-20 sm:w-24">
                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                          {event.date ? new Date(`${event.date}T00:00:00`).toLocaleDateString("en-US", { month: "short" }).toUpperCase() : "TBA"}
                        </span>
                        <span className="font-display text-2xl font-bold leading-none sm:text-3xl">
                          {event.date ? new Date(`${event.date}T00:00:00`).getDate() : "—"}
                        </span>
                      </div>
                      <div className="sm:hidden">
                        <h3 className="font-display text-lg font-bold leading-tight">{event.title}</h3>
                        <p className="mt-1 text-xs text-white/50">Event {String(index + 1).padStart(2, "0")}</p>
                      </div>
                    </div>

                    <div className="relative hidden sm:block">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.25em] text-[#c1ff1a]/70">Event {String(index + 1).padStart(2, "0")}</p>
                      <h3 className="font-display text-xl font-bold leading-tight tracking-tight transition-colors group-hover:text-[#c1ff1a] md:text-2xl">
                        {event.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/60">
                        {event.shortDescription || "More details coming soon."}
                      </p>
                    </div>

                    <div className="relative mt-2 flex flex-wrap items-center gap-3 text-xs text-white/60 sm:mt-0 sm:flex-col sm:items-end sm:gap-2">
                      <div className="flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5 text-[#c1ff1a]/60" />
                        <span className="font-medium">
                          {event.startTime ? formatEventTime(event.startTime) : "Time TBA"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-[#c1ff1a]/60" />
                        <span className="font-medium max-w-[180px] truncate">
                          {event.venue || "Venue TBA"}
                        </span>
                      </div>
                      <div className="mt-1 sm:mt-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/70 transition-colors group-hover:border-[#c1ff1a]/40 group-hover:text-[#c1ff1a]">
                          View details <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6">
                <p className="text-xs text-white/40">All times shown in Nairobi local time.</p>
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <span className="inline-flex h-2 w-2 rounded-full bg-[#c1ff1a] animate-pulse" />
                  <span>Schedule subject to change</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-10 sm:p-16 md:p-20 shadow-2xl">
            <div className="absolute -top-32 -right-32 h-64 w-64 rounded-full bg-[#c1ff1a]/10 blur-3xl" />
            <div className="absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-[#c1ff1a]/5 blur-3xl" />

            <div className="relative flex flex-col items-center text-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 rounded-full bg-[#c1ff1a]/20 blur-xl animate-pulse" />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#c1ff1a]/20 to-[#c1ff1a]/5 border border-[#c1ff1a]/20">
                  <Sparkles className="h-12 w-12 text-[#c1ff1a]" />
                </div>
              </div>
              <h3 className="max-w-lg font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                Hili is busy cooking up something.
              </h3>
              <p className="mt-5 max-w-md text-base leading-relaxed text-white/55 sm:text-lg">
                An event schedule will be up sometime soon. We're curating experiences you won't want to miss. Check back later — or follow along to be the first to know.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-xs text-white/40">
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#c1ff1a]" />
                  Something's brewing
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5">
                  <CalendarDays className="h-3 w-3" />
                  Drop date TBA
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5">
                  <Clock3 className="h-3 w-3" />
                  Worth the wait
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
