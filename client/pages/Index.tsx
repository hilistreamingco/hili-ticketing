import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import Layout from "@/components/layout/Layout";
import EventCard from "@/components/EventCard";
import { Button } from "@/components/ui/button";
import {
  getEvents,
  groupEventsByDate,
  isPastEvent,
  salesStatus,
  subscribeToEvents,
  formatEventDate,
  type HiliEvent,
} from "@/lib/events";

export default function Index() {
  const [events, setEvents] = useState<HiliEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const rows = await getEvents();
      if (active) {
        setEvents(rows);
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

  // The list is already sorted: upcoming events soonest first, then past ones.
  const hero = events[0];

  if (!hero) {
    return (
      <Layout>
        <section className="bg-[#d8f54a] text-[#0b0b0b]">
          <div className="container flex min-h-[60vh] items-center justify-center py-20">
            <div className="text-center">
              <h1 className="font-display text-5xl font-bold">No events yet.</h1>
              <p className="mt-4 text-black/60">Check back soon for upcoming shows.</p>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  const heroStatus = salesStatus(hero);
  const others = events.slice(1);
  const groups = groupEventsByDate(others);

  return (
    <Layout>
      <section className="bg-[#d8f54a] text-[#0b0b0b]">
        <div className="container grid min-h-[calc(100vh-4rem)] items-center gap-12 py-14 lg:grid-cols-[.9fr_1.1fr] lg:py-20">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[.3em]">
              {isPastEvent(hero) ? "Hili presented" : "Hili presents"}
            </p>
            <h1 className="mt-6 font-display text-5xl font-bold leading-[.92] tracking-[-.07em] sm:text-7xl md:text-8xl">
              {hero.title}
            </h1>
            <p className="mt-7 max-w-sm font-display text-base font-bold leading-7 text-black">
              {hero.shortDescription}
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-black/60">{heroStatus.label}</p>
            <Button asChild size="lg" variant="secondary" className="mt-6">
              <Link to={`/events/${hero.slug}`}>
                View event details <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="relative mx-auto w-full max-w-[500px]">
            <div className="overflow-hidden rounded-[2rem] bg-[#171717] shadow-2xl">
              <img
                src={hero.coverImage}
                alt={`${hero.title} poster`}
                className="aspect-[4/5] w-full object-cover"
              />
            </div>
            {hero.date && (
              <div className="absolute -bottom-5 -right-4 rounded-2xl bg-[#f4f1ea] px-5 py-4 shadow-xl sm:-right-7">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-black/45">Event date</p>
                <p className="mt-1 font-display text-sm font-bold">{formatEventDate(hero.date)}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {groups.length > 0 && (
        <section className="bg-[#f4f1ea]">
          <div className="container py-20 md:py-28">
            <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-black/45">More events</p>
            <h2 className="mt-5 max-w-md font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Keep your calendar open.
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
    </Layout>
  );
}
