/**
 * Movies: public reads (only published movies are visible, enforced by the database).
 * Each movie has a "look" so Dune can feel like Dune and a superhero film like one.
 * Colours are dark and restrained on purpose: no neon.
 */
import { supabase, type MovieRow, type MovieLook } from "./supabase";
import { getEvents, isPastEvent, sortEvents, type HiliEvent } from "./events";

export type Movie = {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  synopsis: string;
  poster: string;
  backdrop: string;
  backdropVideo: string | null;
  trailer: string | null;
  rating: string;
  runtimeMin: number | null;
  genres: string;
  look: MovieLook;
  accent: string;
};

export type Look = {
  label: string;
  /** page background, deepest layer */
  bg: string;
  /** soft glow behind the hero */
  glow: string;
  text: string;
  muted: string;
  accent: string;
  /** title style */
  titleClass: string;
  /** one-line microcopy for the showtimes section */
  showtimesLine: string;
};

export const LOOKS: Record<MovieLook, Look> = {
  desert: {
    label: "Desert (epic, sandy)",
    bg: "#120d08", glow: "rgba(217,160,91,.22)", text: "#f4e8d2", muted: "rgba(244,232,210,.62)", accent: "#d9a05b",
    titleClass: "uppercase tracking-[.12em] font-semibold",
    showtimesLine: "Pick a time. The spice is optional, the popcorn is not.",
  },
  heroic: {
    label: "Heroic (bold, blue and gold)",
    bg: "#080c18", glow: "rgba(70,110,200,.28)", text: "#eef1fa", muted: "rgba(238,241,250,.62)", accent: "#d8b04a",
    titleClass: "uppercase tracking-tight font-extrabold",
    showtimesLine: "Assemble your squad, then pick a time.",
  },
  noir: {
    label: "Noir (black and white, moody)",
    bg: "#0a0a0a", glow: "rgba(255,255,255,.10)", text: "#f2f2f2", muted: "rgba(242,242,242,.6)", accent: "#e8e8e8",
    titleClass: "tracking-tight font-bold",
    showtimesLine: "Lights down, phones away. Pick a time.",
  },
  midnight: {
    label: "Midnight (cool, calm)",
    bg: "#090d16", glow: "rgba(95,170,175,.20)", text: "#e9f1f3", muted: "rgba(233,241,243,.6)", accent: "#6fb7b8",
    titleClass: "tracking-tight font-semibold",
    showtimesLine: "Quiet night? Make it a big screen night.",
  },
  ember: {
    label: "Ember (tense, horror)",
    bg: "#110807", glow: "rgba(200,80,55,.22)", text: "#f5e6e1", muted: "rgba(245,230,225,.6)", accent: "#d4553a",
    titleClass: "uppercase tracking-[.08em] font-bold",
    showtimesLine: "Grab someone to hold onto. Then pick a time.",
  },
};

export function lookFor(m: Movie): Look {
  const base = LOOKS[m.look] ?? LOOKS.noir;
  return m.accent ? { ...base, accent: m.accent } : base;
}

function map(r: MovieRow): Movie {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    tagline: r.tagline ?? "",
    synopsis: r.synopsis ?? "",
    poster: r.poster_url ?? "/placeholder-event.jpg",
    backdrop: r.backdrop_url || r.poster_url || "/placeholder-event.jpg",
    backdropVideo: r.backdrop_video_url || null,
    trailer: r.trailer_url || null,
    rating: r.rating ?? "",
    runtimeMin: r.runtime_min,
    genres: r.genres ?? "",
    look: r.look ?? "noir",
    accent: r.accent ?? "",
  };
}

export async function getMovies(): Promise<Movie[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("movies").select("*").eq("is_published", true).order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as MovieRow[]).map(map);
}

export async function getMovieBySlug(slug: string): Promise<Movie | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("movies").select("*").eq("slug", slug).eq("is_published", true).maybeSingle();
  return data ? map(data as MovieRow) : null;
}

/** Upcoming showtimes (events linked to a movie), soonest first. */
export async function getShowtimes(movieId?: string): Promise<HiliEvent[]> {
  const all = await getEvents();
  return sortEvents(all.filter((e) => e.movieId && (!movieId || e.movieId === movieId) && !isPastEvent(e)));
}

/** What a seat costs right now (cinema pricing by seats taken), else the cheapest tier. */
export function currentPrice(e: HiliEvent): number | null {
  if (e.pricingMode === "seats_taken" && e.brackets.length) {
    const next = e.seatsTaken + 1;
    let price = e.brackets[0].price;
    for (const b of e.brackets) if (b.fromSeat <= next) price = b.price;
    return price;
  }
  const open = e.ticketTypes.filter((t) => t.state === "on_sale");
  const list = open.length ? open : e.ticketTypes;
  return list.length ? Math.min(...list.map((t) => t.price)) : null;
}

export function runtimeText(min: number | null): string {
  if (!min) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m ? `${m}m` : ""}`.trim() : `${m}m`;
}
