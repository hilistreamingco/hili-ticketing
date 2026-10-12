import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, HardHat, LogIn, TicketCheck, Users } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import Index from "./pages/Index";
import EventPage from "./pages/EventPage";
import CampaignPage from "./pages/CampaignPage";
import TicketSelectionPage from "./pages/TicketSelectionPage";
import SeatSelectionPage from "./pages/SeatSelectionPage";
import AttendeePage from "./pages/AttendeePage";
import CheckoutPage from "./pages/CheckoutPage";
import ContactPage from "./pages/ContactPage";
import { TermsPage, PrivacyPage } from "./pages/LegalPages";
import AdminPage from "./pages/AdminPage";
import PrestigePage from "./pages/PrestigePage";
import NotFound from "./pages/NotFound";
import PlaceholderPage from "./components/PlaceholderPage";
import Layout from "./components/layout/Layout";
import EventCard from "./components/EventCard";
import { getEvents, groupEventsByDate, formatEventDate, subscribeToEvents, type HiliEvent } from "./lib/events";
import { getSiteSettings } from "./lib/supabase";

const queryClient = new QueryClient();

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function EventsPage() {
  const [events, setEvents] = useState<HiliEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const rows = await getEvents();
      if (active) { setEvents(rows); setLoading(false); }
    };
    void load();
    const unsub = subscribeToEvents(() => void load());
    return () => { active = false; unsub(); };
  }, []);

  const groups = groupEventsByDate(events);

  return (
    <Layout>
      <div className="container py-16 md:py-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Explore</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">All events</h1>
        <p className="mt-3 max-w-lg text-muted-foreground">Find something to look forward to, from Nairobi nights to coastal weekends.</p>
        {loading && <p className="mt-10 text-sm text-muted-foreground">Loading events…</p>}
        {!loading && events.length === 0 && <p className="mt-10 text-sm text-muted-foreground">No events yet. Check back soon.</p>}
        <div className="mt-10 space-y-12">
          {groups.map((group) => (
            <div key={group.date || "tba"}>
              <h2 className="border-b border-border pb-3 font-display text-lg font-bold">
                {group.date ? formatEventDate(group.date) : "Date to be announced"}
              </h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {group.events.map((event) => <EventCard key={event.id} event={event} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}

function App() {
  return <><QueryClientProvider client={queryClient}><TooltipProvider><Toaster /><Sonner /><BrowserRouter><ScrollToTop /><MaintenanceGate><Routes>
    <Route path="/" element={<Index />} />
    <Route path="/events" element={<EventsPage />} />
    <Route path="/events/:slug" element={<EventPage />} />
    <Route path="/campaign/:slug" element={<CampaignPage />} />
    <Route path="/upcoming" element={<Navigate to="/events" replace />} />
    <Route path="/future" element={<Navigate to="/events" replace />} />
    <Route path="/tickets/:slug" element={<TicketSelectionPage />} />
    <Route path="/seats/:slug" element={<SeatSelectionPage />} />
    <Route path="/attendee/:slug" element={<AttendeePage />} />
    <Route path="/checkout/:slug" element={<CheckoutPage />} />
    <Route path="/terms" element={<TermsPage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/contact" element={<ContactPage />} />
    <Route path="/my-tickets" element={<PlaceholderPage title="Your tickets, all in one place" description="Sign in to see upcoming events, digital tickets, and QR codes." icon={TicketCheck} />} />
    <Route path="/create-event" element={<PlaceholderPage title="Create something people will remember" description="The event creation studio is being prepared for organizers." icon={CalendarDays} />} />
    <Route path="/login" element={<PlaceholderPage title="Welcome back" description="Account login and registration will be available here." icon={LogIn} />} />
    <Route path="/admin" element={<AdminPage />} />
    <Route path="/admin/attendees" element={<PlaceholderPage title="Attendees" description="Search, filter, and manage your event attendees." icon={Users} />} />
    <Route path="/admin/prestige" element={<PrestigePage />} />
    <Route path="*" element={<NotFound />} />
  </Routes></MaintenanceGate></BrowserRouter></TooltipProvider></QueryClientProvider><Analytics /></>;
}

// Full-screen "page under construction" smokescreen. Toggled from the Hili
// admin dashboard (Overview tab). Admin routes stay reachable so the toggle
// can be turned off again.
function MaintenanceGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [maintenance, setMaintenance] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getSiteSettings().then((settings) => {
      if (active) setMaintenance(settings.maintenance_mode === true);
    }).catch(() => { if (active) setMaintenance(false); });
    return () => { active = false; };
  }, []);

  // Admin and Prestige routes always work (so the toggle can be flipped).
  if (pathname.startsWith("/admin")) return <>{children}</>;

  // While loading the setting, render normally (never blank the site).
  if (maintenance === null) return <>{children}</>;

  if (maintenance) return <MaintenancePage />;

  return <>{children}</>;
}

function MaintenancePage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0b0b0b] px-6 text-center text-white">
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-[#c1ff1a] blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-[#c1ff1a] blur-3xl" />
      </div>
      <div className="relative">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-[#c1ff1a]/10 border border-[#c1ff1a]/30">
          <HardHat className="h-10 w-10 text-[#c1ff1a]" />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-[#c1ff1a]">Hili Ticketing</p>
        <h1 className="mt-6 font-display text-4xl font-bold tracking-tight sm:text-6xl">
          We're making something great.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-lg text-white/60">
          The site is under construction while we roll out improvements. Please check back again soon — we'll be live before you know it.
        </p>
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-white/40">
          <span className="inline-flex h-2 w-2 rounded-full bg-[#c1ff1a] animate-pulse" />
          <span>Check back again soon</span>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
