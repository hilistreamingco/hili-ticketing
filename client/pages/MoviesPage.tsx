import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Popcorn } from "lucide-react";
import Layout from "@/components/layout/Layout";
import { BRAND } from "@/config/brand";
import Reveal from "@/components/Reveal";
import { formatPrice } from "@/lib/events";
import { currentPrice, getMovies, getShowtimes, lookFor, runtimeText, type Movie } from "@/lib/movies";

export default function MoviesPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [from, setFrom] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      const [m, shows] = await Promise.all([getMovies(), getShowtimes()]);
      if (!live) return;
      const prices: Record<string, number> = {};
      for (const s of shows) {
        const p = currentPrice(s);
        if (s.movieId && p !== null) prices[s.movieId] = Math.min(prices[s.movieId] ?? p, p);
      }
      // Only movies with a showtime coming up are "now showing".
      setMovies(m.filter((x) => prices[x.id] !== undefined));
      setFrom(prices);
      setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  return (
    <Layout>
      <div className="bg-[#0b0b0b] text-white">
        <div className="container py-14 md:py-20">
          <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-white/50">{BRAND.cinemaName}</p>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-6xl">Now showing.</h1>
          <p className="mt-3 max-w-md text-white/60">Pick a film, pick a seat, pay with M-Pesa. Three steps, no queue.</p>

          {loading ? (
            <p className="mt-12 text-white/50">Rolling the trailers…</p>
          ) : movies.length === 0 ? (
            <div className="mt-12 rounded-2xl border border-white/10 p-10 text-center">
              <Popcorn className="mx-auto h-8 w-8 text-white/50" />
              <p className="mt-3 font-display text-xl font-semibold">Nothing on the big screen yet.</p>
              <p className="mt-1 text-sm text-white/60">We're picking something good. Come back soon.</p>
            </div>
          ) : (
            <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
              {movies.map((m, i) => {
                const look = lookFor(m);
                return (
                  <Reveal key={m.id} delay={(i % 4) * 70}>
                    <Link to={`/movies/${m.slug}`} className="group block">
                      <div className="overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-300 group-hover:-translate-y-1 group-hover:ring-2"
                        style={{ ["--ring" as string]: look.accent }}>
                        <img src={m.poster} alt={`${m.title} poster`} loading="lazy" className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      </div>
                      <p className="mt-3 font-display text-lg font-semibold leading-tight">{m.title}</p>
                      <p className="mt-1 text-xs text-white/55">
                        {[m.rating, runtimeText(m.runtimeMin)].filter(Boolean).join(" · ")}
                      </p>
                      {from[m.id] !== undefined && <p className="mt-1 text-sm" style={{ color: look.accent }}>from {formatPrice(from[m.id])}</p>}
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
