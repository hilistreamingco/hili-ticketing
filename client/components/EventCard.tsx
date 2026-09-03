import { Link } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import {
  HiliEvent,
  formatEventDate,
  formatEventTime,
  startingPrice,
} from "@/lib/events";
import { cn } from "@/lib/utils";

export default function EventCard({
  event,
  size = "default",
}: {
  event: HiliEvent;
  size?: "default" | "large";
}) {
  return (
    <Link
      to={`/events/${event.slug}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-transform duration-300 hover:-translate-y-1"
    >
      <div
        className={cn(
          "relative overflow-hidden",
          size === "large" ? "aspect-[16/10]" : "aspect-[4/3]",
        )}
      >
        <img
          src={event.coverImage}
          alt={event.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">
          {event.category}
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          {formatEventDate(event.date)}
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-display text-lg font-semibold leading-snug text-foreground line-clamp-1">
          {event.title}
        </h3>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          <span>
            {formatEventDate(event.date)} &middot; {formatEventTime(event.startTime)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-1">
            {event.venue}, {event.city}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <img
              src={event.organizer.avatar}
              alt={event.organizer.name}
              className="h-5 w-5 rounded-full object-cover"
            />
            <span className="text-xs text-muted-foreground line-clamp-1">
              {event.organizer.name}
            </span>
          </div>
          <span className="text-sm font-semibold text-foreground">
            From {startingPrice(event)}
          </span>
        </div>
      </div>
    </Link>
  );
}
