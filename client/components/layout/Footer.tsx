import { Link } from "react-router-dom";
import { Ticket } from "lucide-react";

const columns = [
  {
    title: "Platform",
    links: [
      { label: "Discover", to: "/" },
      { label: "Events", to: "/events" },
      { label: "Create Event", to: "/create-event" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "My Tickets", to: "/my-tickets" },
      { label: "Login", to: "/login" },
    ],
  },
  {
    title: "Organizers",
    links: [{ label: "Admin Dashboard", to: "/admin" }],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Ticket className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">
              Hili<span className="text-primary">.</span>
            </span>
          </Link>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            One platform, unlimited events. Discover, host, and manage
            unforgettable experiences across Kenya.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h4 className="font-display text-sm font-semibold text-foreground">
              {col.title}
            </h4>
            <ul className="mt-4 space-y-2">
              {col.links.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="container flex flex-col items-center justify-between gap-2 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row">
        <span>© {new Date().getFullYear()} Hili Ticketing. All rights reserved.</span>
        <span>Made for events across Kenya</span>
      </div>
    </footer>
  );
}
