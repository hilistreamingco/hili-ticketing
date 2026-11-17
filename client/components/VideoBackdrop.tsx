import { useEffect, useRef, useState } from "react";

/**
 * Silent looping video used as a background (home hero, event banner).
 * - Plays only when allowed: skipped for "reduce motion" and Data Saver users.
 * - The poster image shows first and stays if the video cannot load, so a slow
 *   connection or a broken link never leaves an empty box.
 * - muted + playsInline are required for autoplay on iPhones and iPads.
 */
export default function VideoBackdrop({
  src,
  poster,
  className = "",
}: {
  src: string;
  poster?: string | null;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const saveData = (navigator as any).connection?.saveData === true;
      setAllowed(!reduce && !saveData);
    } catch {
      setAllowed(true);
    }
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!v || !allowed) return;
    v.muted = true;
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => setReady(false));
  }, [allowed, src]);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {poster && <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      {allowed && (
        <video
          ref={ref}
          src={src}
          poster={poster ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onPlaying={() => setReady(true)}
          onError={() => setReady(false)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}