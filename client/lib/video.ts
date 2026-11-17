// Turns a pasted link into something the site can play.
// Supports YouTube, Vimeo and direct video files (.mp4 / .webm / .mov).

export type VideoSource =
  | { kind: "youtube"; id: string; embedUrl: string; thumb: string }
  | { kind: "vimeo"; id: string; embedUrl: string; thumb: null }
  | { kind: "file"; url: string };

export function parseVideoUrl(raw: string | null | undefined): VideoSource | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

  let ytId: string | null = null;
  if (host === "youtu.be") ytId = url.pathname.slice(1).split("/")[0] || null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") ytId = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{6,})/);
      if (m) ytId = m[2];
    }
  }
  if (ytId && /^[\w-]{6,20}$/.test(ytId)) {
    return {
      kind: "youtube",
      id: ytId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1&autoplay=1`,
      thumb: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
    };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = url.pathname.match(/(\d{5,})/);
    if (m) return { kind: "vimeo", id: m[1], embedUrl: `https://player.vimeo.com/video/${m[1]}?autoplay=1&title=0&byline=0`, thumb: null };
  }

  if (/\.(mp4|webm|mov|m4v)$/i.test(url.pathname)) return { kind: "file", url: url.toString() };
  return null;
}