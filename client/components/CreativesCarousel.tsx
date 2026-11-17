import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type Creative = { image: string; caption: string };

const SLIDE_MS = 6000;

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    try {
      const m = window.matchMedia("(prefers-reduced-motion: reduce)");
      const on = () => setReduce(m.matches);
      on();
      m.addEventListener?.("change", on);
      return () => m.removeEventListener?.("change", on);
    } catch {
      return undefined;
    }
  }, []);
  return reduce;
}

/**
 * A quiet, cinematic stage for the creatives.
 * One large picture at a time. A new picture wipes in over the old one from the
 * side (a curtain reveal) while the old one drifts back and dims, and the caption
 * rises into place. Thin segmented bars show progress; arrows, swipe and the
 * keyboard all work. Pauses when the pointer is over it or the tab is hidden.
 * One picture: shown plainly. "Reduce motion": simple cross-fade, no autoplay.
 */
export default function CreativesCarousel({ items }: { items: Creative[] }) {
  const n = items.length;
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [tick, setTick] = useState(0); // restarts the progress bar on every change
  const hover = useRef(false);
  const touchX = useRef<number | null>(null);
  const clearPrev = useRef<number | undefined>(undefined);

  const go = useCallback(
    (to: number, d: 1 | -1) => {
      if (n < 2) return;
      const next = (to + n) % n;
      setActive((cur) => {
        if (next === cur) return cur;
        setPrev(cur);
        setDir(d);
        return next;
      });
      setTick((t) => t + 1);
      window.clearTimeout(clearPrev.current);
      clearPrev.current = window.setTimeout(() => setPrev(null), 1300);
    },
    [n],
  );

  useEffect(() => () => window.clearTimeout(clearPrev.current), []);

  useEffect(() => {
    if (n < 2 || reduce) return;
    const id = window.setTimeout(() => {
      if (hover.current || document.hidden) setTick((t) => t + 1);
      else go(active + 1, 1);
    }, SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [active, tick, n, reduce, go]);

  if (n === 0) return null;
  const cur = items[active % n];

  if (n === 1) {
    return (
      <figure className="mx-auto max-w-4xl">
        <img src={cur.image} alt={cur.caption || "Hili creative"} className="aspect-[16/10] w-full rounded-2xl object-cover" />
        {cur.caption && <figcaption className="mt-4 text-center text-sm text-white/70">{cur.caption}</figcaption>}
      </figure>
    );
  }

  const layer = (i: number, role: "in" | "out" | "idle") => {
    const style: React.CSSProperties = reduce
      ? { opacity: role === "out" ? 0 : 1, transition: "opacity 600ms ease" }
      : role === "in"
      ? { animation: `cc-in-${dir > 0 ? "r" : "l"} 1100ms cubic-bezier(.7,0,.2,1) both`, zIndex: 3 }
      : role === "out"
      ? { animation: `cc-out-${dir > 0 ? "r" : "l"} 1100ms cubic-bezier(.7,0,.2,1) both`, zIndex: 2 }
      : { zIndex: 1, opacity: 0 };
    return (
      <div key={`${i}-${role}-${tick}`} className="absolute inset-0 overflow-hidden" style={style} aria-hidden={role !== "in"}>
        <img
          src={items[i].image}
          alt={role === "in" ? items[i].caption || "Hili creative" : ""}
          draggable={false}
          className="h-full w-full object-cover"
          style={!reduce && role === "in" ? { animation: "cc-zoom 7000ms ease-out both" } : undefined}
        />
      </div>
    );
  };

  return (
    <div
      className="mx-auto max-w-5xl"
      onMouseEnter={() => (hover.current = true)}
      onMouseLeave={() => (hover.current = false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      }}
      role="region"
      aria-roledescription="carousel"
      aria-label="Creatives"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(active + 1, 1);
        if (e.key === "ArrowLeft") go(active - 1, -1);
      }}
    >
      <style>{`
        @keyframes cc-in-r  { from { clip-path: inset(0 0 0 100%); } to { clip-path: inset(0 0 0 0); } }
        @keyframes cc-in-l  { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
        @keyframes cc-out-r { from { transform: translateX(0) scale(1);  filter: brightness(1); }
                              to   { transform: translateX(-6%) scale(1.04); filter: brightness(.35); } }
        @keyframes cc-out-l { from { transform: translateX(0) scale(1);  filter: brightness(1); }
                              to   { transform: translateX(6%) scale(1.04); filter: brightness(.35); } }
        @keyframes cc-zoom  { from { transform: scale(1.08); } to { transform: scale(1); } }
        @keyframes cc-cap   { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cc-bar   { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      `}</style>

      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-[#111] ring-1 ring-white/10 sm:aspect-[16/10]">
        {prev !== null && layer(prev, "out")}
        {layer(active, prev === null ? "idle" : "in")}
        {prev === null && (
          // settled picture, shown without re-running the wipe
          <div className="absolute inset-0 z-[2] overflow-hidden">
            <img src={cur.image} alt={cur.caption || "Hili creative"} draggable={false} className="h-full w-full object-cover" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 z-[4] bg-gradient-to-t from-black/80 via-black/10 to-black/20" />

        <div className="absolute inset-x-0 bottom-0 z-[5] flex items-end justify-between gap-4 p-5 sm:p-8">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-white/50">
              {String(active + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
            </p>
            {cur.caption && (
              <p
                key={`cap-${active}`}
                className="mt-2 max-w-xl font-display text-xl font-semibold leading-snug text-white sm:text-3xl"
                style={reduce ? undefined : { animation: "cc-cap 800ms cubic-bezier(.2,.7,.2,1) 450ms both" }}
              >
                {cur.caption}
              </p>
            )}
          </div>
          <div className="hidden shrink-0 gap-2 sm:flex">
            <button type="button" aria-label="Previous" onClick={() => go(active - 1, -1)}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur transition hover:bg-white hover:text-black">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Next" onClick={() => go(active + 1, 1)}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur transition hover:bg-white hover:text-black">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Progress: one thin bar per picture */}
      <div className="mt-4 flex gap-2" role="tablist" aria-label="Choose a picture">
        {items.map((it, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Show picture ${i + 1}`}
            onClick={() => go(i, i > active ? 1 : -1)}
            className="group relative h-6 flex-1"
          >
            <span className="absolute inset-x-0 top-1/2 block h-[2px] -translate-y-1/2 overflow-hidden rounded bg-white/15 transition-all group-hover:h-[3px]">
              <span
                key={i === active ? `on-${tick}` : `off-${i}`}
                className="block h-full origin-left bg-white/80"
                style={
                  i < active || (reduce && i === active)
                    ? { transform: "scaleX(1)" }
                    : i === active
                    ? { animation: `cc-bar ${SLIDE_MS}ms linear both` }
                    : { transform: "scaleX(0)" }
                }
              />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
