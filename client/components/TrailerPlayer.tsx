import { Play } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { parseVideoUrl } from "@/lib/video";

/**
 * "Watch trailer" button that opens a mini player on top of the page.
 * Takes no room on the page itself, and nothing loads until it is opened.
 * Renders nothing at all if there is no usable link.
 */
export default function TrailerButton({ url, title }: { url: string | null | undefined; title: string }) {
  const src = parseVideoUrl(url);
  if (!src) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/25"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--event-primary,#c1ff1a)] text-black">
            <Play className="h-3 w-3 translate-x-px fill-current" />
          </span>
          Watch trailer
        </button>
      </DialogTrigger>
      <DialogContent className="w-[94vw] max-w-3xl border-0 bg-black p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">{title} trailer</DialogTitle>
        <div className="aspect-video w-full overflow-hidden sm:rounded-2xl">
          {src.kind === "file" ? (
            <video src={src.url} controls autoPlay playsInline className="h-full w-full" />
          ) : (
            <iframe
              src={src.embedUrl}
              title={`${title} trailer`}
              className="h-full w-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          )}
        </div>
        {src.kind !== "file" && (
          <a
            href={src.watchUrl}
            target="_blank"
            rel="noreferrer"
            className="block px-4 pb-3 text-center text-xs text-white/60 hover:text-white"
          >
            Video not playing? Open it in a new tab
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}