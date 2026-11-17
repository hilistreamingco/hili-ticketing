import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Clock3, Loader2, MapPin, Sparkles, Ticket, Users } from "lucide-react";
import Layout from "@/components/layout/Layout";
import EventCard from "@/components/EventCard";
import { Button } from "@/components/ui/button";
import {
  getEvents,
  sortEvents,
  startingPrice,
  salesStatus,
  isPastEvent,
  subscribeToEvents,
  formatEventDate,
  formatEventTime,
  type HiliEvent,
} from "@/lib/events";
import { getCampaigns, type Campaign } from "@/lib/campaigns";
import { getSiteSettings } from "@/lib/supabase";
import VideoBackdrop from "@/components/VideoBackdrop";
import CreativesCarousel, { type Creative } from "@/components/CreativesCarousel";

const HERO_BG = "/hero-ticketing.jpg.jpeg";

export default function Index() {
  const [events, setEvents] = useState<HiliEvent[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroVideo, setHeroVideo] = useState<string | null>(null);
  const [creatives, setCreatives] = useState<Creative[]>([]);

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
    getSiteSettings()
      .then((s) => {
        if (!active) return;
        if (typeof s.hero_video_url === "string" && s.hero_video_url) setHeroVideo(s.hero_video_url);
        if (Array.isArray(s.creatives)) {
          setCreatives(
            (s.creatives as any[])
              .filter((c) => c && typeof c.image === "string" && c.image)
              .map((c) => ({ image: c.image as string, caption: typeof c.caption === "string" ? c.caption : "" })),
          );
        }
      })
      .catch(() => undefined);
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

  // Soonest upcoming events first; the home page shows at most two.
  const upcomingAll = sortEvents(events).filter((e) => !isPastEvent(e));
  const upcoming = upcomingAll.slice(0, 2);

  return (
    <Layout>
      {/* Hero — site introduction with the ticket image as an atmospheric background */}
      <section className="relative isolate overflow-hidden bg-[#0b0b0b] text-white">
        <div className="absolute inset-0 -z-10">
          {heroVideo ? (
            <VideoBackdrop src={heroVideo} poster={HERO_BG} className="opacity-70" />
          ) : (
            <img src={HERO_BG} alt="" className="h-full w-full object-cover opacity-60" />
          )}
          <div className="absolute inset-0 bg-[#0b0b0b]/30" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b0b0b]/50 via-transparent to-[#0b0b0b]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b0b] via-[#0b0b0b]/30 to-transparent" />
        </div>
        <div className="container flex min-h-[calc(100vh-4rem)] items-center py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#c1ff1a]">Hili · Creative collective</p>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[.95] tracking-tight break-words [word-break:normal] sm:text-7xl lg:text-8xl">
             <span className="text-[#c1ff1a]">Made for the culture.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-white/75">
              Hili is where young creatives get seen. We curate the talent, connect the people shaping what is next, and throw the nights that bring everyone together.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="bg-[#c1ff1a] text-black hover:bg-[#a8e616]">
                <a href={creatives.length > 0 ? "#creatives" : "#what-we-do"}>
                  Our Vibe Curators <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                <a href="#events">
                  <Ticket className="mr-2 h-4 w-4" /> What is on
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Creatives: the heart of the page. Hidden until at least one is added in the admin. */}
      {creatives.length > 0 && (
        <section id="creatives" className="overflow-hidden bg-[#0b0b0b] text-white">
          <div className="container py-16 md:py-24">
            <p className="text-center text-[10px] font-semibold uppercase tracking-[.3em] text-white/50">The creatives</p>
            <h2 className="mx-auto mt-4 max-w-2xl text-center font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              The people and the work we back.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-center text-white/60">
              Artists, makers and collectives from our community, spotlighted.
            </p>
            <div className="mt-10 md:mt-14">
              <CreativesCarousel items={creatives} />
            </div>
          </div>
        </section>
      )}

      {/* What Hili does */}
      <section id="what-we-do" className="bg-[#f4f1ea]">
        <div className="container py-16 md:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-black/45">What we do</p>
          <h2 className="mt-4 max-w-xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            We put creatives in front of the people who care.
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              { icon: Sparkles, title: "Curate", text: "We find fresh voices across film, music, art and design, and give their work a proper stage." },
              { icon: Users, title: "Connect", text: "We link creatives with each other, with brands and with an audience that shows up." },
              { icon: Ticket, title: "Celebrate", text: "Screenings, afterparties and live nights, built around the work and the community behind it." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-black/10 bg-white p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#c1ff1a]">
                  <Icon className="h-5 w-5 text-black" />
                </span>
                <h3 className="mt-5 font-display text-2xl font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-black/60">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Events by Hili: at most two upcoming events, separated by a ticket-style line */}
      <section id="events" className="bg-white">
        <div className="container py-16 md:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-black/45">Events by Hili</p>
          <h2 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">When the community gathers.</h2>
          <p className="mt-3 max-w-lg text-muted-foreground">Screenings, afterparties and live nights, curated by Hili. Grab your spot.</p>

          {upcoming.length === 0 ? (
            <p className="mt-8 max-w-md text-muted-foreground">The next gathering is being lined up. Check back soon.</p>
          ) : (
            <div className="mt-10">
              {upcoming.map((event, i) => (
                <div key={event.id}>
                  {i > 0 && (
                    <div className="relative my-10 border-t-2 border-dashed border-black/20 md:my-14" aria-hidden="true">
                      <span className="absolute left-1/2 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#c1ff1a] ring-[6px] ring-white" />
                    </div>
                  )}
                  <UpcomingEvent event={event} flip={i % 2 === 1} />
                </div>
              ))}
            </div>
          )}

          <div className="mt-10">
            <Button asChild variant="outline" className="border-black/20">
              <Link to="/events">
                {upcomingAll.length > 2 ? `See all ${upcomingAll.length} upcoming events` : "See all events"} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
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

      {/* Closing call: for creatives */}
      <section className="bg-[#0b0b0b] text-white">
        <div className="container py-16 text-center md:py-24">
          <h2 className="mx-auto max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Got something to show the world? <span className="text-[#c1ff1a]">Let us hear it.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-white/60">Creatives, collectives and brands: come build with Hili.</p>
          <Button asChild size="lg" className="mt-8 bg-[#c1ff1a] text-black hover:bg-[#a8e616]">
            <Link to="/contact">Get in touch <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </section>
    </Layout>
  );
}

