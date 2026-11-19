import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Clock, Popcorn, Armchair, MailCheck, Wallet } from "lucide-react";
import Layout from "@/components/layout/Layout";
import VideoBackdrop from "@/components/VideoBackdrop";
import TrailerButton from "@/components/TrailerPlayer";
import { BRAND } from "@/config/brand";
import Reveal from "@/components/Reveal";
import NotFound from "@/pages/NotFound";
import { formatEventTime, formatPrice, salesStatus, type HiliEvent } from "@/lib/events";
import { currentPrice, getMovieBySlug, getShowtimes, lookFor, runtimeText, type Movie } from "@/lib/movies";

function dayLabel(date: string): { top: string; sub: string } {
  const d = new Date(`${date}T12:00:00+03:00`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(Date.now() + 864e5));
  const sub = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Nairobi" });
  if (date === today) return { top: "Tonight", sub };
  if (date === tomorrow) return { top: "Tomorrow", sub };
  return { top: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Africa/Nairobi" }), sub };
}

export default function MoviePage() {
  const { slug } = useParams();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [shows, setShows] = useState<HiliEvent[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [scrollY, setScrollY] = useState(0);
  const tilt = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const m = slug ? await getMovieBySlug(slug) : null;
      if (!live) return;
      if (!m) { setState("missing"); return; }
      setMovie(m);
      setShows(await getShowtimes(m.id));
      if (live) setState("ready");
    })();
    return () => { live = false; };
  }, [slug]);

  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setScrollY(Math.min(window.scrollY, 600))); };
    window.addEventListener("scroll", on, { passive: true });
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, []);

  const days = useMemo(() => {
    const map = new Map<string, HiliEvent[]>();
    for (const s of shows) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return [...map.entries()];
  }, [shows]);

  if (state === "missing") return <NotFound />;
  if (state === "loading" || !movie) {
    return <Layout><div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">Dimming the lights…</div></Layout>;
  }

  const look = lookFor(movie);
  const lowest = shows.map(currentPrice).filter((p): p is number => p !== null);
  const from = lowest.length ? Math.min(...lowest) : null;
  const meta = [movie.rating, runtimeText(movie.runtimeMin), movie.genres].filter(Boolean);

  const onMove = (e: React.PointerEvent) => {
    const el = tilt.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
  };
  const onLeave = () => { if (tilt.current) tilt.current.style.transform = "perspective(900px)"; };

  return (
    <Layout>
      <div style={{ background: look.bg, color: look.text }}>
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          <div className="absolute inset-0 -z-10" style={{ transform: `translateY(${scrollY * 0.25}px) scale(1.08)` }}>
            <img src={movie.backdrop} alt="" className="h-full w-full object-cover opacity-50" />
            {movie.backdropVideo && <VideoBackdrop src={movie.backdropVideo} poster={movie.backdrop} className="absolute inset-0 h-full w-full object-cover opacity-60" />}
          </div>
          <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(60% 60% at 70% 20%, ${look.glow}, transparent 70%), linear-gradient(to bottom, ${look.bg}99 0%, ${look.bg}cc 55%, ${look.bg} 100%)` }} />

          <div className="container pb-14 pt-8 md:pb-20">
            <Link to="/movies" className="inline-flex items-center gap-2 text-sm" style={{ color: look.muted }}>
              <ArrowLeft className="h-4 w-4" /> All movies
            </Link>

            <div className="mt-8 grid items-center gap-10 md:grid-cols-[minmax(0,320px)_1fr] md:gap-14">
              <div
                ref={tilt}
                onPointerMove={onMove}
                onPointerLeave={onLeave}
                className="mx-auto w-[min(70vw,300px)] overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10 transition-transform duration-200 ease-out md:w-full"
              >
                <img src={movie.poster} alt={`${movie.title} poster`} className="aspect-[2/3] w-full object-cover" />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[.3em]" style={{ color: look.accent }}>
                  Now showing · {BRAND.cinemaName}
                </p>
                <h1 className={`mt-4 break-words font-display text-5xl leading-[1.02] sm:text-6xl lg:text-7xl ${look.titleClass}`}>{movie.title}</h1>
                {movie.tagline && <p className="mt-4 max-w-xl text-lg" style={{ color: look.muted }}>{movie.tagline}</p>}
                {meta.length > 0 && (
                  <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: look.muted }}>
                    {movie.runtimeMin && <Clock className="h-4 w-4" />}
                    {meta.map((m, i) => <span key={i}>{m}</span>)}
                  </p>
                )}
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <a
                    href="#showtimes"
                    className="rounded-full px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.03] active:scale-95"
                    style={{ background: look.accent }}
                  >
                    Pick a showtime
                  </a>
                  <TrailerButton url={movie.trailer} title={movie.title} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Story */}
        {movie.synopsis && (
          <section className="container py-12 md:py-16">
            <Reveal>
              <p className="text-[10px] font-semibold uppercase tracking-[.3em]" style={{ color: look.accent }}>The story</p>
              <p className="mt-4 max-w-2xl whitespace-pre-line text-lg leading-relaxed" style={{ color: look.muted }}>{movie.synopsis}</p>
            </Reveal>
          </section>
        )}

        {/* Showtimes */}
        <section id="showtimes" className="container scroll-mt-20 pb-16 md:pb-24">
          <Reveal>
            <p className="text-[10px] font-semibold uppercase tracking-[.3em]" style={{ color: look.accent }}>Showtimes</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Pick a time, then your seat.</h2>
            <p className="mt-2" style={{ color: look.muted }}>{look.showtimesLine}</p>
          </Reveal>

          {days.length === 0 ? (
            <Reveal className="mt-8">
              <div className="rounded-2xl border border-white/10 p-8 text-center">
                <Popcorn className="mx-auto h-8 w-8" style={{ color: look.accent }} />
                <p className="mt-3 font-display text-xl font-semibold">No showtimes yet.</p>
                <p className="mt-1 text-sm" style={{ color: look.muted }}>The projector is warming up. Check back soon, the good seats go fast.</p>
              </div>
            </Reveal>
          ) : (
            <div className="mt-8 space-y-6">
              {days.map(([date, list], i) => {
                const label = dayLabel(date);
                return (
                  <Reveal key={date} delay={i * 60}>
                    <div className="grid gap-3 md:grid-cols-[180px_1fr] md:items-center">
                      <div>
                        <p className="font-display text-xl font-bold">{label.top}</p>
                        <p className="text-sm" style={{ color: look.muted }}>{label.sub}</p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {list.map((s) => {
                          const st = salesStatus(s);
                          const price = currentPrice(s);
                          const sold = s.salesState === "sold_out";
                          return st.canBuy ? (
                            <Link
                              key={s.id}
                              to={`/seats/${s.slug}`}
                              className="group min-w-[104px] rounded-xl border border-white/15 px-4 py-3 text-center transition-all hover:-translate-y-0.5 active:scale-95"
                              style={{ ["--a" as string]: look.accent }}
                              onMouseEnter={(e) => (e.currentTarget.style.borderColor = look.accent)}
                              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
                            >
                              <span className="block font-display text-lg font-bold">{formatEventTime(s.startTime)}</span>
                              {price !== null && <span className="block text-xs" style={{ color: look.muted }}>{formatPrice(price)}</span>}
                            </Link>
                          ) : (
                            <span key={s.id} className="min-w-[104px] cursor-not-allowed rounded-xl border border-white/10 px-4 py-3 text-center opacity-50">
                              <span className="block font-display text-lg font-bold line-through">{formatEventTime(s.startTime)}</span>
                              <span className="block text-xs">{sold ? "Sold out. Wow." : "Sales closed"}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          )}

          {/* Price and reassurance */}
          {from !== null && (
            <Reveal className="mt-12">
              <div className="rounded-2xl border border-white/10 p-6 md:p-8" style={{ background: "rgba(255,255,255,.03)" }}>
                <p className="text-sm" style={{ color: look.muted }}>Seats from</p>
                <p className="font-display text-4xl font-bold">{formatPrice(from)}</p>
                <p className="mt-1" style={{ color: look.muted }}>
                  Get it for less than what our competitors charge, and we have caramel popcorn 😉
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  {[
                    { icon: Armchair, t: "Your exact seat", d: "See the hall, tap the seat you want. Taken ones can't be clicked, no awkward surprises." },
                    { icon: Wallet, t: "Pay with M-Pesa", d: "No card, no account. The price you see is the price you pay." },
                    { icon: MailCheck, t: "Ticket in your inbox", d: "We email your ticket with your seat on it, as soon as the payment is confirmed." },
                  ].map(({ icon: Icon, t, d }) => (
                    <div key={t} className="flex gap-3">
                      <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: look.accent }} />
                      <div>
                        <p className="font-semibold">{t}</p>
                        <p className="text-sm" style={{ color: look.muted }}>{d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          )}
        </section>
      </div>
    </Layout>
  );
}
