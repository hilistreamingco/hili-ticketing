import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Ticket,
} from "lucide-react";
import Layout from "@/components/layout/Layout";
import EventCard from "@/components/EventCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { categories, events } from "@/lib/events";

const categoryColors: Record<string, string> = {
  Nightlife: "bg-violet-100 text-violet-700",
  Music: "bg-sky-100 text-sky-700",
  Business: "bg-emerald-100 text-emerald-700",
  Festival: "bg-orange-100 text-orange-700",
  Comedy: "bg-yellow-100 text-yellow-700",
  "Food & Drink": "bg-rose-100 text-rose-700",
};

export default function Index() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All events");

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesCategory = activeCategory === "All events" || event.category === activeCategory;
      const matchesQuery = !normalizedQuery || [event.title, event.venue, event.city, event.category]
        .join(" ").toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, query]);

  const featured = events.filter((event) => event.featured);
  const popular = events.filter((event) => event.popular);

  return (
    <Layout>
      <section className="relative overflow-hidden border-b border-border bg-hili-ink text-white">
        <div className="absolute -right-32 -top-40 h-[32rem] w-[32rem] rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -bottom-48 left-1/4 h-[24rem] w-[24rem] rounded-full bg-hili-gold/10 blur-3xl" />
        <div className="container relative py-20 md:py-28 lg:py-32">
          <div className="max-w-3xl animate-fade-in">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-hili-gold" />
              Experiences worth showing up for
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl lg:text-7xl">
              Your next great<br />
              <span className="text-primary">memory</span> starts here.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65 md:text-lg">
              Discover the best events happening around you. From intimate
              gatherings to unforgettable festivals, find your people and show up.
            </p>
          </div>

          <div className="mt-10 flex max-w-3xl flex-col gap-3 rounded-2xl bg-white p-2 shadow-2xl sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search events, venues, or cities..."
                className="h-12 border-0 bg-transparent px-0 text-foreground shadow-none focus-visible:ring-0"
              />
            </div>
            <Button className="h-12 shrink-0 px-6">
              <Search className="h-4 w-4" /> Search
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/60">
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Nairobi</span>
            <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> This weekend</span>
            <span className="flex items-center gap-1.5"><SlidersHorizontal className="h-4 w-4" /> All categories</span>
          </div>
        </div>
      </section>

      <main className="container py-16 md:py-20">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">Curated for you</p>
            <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Featured events</h2>
          </div>
          <Link to="/events" className="hidden items-center gap-1.5 text-sm font-semibold text-primary hover:underline sm:flex">
            Explore all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {featured.map((event) => <EventCard key={event.id} event={event} size="large" />)}
        </div>

        <section className="mt-20">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">Make a plan</p>
              <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Happening this week</h2>
            </div>
            <Button asChild variant="outline" size="sm" className="hidden sm:flex">
              <Link to="/events">View calendar <CalendarDays className="h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {events.slice(1, 5).map((event) => <EventCard key={event.id} event={event} />)}
          </div>
        </section>

        <section className="mt-20 rounded-3xl bg-muted/60 px-5 py-10 md:px-10 md:py-12">
          <div className="flex flex-col justify-between gap-7 md:flex-row md:items-end">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">Find your thing</p>
              <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Browse by category</h2>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" /> Nairobi, Kenya <ChevronDown className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-8 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {["All events", ...categories].map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${activeCategory === category ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.slice(0, 3).map((event) => <EventCard key={event.id} event={event} />)}
          </div>
          {!filteredEvents.length && (
            <div className="py-10 text-center text-muted-foreground">No events found. Try another search.</div>
          )}
        </section>

        <section className="mt-20">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">Don't miss out</p>
              <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Popular right now</h2>
            </div>
            <Link to="/events" className="hidden items-center gap-1.5 text-sm font-semibold text-primary hover:underline sm:flex">See more <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {popular.map((event) => <EventCard key={event.id} event={event} />)}
          </div>
        </section>

        <section className="mt-20 overflow-hidden rounded-3xl bg-primary px-6 py-10 text-primary-foreground md:px-12 md:py-14">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-sm font-medium text-primary-foreground/80"><Ticket className="h-4 w-4" /> For event creators</div>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">Your event. Your identity. One powerful platform.</h2>
              <p className="mt-3 text-primary-foreground/75">Create a custom event experience, sell tickets, and bring your community together — without the busywork.</p>
            </div>
            <Button asChild variant="secondary" size="lg" className="shrink-0"><Link to="/create-event">Create an event <ArrowRight className="h-4 w-4" /></Link></Button>
          </div>
        </section>
      </main>
    </Layout>
  );
}