function UpcomingEvent({ event, flip }: { event: HiliEvent; flip: boolean }) {
  const sales = salesStatus(event);
  const isGate = event.eventType === "gate";
  const cta = isGate ? "View details" : sales.canBuy ? "Get tickets" : "View event";
  return (
    <article className="grid items-center gap-6 md:grid-cols-2 md:gap-12">
      <Link
        to={`/events/${event.slug}`}
        className={`group block min-w-0 overflow-hidden rounded-2xl shadow-card ${flip ? "md:order-2" : ""}`}
      >
        <img
          src={event.coverImage}
          alt={event.title}
          loading="lazy"
          className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </Link>
      <div className="min-w-0">
        {event.date && (
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-black/70">
            <CalendarDays className="h-4 w-4 shrink-0" /> {formatEventDate(event.date)}
            {event.startTime && <span className="text-black/45">· {formatEventTime(event.startTime)}</span>}
          </p>
        )}
        <h3 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight break-words sm:text-4xl">{event.title}</h3>
        {event.shortDescription && <p className="mt-3 line-clamp-3 text-muted-foreground">{event.shortDescription}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-black/60">
          {event.venue && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0" /> {event.venue}</span>}
          {!isGate && <span className="inline-flex items-center gap-1.5"><Ticket className="h-4 w-4 shrink-0" /> {startingPrice(event)}</span>}
        </div>
        <Button asChild className="mt-6 bg-[#0b0b0b] text-white hover:bg-black/80">
          <Link to={`/events/${event.slug}`}>{cta} <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </div>
    </article>
  );
}
