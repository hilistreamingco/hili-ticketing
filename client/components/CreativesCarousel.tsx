import { useEffect, useRef, useState } from "react";

export type Creative = { image: string; caption: string };

function useMedia(query: string, initial = false) {
  const [match, setMatch] = useState(initial);
  useEffect(() => {
    try {
      const m = window.matchMedia(query);
      const on = () => setMatch(m.matches);
      on();
      m.addEventListener?.("change", on);
      return () => m.removeEventListener?.("change", on);
    } catch {
      return undefined;
    }
  }, [query]);
  return match;
}

/**
 * Pictures from past events.
 * - 1 picture: shown plainly, no motion.
 * - 2 or more, desktop: a 3D ring that turns on a flat (zero) plane.
 * - 2 or more, phones and "reduce motion": a gentle fade between pictures.
 * Only the picture in focus shows its caption.
 */
export default function CreativesCarousel({ items }: { items: Creative[] }) {
  const n = items.length;
  const wide = useMedia("(min-width: 768px)");
  const reduce = useMedia("(prefers-reduced-motion: reduce)");
  const [active, setActive] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (n < 2 || reduce) return;
    const id = window.setInterval(() => {
      if (!paused.current && !document.hidden) setActive((a) => (a + 1) % n);
    }, wide ? 4200 : 4800);
    return () => window.clearInterval(id);
  }, [n, reduce, wide]);

  useEffect(() => { if (active >= n) setActive(0); }, [n, active]);

  if (n === 0) return null;

  const caption = items[Math.min(active, n - 1)]?.caption;

  // One picture: no effects.
  if (n === 1) {
    return (
      <figure className="mx-auto w-full max-w-md">
        <img src={items[0].image} alt={items[0].caption || "Event creative"} loading="lazy" className="w-full rounded-2xl object-cover shadow-2xl" />
        {items[0].caption && <figcaption className="mt-4 text-center text-sm text-white/70">{items[0].caption}</figcaption>}
      </figure>
    );
  }

  const dots = (
    <div className="mt-6 flex justify-center gap-2" role="tablist" aria-label="Choose picture">
      {items.map((_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === active}
          aria-label={`Picture ${i + 1}`}
          onClick={() => setActive(i)}
          className={`h-2 rounded-full transition-all ${i === active ? "w-6 bg-[#c1ff1a]" : "w-2 bg-white/30 hover:bg-white/50"}`}
        />
      ))}
    </div>
  );

  const captionEl = (
    <p key={active} className="mx-auto mt-6 min-h-[1.5rem] max-w-md animate-in fade-in text-center text-sm text-white/75 duration-500">
      {caption}
    </p>
  );

  // Phones / reduced motion: fade.
  if (!wide || reduce) {
    return (
      <div
        onTouchStart={() => { paused.current = true; }}
        onTouchEnd={() => { window.setTimeout(() => { paused.current = false; }, 4000); }}
      >
        <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-2xl bg-white/5 shadow-2xl">
          {items.map((c, i) => (
            <img
              key={i}
              src={c.image}
              alt={c.caption || "Event creative"}
              loading={i === 0 ? "eager" : "lazy"}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${i === active ? "opacity-100" : "opacity-0"}`}
            />
          ))}
        </div>
        {captionEl}
        {dots}
      </div>
    );
  }

  // Desktop: ring on the flat plane.
  const cardW = 300;
  const cardH = 380;
  const step = 360 / n;
  const radius = Math.max(cardW / 2 / Math.tan(Math.PI / n), 300);

  return (
    <div onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }}>
      <div className="relative mx-auto" style={{ height: cardH + 40, perspective: 1600 }}>
        <div
          className="absolute left-1/2 top-5 transition-transform duration-[1100ms] ease-in-out"
          style={{
            width: cardW,
            height: cardH,
            marginLeft: -cardW / 2,
            transformStyle: "preserve-3d",
            transform: `translateZ(${-radius}px) rotateY(${-active * step}deg)`,
          }}
        >
          {items.map((c, i) => {
            const focus = i === active;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={c.caption || `Picture ${i + 1}`}
                className="absolute inset-0 overflow-hidden rounded-2xl bg-white/5 shadow-2xl transition-opacity duration-700"
                style={{
                  transform: `rotateY(${i * step}deg) translateZ(${radius}px)`,
                  opacity: focus ? 1 : 0.35,
                  backfaceVisibility: "hidden",
                }}
              >
                <img src={c.image} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
      </div>
      {captionEl}
      {dots}
    </div>
  );
}
