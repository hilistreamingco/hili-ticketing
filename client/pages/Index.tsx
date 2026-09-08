import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, MapPin, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { getEvents, subscribeToEvents, formatEventDate, type HiliEvent } from "@/lib/events";

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

  const upcoming = events.find(e => e.featured) ?? events[0];
  const future = events.find(e => !e.featured) ?? events[1];

  if (!upcoming) {
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

  return (
    <Layout>
      <section className="bg-[#d8f54a] text-[#0b0b0b]">
        <div className="container grid min-h-[calc(100vh-4rem)] items-center gap-12 py-14 lg:grid-cols-[.9fr_1.1fr] lg:py-20">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[.3em]">Hili presents</p>
            <h1 className="mt-6 font-display text-5xl font-bold leading-[.92] tracking-[-.07em] sm:text-7xl md:text-8xl">
              {upcoming.title}
            </h1>
            <p className="mt-7 max-w-sm text-base leading-7 text-black/65">
              {upcoming.shortDescription}
            </p>
            <Button asChild size="lg" variant="secondary" className="mt-8">
              <Link to={`/events/${upcoming.slug}`}>
                View event details <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="relative mx-auto w-full max-w-[500px]">
            <div className="overflow-hidden rounded-[2rem] bg-[#171717] shadow-2xl">
              <img
                src={upcoming.coverImage}
                alt={`${upcoming.title} poster`}
                className="aspect-[4/5] w-full object-cover"
              />
            </div>
            {upcoming.date && (
              <div className="absolute -bottom-5 -right-4 rounded-2xl bg-[#f4f1ea] px-5 py-4 shadow-xl sm:-right-7">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-black/45">Event date</p>
                <p className="mt-1 font-display text-sm font-bold">{formatEventDate(upcoming.date)}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {future && (
        <section className="bg-[#f4f1ea]">
          <div className="container grid gap-12 py-20 md:grid-cols-[.85fr_1.15fr] md:py-28">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-black/45">What comes next</p>
              <h2 className="mt-5 max-w-md font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                Keep your calendar open.
              </h2>
            </div>
            <div>
              <div className="grid gap-6 border-y border-black/15 py-7 sm:grid-cols-3">
                {future.date && <Detail icon={CalendarDays} label="Proposed date" value={formatEventDate(future.date)} />}
                {future.city && <Detail icon={MapPin} label="City" value={future.city} />}
                <Detail label="Status" value="Coming soon" />
              </div>
              <p className="mt-7 max-w-lg text-sm leading-7 text-black/55">{future.shortDescription}</p>
              <Link
                to="/future"
                className="mt-7 inline-flex items-center gap-2 text-sm font-bold underline decoration-[#859900] decoration-2 underline-offset-4"
              >
                Explore the next one <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}
    </Layout>
  );
}

function Detail({ icon: Icon, label, value }: { icon?: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#657600]" />}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-black/45">{label}</p>
        <p className="mt-1 text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
