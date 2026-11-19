import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Loader2, MapPin, Search, Sparkles, Armchair, Wallet, MailCheck } from "lucide-react";
import Layout from "@/components/layout/Layout";
import EventCard from "@/components/EventCard";
import NowShowing from "@/components/NowShowing";
import VideoBackdrop from "@/components/VideoBackdrop";
import Reveal from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import {
  getEvents,
  sortEvents,
  startingPrice,
  salesStatus,
  isPastEvent,
  nairobiToday,
  subscribeToEvents,
  formatEventDate,
  formatEventTime,
  type HiliEvent,
} from "@/lib/events";
import { getCampaigns, type Campaign } from "@/lib/campaigns";
import { getSiteSettings } from "@/lib/supabase";
import { BRAND } from "@/config/brand";

const HERO_BG = "/hero-ticketing.jpg.jpeg";

type When = "all" | "today" | "weekend";

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Friday to Sunday of this weekend (or today to Sunday if the weekend has started). */
function weekendRange(today: string): [string, string] {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sun ... 6 Sat
  const start = dow === 0 ? today : dow >= 5 ? today : addDays(today, 5 - dow);
  const startDow = new Date(`${start}T12:00:00Z`).getUTCDay();
  return [start, addDays(start, (7 - startDow) % 7)];
}

