import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CalendarDays, CreditCard, LayoutDashboard, LogIn, TicketCheck, Users } from "lucide-react";
import Index from "./pages/Index";
import EventPage from "./pages/EventPage";
import NotFound from "./pages/NotFound";
import PlaceholderPage from "./components/PlaceholderPage";
import Layout from "./components/layout/Layout";
import EventCard from "./components/EventCard";
import { events } from "./lib/events";

const queryClient = new QueryClient();

function EventsPage() {
  return <Layout><div className="container py-16 md:py-20"><p className="text-sm font-semibold uppercase tracking-widest text-primary">Explore</p><h1 className="mt-2 font-display text-4xl font-bold tracking-tight">All events</h1><p className="mt-3 max-w-lg text-muted-foreground">Find something to look forward to, from Nairobi nights to coastal weekends.</p><div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{events.map((event) => <EventCard key={event.id} event={event} />)}</div></div></Layout>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><Toaster /><Sonner /><BrowserRouter><Routes>
    <Route path="/" element={<Index />} />
    <Route path="/events" element={<EventsPage />} />
    <Route path="/events/:slug" element={<EventPage />} />
    <Route path="/my-tickets" element={<PlaceholderPage title="Your tickets, all in one place" description="Sign in to see upcoming events, digital tickets, and QR codes." icon={TicketCheck} />} />
    <Route path="/create-event" element={<PlaceholderPage title="Create something people will remember" description="The event creation studio is being prepared for organizers." icon={CalendarDays} />} />
    <Route path="/checkout/:slug" element={<PlaceholderPage title="Simple, secure checkout" description="Checkout with attendee details and M-Pesa will be built here next." icon={CreditCard} />} />
    <Route path="/login" element={<PlaceholderPage title="Welcome back" description="Account login and registration will be available here." icon={LogIn} />} />
    <Route path="/admin" element={<PlaceholderPage title="Organizer dashboard" description="Manage events, ticket sales, attendees, and check-ins from one place." icon={LayoutDashboard} />} />
    <Route path="/admin/attendees" element={<PlaceholderPage title="Attendees" description="Search, filter, and manage your event attendees." icon={Users} />} />
    <Route path="*" element={<NotFound />} />
  </Routes></BrowserRouter></TooltipProvider></QueryClientProvider>;
}

createRoot(document.getElementById("root")!).render(<App />);
