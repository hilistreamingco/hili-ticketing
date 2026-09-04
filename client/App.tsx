import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { CalendarDays, LogIn, TicketCheck, Users } from "lucide-react";
import Index from "./pages/Index";
import EventPage from "./pages/EventPage";
import UpcomingPage from "./pages/UpcomingPage";
import TicketSelectionPage from "./pages/TicketSelectionPage";
import AttendeePage from "./pages/AttendeePage";
import CheckoutPage from "./pages/CheckoutPage";
import { TermsPage, PrivacyPage } from "./pages/LegalPages";
import AdminPage from "./pages/AdminPage";
import NotFound from "./pages/NotFound";
import PlaceholderPage from "./components/PlaceholderPage";
import Layout from "./components/layout/Layout";
import EventCard from "./components/EventCard";
import { events } from "./lib/events";

const queryClient = new QueryClient();

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function EventsPage() {
  return <Layout><div className="container py-16 md:py-20"><p className="text-sm font-semibold uppercase tracking-widest text-primary">Explore</p><h1 className="mt-2 font-display text-4xl font-bold tracking-tight">All events</h1><p className="mt-3 max-w-lg text-muted-foreground">Find something to look forward to, from Nairobi nights to coastal weekends.</p><div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{events.map((event) => <EventCard key={event.id} event={event} />)}</div></div></Layout>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><Toaster /><Sonner /><BrowserRouter><ScrollToTop /><Routes>
    <Route path="/" element={<Index />} />
    <Route path="/events" element={<EventsPage />} />
    <Route path="/events/:slug" element={<EventPage />} />
    <Route path="/upcoming" element={<UpcomingPage />} />
    <Route path="/tickets/:slug" element={<TicketSelectionPage />} />
    <Route path="/attendee/:slug" element={<AttendeePage />} />
    <Route path="/checkout/:slug" element={<CheckoutPage />} />
    <Route path="/terms" element={<TermsPage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/my-tickets" element={<PlaceholderPage title="Your tickets, all in one place" description="Sign in to see upcoming events, digital tickets, and QR codes." icon={TicketCheck} />} />
    <Route path="/create-event" element={<PlaceholderPage title="Create something people will remember" description="The event creation studio is being prepared for organizers." icon={CalendarDays} />} />
    <Route path="/login" element={<PlaceholderPage title="Welcome back" description="Account login and registration will be available here." icon={LogIn} />} />
    <Route path="/admin" element={<AdminPage />} />
    <Route path="/admin/attendees" element={<PlaceholderPage title="Attendees" description="Search, filter, and manage your event attendees." icon={Users} />} />
    <Route path="*" element={<NotFound />} />
  </Routes></BrowserRouter></TooltipProvider></QueryClientProvider>;
}

createRoot(document.getElementById("root")!).render(<App />);