export default function Index() {
  const [events, setEvents] = useState<HiliEvent[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroVideo, setHeroVideo] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [when, setWhen] = useState<When>("all");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [rows, camps] = await Promise.all([getEvents(), getCampaigns()]);
      if (active) {
        setEvents(rows.filter((e) => !e.movieId)); // movie showtimes live under Movies
        setCampaigns(camps);
        setLoading(false);
      }
    };
    void load();
    getSiteSettings()
      .then((s) => { if (active && typeof s.hero_video_url === "string" && s.hero_video_url) setHeroVideo(s.hero_video_url); })
      .catch(() => undefined);
    const unsub = subscribeToEvents(() => void load());
    return () => { active = false; unsub(); };
  }, []);

  const upcoming = useMemo(() => sortEvents(events).filter((e) => !isPastEvent(e)), [events]);
  const featured = upcoming[0];

  const shown = useMemo(() => {
    const today = nairobiToday();
    const [wkStart, wkEnd] = weekendRange(today);
    const q = query.trim().toLowerCase();
    return upcoming.filter((e) => {
      if (when === "today" && e.date !== today) return false;
      if (when === "weekend" && !(e.date >= wkStart && e.date <= wkEnd)) return false;
      if (!q) return true;
      return [e.title, e.venue, e.city, e.shortDescription].some((t) => t?.toLowerCase().includes(q));
    });
  }, [upcoming, query, when]);

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-black/30" /></div>
      </Layout>
    );
  }

  const chips: { id: When; label: string }[] = [
    { id: "all", label: "All upcoming" },
    { id: "today", label: "Today" },
    { id: "weekend", label: "This weekend" },
  ];

  return (
    <Layout>
      {/* Hero: search first */}
      <section className="relative isolate overflow-hidden bg-[#0b0b0b] text-white">
        <div className="absolute inset-0 -z-10">
          {heroVideo ? (
            <VideoBackdrop src={heroVideo} poster={HERO_BG} className="opacity-60" />
          ) : (
            <img src={HERO_BG} alt="" className="h-full w-full object-cover opacity-50" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b0b0b]/60 via-[#0b0b0b]/40 to-[#0b0b0b]" />
        </div>
        <div className="container py-16 md:py-24">
          <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Find your next night out.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/70">{BRAND.tagline}</p>

          <form
            role="search"
            onSubmit={(e) => { e.preventDefault(); document.getElementById("events")?.scrollIntoView({ behavior: "smooth" }); }}
            className="mt-8 flex max-w-xl items-center gap-2 rounded-full bg-white p-1.5 pl-5 text-black shadow-lg"
          >
            <Search className="h-5 w-5 shrink-0 text-black/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, venues or cities"
              aria-label="Search events"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-black/40"
            />
            <Button type="submit" className="rounded-full bg-black px-5 text-white hover:bg-black/80">Search</Button>
          </form>

          <div className="mt-5 flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setWhen(c.id); document.getElementById("events")?.scrollIntoView({ behavior: "smooth" }); }}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${when === c.id ? "border-white bg-white text-black" : "border-white/25 text-white/80 hover:bg-white/10"}`}
              >
                {c.label}
              </button>
            ))}
            <Link to="/movies" className="rounded-full border border-white/25 px-4 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10">Movies</Link>
          </div>
        </div>
      </section>

      {/* Featured: the soonest event */}
      {featured && (
        <section className="bg-background">
          <div className="container py-12 md:py-16">
            <Reveal>
              <Link to={`/events/${featured.slug}`} className="group grid overflow-hidden rounded-3xl border border-border bg-card shadow-card md:grid-cols-2">
                <div className="aspect-[16/10] overflow-hidden md:aspect-auto md:min-h-[320px]">
                  <img src={featured.coverImage} alt={featured.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                </div>
                <div className="flex flex-col justify-center p-6 sm:p-10">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                    <Sparkles className="h-3.5 w-3.5" /> Happening next
                  </span>
                  <h2 className="mt-4 break-words font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{featured.title}</h2>
                  {featured.shortDescription && <p className="mt-3 line-clamp-3 text-muted-foreground">{featured.shortDescription}</p>}
                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-foreground/70">
                    {featured.date && <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatEventDate(featured.date)}{featured.startTime && ` · ${formatEventTime(featured.startTime)}`}</span>}
                    {featured.venue && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{featured.venue}</span>}
                  </div>
                  <div className="mt-6 flex items-center gap-4">
                    <span className="inline-flex items-center rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-transform group-hover:translate-x-0.5">
                      {featured.eventType === "gate" ? "View details" : salesStatus(featured).canBuy ? "Get tickets" : "View event"} <ArrowRight className="ml-2 h-4 w-4" />
                    </span>
                    {featured.eventType !== "gate" && <span className="text-sm font-semibold">From {startingPrice(featured)}</span>}
                  </div>
                </div>
              </Link>
            </Reveal>
          </div>
        </section>
      )}

      <NowShowing />

      {/* All upcoming events */}
      <section id="events" className="scroll-mt-16 bg-background">
        <div className="container py-12 md:py-20">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Upcoming events</h2>
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <button key={c.id} type="button" onClick={() => setWhen(c.id)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${when === c.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-foreground/5"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>

          {shown.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center">
              <p className="font-display text-xl font-semibold">
                {query || when !== "all" ? "Nothing matches that." : "No events right now."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {query || when !== "all" ? "Try another word or a different day." : "New ones land here as soon as they are announced."}
              </p>
              {(query || when !== "all") && (
                <Button variant="outline" className="mt-5" onClick={() => { setQuery(""); setWhen("all"); }}>Clear search</Button>
              )}
            </div>
          ) : (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((e, i) => <Reveal key={e.id} delay={(i % 3) * 70}><EventCard event={e} /></Reveal>)}
            </div>
          )}
        </div>
      </section>

      {campaigns.length > 0 && (
        <section id="campaigns" className="bg-[#f4f1ea]">
          <div className="container py-12 md:py-20">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Packages and series</h2>
            <p className="mt-2 max-w-lg text-muted-foreground">Several events, one plan. Pick the ones you want.</p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {campaigns.map((c) => (
                <Link key={c.id} to={`/campaign/${c.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-transform duration-300 hover:-translate-y-1">
                  {c.posterPath ? (
                    <div className="aspect-[4/3] overflow-hidden"><img src={c.posterPath} alt={c.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /></div>
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center bg-primary/10"><Sparkles className="h-10 w-10 text-primary" /></div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="font-display text-xl font-bold leading-snug">{c.name}</h3>
                    {c.shortDescription && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.shortDescription}</p>}
                    <p className="mt-auto pt-4 text-sm font-semibold text-primary group-hover:underline">See what's inside <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="bg-background">
        <div className="container py-12 md:py-20">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Buying is simple.</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              { icon: Search, t: "Find it", d: "Browse events and movies, or search for exactly what you want." },
              { icon: Wallet, t: "Pay with M-Pesa", d: "Pay to our till and send us the details. No card and no account needed." },
              { icon: MailCheck, t: "Get your ticket", d: "Once we confirm your payment, your ticket lands in your inbox." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-2xl border border-border bg-card p-6">
                <Icon className="h-6 w-6 text-primary" />
                <p className="mt-4 font-display text-lg font-semibold">{t}</p>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            Running an event or a venue? <Link to="/contact" className="font-semibold text-foreground underline underline-offset-4">Talk to us about selling tickets here</Link>.
          </p>
        </div>
      </section>
    </Layout>
  );
}
