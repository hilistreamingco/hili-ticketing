import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { BRAND } from "@/config/brand";
import Reveal from "@/components/Reveal";
import { getMovies, getShowtimes, lookFor, type Movie } from "@/lib/movies";

/** Home page strip: films showing at Prestige Cinemas. Renders nothing until there is one. */
export default function NowShowing() {
  const [movies, setMovies] = useState<Movie[]>([]);

  useEffect(() => {
    let live = true;
    Promise.all([getMovies(), getShowtimes()])
      .then(([m, shows]) => {
        if (!live) return;
        const ids = new Set(shows.map((s) => s.movieId));
        setMovies(m.filter((x) => ids.has(x.id)).slice(0, 6));
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  if (movies.length === 0) return null;

  return (
    <section id="now-showing" className="bg-[#0b0b0b] text-white">
      <div className="container py-16 md:py-24">
        <Reveal>
          <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-white/50">{BRAND.cinemaName}</p>
          <h2 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Now showing.</h2>
          <p className="mt-3 max-w-md text-white/60">Pick a film, pick your seat, pay with M-Pesa. Done before the trailers.</p>
        </Reveal>
        <div className="-mx-4 mt-10 flex snap-x gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
          {movies.map((m, i) => (
            <Reveal key={m.id} delay={i * 60} className="w-[44vw] max-w-[220px] shrink-0 snap-start">
              <Link to={`/movies/${m.slug}`} className="group block">
                <div className="overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-300 group-hover:-translate-y-1 group-hover:ring-white/40">
                  <img src={m.poster} alt={`${m.title} poster`} loading="lazy" className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <p className="mt-3 font-display font-semibold leading-tight">{m.title}</p>
                <p className="mt-0.5 text-xs" style={{ color: lookFor(m).accent }}>Pick a showtime</p>
              </Link>
            </Reveal>
          ))}
        </div>
        <Link to="/movies" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline">
          See everything showing <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
