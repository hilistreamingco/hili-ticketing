import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Upload,
  Users,
  AlertTriangle,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getAdminEvents,
  getAdminEvent,
  createAdminEvent,
  saveAdminEvent,
  deleteAdminEvent,
  getAdminTicketTypes,
  saveAdminTicketType,
  deleteAdminTicketType,
  uploadEventPoster,
  getAdminTickets,
  getAdminStats,
  getAdminBrackets,
  saveAdminBrackets,
  getEventSalesOverview,
  savePrestigePaymentConfig,
  fetchPaymentConfig,
  supabase,
  type AdminEvent,
  type AdminTicketType,
  type AdminTicket,
  type AdminStats,
  type EventSalesOverview,
  type EventType,
  type PricingMode,
  type SalesOverride,
} from "@/lib/supabase";
import { formatNairobi, isoToNairobiInput, nairobiInputToIso } from "@/lib/time";

type Tab = "Overview" | "Events" | "Attendees" | "Payment config";

// ── Root ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    void supabase.auth.getSession().then(({ data }) => {
      setAuthed(Boolean(data.session));
      setChecking(false);
    });
  }, []);

  if (checking) return <Spinner full />;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return <Dashboard onLogout={async () => { await supabase?.auth.signOut(); setAuthed(false); }} />;
}

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return setErr("Supabase is not configured.");
    setLoading(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setLoading(false);
    if (error) setErr(error.message);
    else onLogin();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] px-5">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0b0b0b]">
            <img src="/favicon.svg" alt="Hili" className="h-7 w-7 object-contain" />
          </div>
          <strong className="font-display text-xl">Hili Admin</strong>
        </div>
        <h1 className="mt-8 font-display text-3xl font-bold">Welcome back.</h1>
        {err && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        <label className="mt-6 block text-sm font-semibold">Email
          <Input className="mt-2" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        <label className="mt-4 block text-sm font-semibold">Password
          <Input className="mt-2" type="password" value={pw} onChange={e => setPw(e.target.value)} required />
        </label>
        <Button className="mt-6 h-12 w-full bg-[#c1e51a] text-black hover:bg-[#b1d410]" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

// ── Dashboard shell ───────────────────────────────────────────────────────────
function Dashboard({ onLogout }: { onLogout: () => void }) {
  // The event being edited lives in the URL (?event=<id>, or "new"), so it
  // survives a refresh and signing back in. Nothing is guessed any more.
  const [params, setParams] = useSearchParams();
  const selectedEvent = params.get("event");
  const selectEvent = (id: string | null) => setParams(id ? { event: id } : {}, { replace: true });

  const [tab, setTab] = useState<Tab>(selectedEvent ? "Events" : "Overview");
  const tabs: { label: Tab; icon: typeof LayoutDashboard }[] = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Events", icon: CalendarDays },
    { label: "Attendees", icon: Users },
    { label: "Payment config", icon: Settings2 },
  ];

  // Auto-logout after 30 minutes of inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        alert('Session expired due to inactivity');
        onLogout();
      }, 30 * 60 * 1000); // 30 minutes
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimeout));
    resetTimeout();

    return () => {
      clearTimeout(timeout);
      events.forEach(event => window.removeEventListener(event, resetTimeout));
    };
  }, [onLogout]);

  return (
    <div className="min-h-screen bg-[#f4f4ef] text-[#0b0b0b]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[#0b0b0b] p-6 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c1ff1a]">
            <img src="/favicon.svg" alt="Hili" className="h-7 w-7 object-contain" />
          </div>
          <span className="font-display text-lg font-bold">Hili Admin</span>
        </div>
        <nav className="mt-12 space-y-1">
          {tabs.map(({ label, icon: Icon }) => (
            <button key={label} onClick={() => setTab(label)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${tab === label ? "bg-[#c1ff1a] font-semibold text-black" : "text-white/60 hover:bg-white/10 hover:text-white"}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>
        <Link to="/admin/prestige" className="mt-6 flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-xs text-white/50 hover:border-white/30 hover:text-white">
          <ExternalLink className="h-3.5 w-3.5" /> Open Prestige Dashboard
        </Link>
        <button onClick={onLogout} className="mt-4 flex items-center gap-2 text-sm text-white/40 hover:text-white">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      <main className="lg:pl-64">
        <header className="flex items-center justify-between border-b border-black/10 px-5 py-4 sm:px-10">
          <div>
            <p className="text-[10px] uppercase tracking-[.25em] text-black/45">Hili workspace</p>
            <h1 className="mt-1 font-display text-xl font-bold">{tab}</h1>
          </div>
          <div className="flex gap-1 overflow-x-auto lg:hidden">
            {tabs.map(({ label }) => (
              <button key={label} onClick={() => setTab(label)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${tab === label ? "bg-black text-white" : "bg-black/5"}`}>
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="p-5 sm:p-10">
          {tab === "Overview"       && <Overview />}
          {tab === "Events"         && <EventsTab selectedId={selectedEvent} onSelect={selectEvent} />}
          {tab === "Attendees"      && <Attendees />}
          {tab === "Payment config" && <PaymentConfigEditor preselectId={selectedEvent && selectedEvent !== "new" ? selectedEvent : null} />}
        </div>
      </main>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function Overview() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getAdminEvents().then(setEvents).catch(() => undefined); }, []);

  const load = useCallback(async () => {
    try {
      setStats(await getAdminStats(eventId || undefined));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the numbers");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-4xl font-bold">Your events at a glance.</h2>
        <div className="flex items-center gap-2">
          <select value={eventId} onChange={e => setEventId(e.target.value)}
            className="h-10 rounded-xl border border-black/15 bg-white px-3 text-sm">
            <option value="">All events</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); void load(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {error && <Banner ok={false} text={error} />}
      {loading && !stats ? <div className="mt-8 flex items-center gap-2 text-sm text-black/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : stats && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Published events" value={String(stats.events)} />
          <Metric label="Total orders" value={String(stats.orders)} />
          <Metric label="Confirmed orders" value={String(stats.confirmed)} />
          <Metric label="Tickets sold" value={String(stats.sold)} />
          <Metric label="Tickets issued" value={String(stats.attendees)} />
          <Metric label="Confirmed revenue" value={`KES ${stats.revenue.toLocaleString("en-KE")}`} accent />
        </div>
      )}
      <div className="mt-8 rounded-3xl border border-black/10 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-black/40">Note</p>
        <p className="mt-2 text-sm leading-7 text-black/60">
          Every event, on any date, is created and managed in the <strong>Events</strong> tab.
          The Prestige/BeerBirds team handles payment verification and ticket delivery in their own dashboard.
        </p>
      </div>
    </div>
  );
}
function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <p className="text-sm text-black/50">{label}</p>
      <p className={`mt-3 font-display text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

// ── Events: list + editor ─────────────────────────────────────────────────────
const STATUS_STYLE: Record<AdminEvent["status"], string> = {
  draft: "bg-black/5 text-black/50",
  published: "bg-green-100 text-green-800",
  archived: "bg-amber-100 text-amber-800",
};

function EventsTab({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setEvents(await getAdminEvents());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-black/50">Any number of events, on any dates</p>
          <h2 className="mt-1 font-display text-3xl font-bold">Events</h2>
        </div>
        <Button onClick={() => onSelect("new")} className="bg-[#c1e51a] text-black hover:bg-[#b1d410]">
          <Plus className="mr-2 h-4 w-4" /> New event
        </Button>
      </div>

      {error && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</span>
          <Button size="sm" variant="outline" onClick={() => { setLoading(true); void refresh(); }}>Retry</Button>
        </div>
      )}

      {loading && <div className="mt-6 flex items-center gap-2 text-sm text-black/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading events…</div>}

      {!loading && !error && events.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-black/15 bg-white p-6 text-center text-sm text-black/45">
          No events yet. Click “New event” to create the first one.
        </p>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {events.map(ev => (
          <button key={ev.id} type="button" onClick={() => onSelect(ev.id)}
            className={`rounded-2xl border bg-white p-4 text-left transition-colors ${selectedId === ev.id ? "border-black shadow-sm" : "border-black/10 hover:border-black/30"}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold leading-snug">{ev.name}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[ev.status]}`}>{ev.status}</span>
            </div>
            <p className="mt-1 text-xs text-black/50">
              {ev.event_date ?? "No date yet"}{ev.start_time ? ` · ${ev.start_time.slice(0, 5)}` : ""}
            </p>
            <p className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-black/45">
              <span className="rounded-full bg-black/5 px-2 py-0.5">{ev.event_type === "cinema" ? "Cinema · seat map" : "General"}</span>
              {ev.ticket_prefix && <span className="rounded-full bg-black/5 px-2 py-0.5 font-mono">{ev.ticket_prefix}</span>}
            </p>
          </button>
        ))}
      </div>

      {selectedId && (
        <div className="mt-10 border-t border-black/10 pt-10">
          <EventEditor
            key={selectedId}
            eventId={selectedId === "new" ? null : selectedId}
            onChanged={() => void refresh()}
            onSelect={onSelect}
          />
        </div>
      )}
    </div>
  );
}

type Draft = {
  name: string; short_description: string; description: string;
  venue: string; address: string; city: string;
  event_date: string; start_time: string; end_time: string; venue_map_url: string;
  status: AdminEvent["status"];
  event_type: EventType; ticket_prefix: string; max_seats_per_order: string; pricing_mode: PricingMode;
  sales_close_at: string; sales_override: SalesOverride;
};

const emptyDraft: Draft = {
  name: "", short_description: "", description: "",
  venue: "", address: "", city: "",
  event_date: "", start_time: "", end_time: "", venue_map_url: "",
  status: "draft",
  event_type: "general", ticket_prefix: "", max_seats_per_order: "6", pricing_mode: "tiers",
  sales_close_at: "", sales_override: "auto",
};

function draftFrom(ev: AdminEvent): Draft {
  return {
    name: ev.name,
    short_description: ev.short_description ?? "",
    description: ev.description ?? "",
    venue: ev.venue ?? "",
    address: ev.address ?? "",
    city: ev.city ?? "",
    event_date: ev.event_date ?? "",
    start_time: ev.start_time ?? "",
    end_time: ev.end_time ?? "",
    venue_map_url: ev.venue_map_url ?? "",
    status: ev.status,
    event_type: ev.event_type ?? "general",
    ticket_prefix: ev.ticket_prefix ?? "",
    max_seats_per_order: String(ev.max_seats_per_order ?? 6),
    pricing_mode: ev.pricing_mode ?? "tiers",
    sales_close_at: isoToNairobiInput(ev.sales_close_at),
    sales_override: ev.sales_override ?? "auto",
  };
}

const SALES_LABEL: Record<string, { text: string; cls: string }> = {
  open: { text: "Selling", cls: "bg-green-100 text-green-800" },
  not_started: { text: "Sales not started", cls: "bg-amber-100 text-amber-800" },
  sold_out: { text: "Sold out", cls: "bg-red-100 text-red-700" },
  closed: { text: "Sales closed", cls: "bg-black/10 text-black/60" },
};

function EventEditor({
  eventId,
  onChanged,
  onSelect,
}: {
  eventId: string | null;
  onChanged: () => void;
  onSelect: (id: string | null) => void;
}) {
  const [row, setRow] = useState<AdminEvent | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [poster, setPoster] = useState("");
  const [tiers, setTiers] = useState<AdminTicketType[]>([]);
  const [overview, setOverview] = useState<EventSalesOverview>(null);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const showMsg = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    if (ok) setTimeout(() => setMsg(null), 4000);
  };

  // Loads exactly the event that was selected. There is no realtime refresh
  // here: it used to overwrite unsaved edits and unsaved tiers whenever any
  // event or tier changed anywhere.
  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [ev, tierRows] = await Promise.all([getAdminEvent(eventId), getAdminTicketTypes(eventId)]);
      setRow(ev);
      setDraft(draftFrom(ev));
      setPoster(ev.poster_path ?? "");
      setTiers(tierRows);
      setOverview(await getEventSalesOverview(eventId));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this event");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }));

  const buildPayload = () => ({
    name: draft.name.trim(),
    short_description: draft.short_description || null,
    description: draft.description || null,
    venue: draft.venue || null,
    address: draft.address || null,
    city: draft.city || null,
    event_date: draft.event_date || null,
    start_time: draft.start_time || null,
    end_time: draft.end_time || null,
    venue_map_url: draft.venue_map_url || null,
    status: draft.status,
    poster_path: poster || null,
    event_type: draft.event_type,
    ticket_prefix: draft.ticket_prefix.trim().toUpperCase() || null,
    max_seats_per_order: Number(draft.max_seats_per_order) || 6,
    pricing_mode: draft.event_type === "cinema" ? draft.pricing_mode : ("tiers" as PricingMode),
    sales_close_at: nairobiInputToIso(draft.sales_close_at),
    sales_override: draft.sales_override,
  });

  // Returns the saved event, or null. A brand-new event is only created when
  // eventId is null; a failed load can never fall through to "create".
  const doSave = async (silent = false): Promise<AdminEvent | null> => {
    if (!draft.name.trim()) { showMsg("Event name is required.", false); return null; }
    if (eventId && (loadError || !row)) {
      showMsg("This event did not load, so saving is turned off. Reload the page and try again.", false);
      return null;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      const saved = row
        ? await saveAdminEvent({ id: row.id, ...payload })
        : await createAdminEvent(payload);
      setRow(saved);
      setDraft(draftFrom(saved));
      onChanged();
      if (!silent) {
        showMsg("Saved successfully.", true);
        if (!row) onSelect(saved.id);
        else setOverview(await getEventSalesOverview(saved.id));
      }
      return saved;
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not save";
      showMsg(text.includes("SERVICE_ROLE") ? text + " — set SUPABASE_SERVICE_ROLE_KEY in your .env file." : text, false);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const doUpload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const wasNew = !row;
      const target = row ?? (await doSave(true));
      if (!target) return;
      const { url } = await uploadEventPoster(file, target.id);
      setPoster(url);
      const saved = await saveAdminEvent({ id: target.id, poster_path: url });
      setRow(saved);
      onChanged();
      showMsg("Poster uploaded.", true);
      if (wasNew) onSelect(saved.id);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Upload failed", false);
    } finally {
      setUploading(false);
    }
  };

  const doDelete = async () => {
    if (!row) return;
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    try {
      await deleteAdminEvent(row.id);
      onChanged();
      onSelect(null);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Could not delete", false);
    }
  };

  if (loading) return <Spinner />;

  if (loadError) {
    return (
      <div className="max-w-5xl">
        <Banner ok={false} text={`Could not load this event: ${loadError}`} />
        <Button className="mt-4" variant="outline" onClick={() => void load()}>Try again</Button>
      </div>
    );
  }

  const sales = overview ? SALES_LABEL[overview.state] : null;

  return (
    <div className="max-w-5xl">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-black/50">{row ? "Editing event" : "New event"}</p>
          <h2 className="mt-1 font-display text-3xl font-bold">{row ? row.name : "New event"}</h2>
          {row && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-black/40">
              {sales && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${sales.cls}`}>{sales.text}</span>}
              {!overview && row.status !== "published" && <span className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold text-black/50">Not published</span>}
              <a href={`/events/${row.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-black">
                /events/{row.slug} <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Status pills */}
          <div className="flex gap-1 rounded-xl border border-black/10 bg-white p-1">
            {(["draft", "published", "archived"] as const).map(s => (
              <button key={s} onClick={() => set("status", s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${draft.status === s ? "bg-black text-white" : "text-black/40 hover:text-black"}`}>
                {s}
              </button>
            ))}
          </div>
          <Button onClick={() => void doSave()} disabled={saving} className="bg-[#c1e51a] text-black hover:bg-[#b1d410]">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
          {row && (
            <Button variant="ghost" onClick={() => void doDelete()} className="text-red-500 hover:bg-red-50 hover:text-red-700">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {msg && <Banner ok={msg.ok} text={msg.text} />}

      {/* Two-column layout */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Poster */}
        <div className="space-y-3">
          <div onClick={() => !uploading && fileRef.current?.click()}
            className="relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-black/15 bg-white hover:border-black/30">
            <div className="flex aspect-[3/4] items-center justify-center bg-black/3">
              {poster
                ? <img src={poster} alt="Poster" className="h-full w-full object-cover" />
                : <div className="flex flex-col items-center gap-2 text-black/30"><Upload className="h-8 w-8" /><p className="text-xs">Upload poster</p></div>}
            </div>
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                <Loader2 className="h-6 w-6 animate-spin text-black/50" />
              </div>
            )}
            <p className="p-3 text-center text-xs font-semibold text-black/40">{poster ? "Click to replace" : "Click to upload"}</p>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => void doUpload(e.target.files?.[0])} />
          </div>
          <p className="px-1 text-xs text-black/35">PNG, JPEG or WebP, up to 5 MB.</p>
        </div>

        <div className="space-y-6">
          {/* Details */}
          <div className="rounded-3xl border border-black/10 bg-white p-6">
            <F label="Event name *" value={draft.name} onChange={v => set("name", v)} />
            <div className="mb-5 grid gap-4 sm:grid-cols-3">
              <F label="Date" value={draft.event_date} onChange={v => set("event_date", v)} type="date" />
              <F label="Start time" value={draft.start_time} onChange={v => set("start_time", v)} type="time" />
              <F label="End time" value={draft.end_time} onChange={v => set("end_time", v)} type="time" />
            </div>
            <F label="Venue" value={draft.venue} onChange={v => set("venue", v)} />
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <F label="Address" value={draft.address} onChange={v => set("address", v)} />
              <F label="City" value={draft.city} onChange={v => set("city", v)} />
            </div>
            <F label="Google Maps link" value={draft.venue_map_url} onChange={v => set("venue_map_url", v)} />
            <label className="mb-5 block text-sm font-semibold">
              Short description
              <Input className="mt-2" value={draft.short_description} onChange={e => set("short_description", e.target.value)} placeholder="One-line summary" />
            </label>
            <label className="block text-sm font-semibold">
              Full description
              <Textarea className="mt-2 min-h-[100px]" value={draft.description} onChange={e => set("description", e.target.value)} placeholder="Event details, lineup, what to expect…" />
            </label>
          </div>

          {/* Ticketing */}
          <div className="rounded-3xl border border-black/10 bg-white p-6">
            <h3 className="font-display text-xl font-bold">Ticketing</h3>
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">Event type</p>
              <Segmented<EventType>
                value={draft.event_type}
                onChange={v => set("event_type", v)}
                options={[{ value: "general", label: "General (open entry)" }, { value: "cinema", label: "Cinema (seat map)" }]}
              />
              <p className="mt-2 text-xs text-black/40">Cannot be changed once the event has orders.</p>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <F label="Ticket prefix" value={draft.ticket_prefix} onChange={v => set("ticket_prefix", v.toUpperCase())}
                placeholder="Auto from the name" hint="2–8 letters or digits, e.g. SBTB gives SBTB001, SBTB002…" />
              {draft.event_type === "cinema" && (
                <F label="Max seats per order" value={draft.max_seats_per_order} onChange={v => set("max_seats_per_order", v)} type="number" />
              )}
            </div>
            {draft.event_type === "cinema" && (
              <div className="mt-2">
                <p className="mb-2 text-sm font-semibold">Pricing</p>
                <Segmented<PricingMode>
                  value={draft.pricing_mode}
                  onChange={v => set("pricing_mode", v)}
                  options={[{ value: "tiers", label: "By ticket tier" }, { value: "seats_taken", label: "By seats taken" }]}
                />
                <p className="mt-2 text-xs text-black/40">
                  {draft.pricing_mode === "seats_taken"
                    ? "The price rises as seats are taken. No tiers; set the price brackets below."
                    : "Buyers pick seats, then a tier (early bird, advance, special offer…)."}
                </p>
              </div>
            )}
          </div>

          {/* Sales window */}
          <div className="rounded-3xl border border-black/10 bg-white p-6">
            <h3 className="font-display text-xl font-bold">Sales</h3>
            <div className="mt-5">
              <label className="block text-sm font-semibold">
                Sales close <span className="font-normal text-black/40">(Nairobi time)</span>
                <Input className="mt-2 max-w-xs" type="datetime-local" value={draft.sales_close_at} onChange={e => set("sales_close_at", e.target.value)} />
              </label>
              <p className="mt-2 text-xs text-black/40">
                Leave empty for no closing time. After it, buyers see “Sales closed”. Tiers can also have their own dates.
              </p>
            </div>
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">Sales control</p>
              <Segmented<SalesOverride>
                value={draft.sales_override}
                onChange={v => set("sales_override", v)}
                options={[{ value: "auto", label: "Automatic" }, { value: "open", label: "Force open" }, { value: "closed", label: "Force closed" }]}
              />
              <p className="mt-2 text-xs text-black/40">
                {draft.sales_override === "auto" && "Sales stop at the closing time, or when tickets or seats run out."}
                {draft.sales_override === "open" && "Keeps selling after the closing time. Tier dates and quantities still apply."}
                {draft.sales_override === "closed" && "Stops all sales now, whatever the dates say."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tiers or brackets */}
      {draft.event_type === "cinema" && draft.pricing_mode === "seats_taken"
        ? <BracketEditor eventId={row?.id ?? null} />
        : <TierEditor eventId={row?.id ?? null} tiers={tiers} setTiers={setTiers} />}
    </div>
  );
}

// ── Price brackets (cinema, priced by seats taken) ────────────────────────────
function BracketEditor({ eventId }: { eventId: string | null }) {
  const [rows, setRows] = useState<{ from_seat: string; price_kes: string }[]>([{ from_seat: "1", price_kes: "" }]);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    getAdminBrackets(eventId)
      .then(b => { if (active && b.length) setRows(b.map(r => ({ from_seat: String(r.from_seat), price_kes: String(r.price_kes) }))); })
      .catch(err => { if (active) setMsg({ text: err instanceof Error ? err.message : "Could not load prices", ok: false }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId]);

  const update = (i: number, key: "from_seat" | "price_kes", v: string) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [key]: v } : r));

  const save = async () => {
    if (!eventId) return;
    setSaving(true);
    try {
      const saved = await saveAdminBrackets(eventId, rows.map(r => ({ from_seat: Number(r.from_seat), price_kes: Number(r.price_kes) })));
      setRows(saved.map(r => ({ from_seat: String(r.from_seat), price_kes: String(r.price_kes) })));
      setMsg({ text: "Prices saved.", ok: true });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Could not save prices", ok: false });
    } finally {
      setSaving(false);
    }
  };

  // "Seats 1–50: KES 800 · 51+: KES 1,000"
  const preview = rows
    .map(r => ({ from: Number(r.from_seat), price: Number(r.price_kes) }))
    .filter(r => Number.isFinite(r.from) && r.from >= 1 && Number.isFinite(r.price) && r.price >= 0)
    .sort((a, b) => a.from - b.from)
    .map((r, i, all) => `${i + 1 < all.length ? `${r.from}–${all[i + 1].from - 1}` : `${r.from}+`}: KES ${r.price.toLocaleString("en-KE")}`)
    .join("  ·  ");

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-black/50">Cinema pricing</p>
          <h3 className="mt-1 font-display text-2xl font-bold">Price by seats taken</h3>
        </div>
        <Button variant="outline" onClick={() => setRows(rs => [...rs, { from_seat: "", price_kes: "" }])} disabled={!eventId || rows.length >= 20}>
          <Plus className="mr-2 h-4 w-4" /> Add bracket
        </Button>
      </div>

      {!eventId && <p className="mt-5 rounded-2xl border border-dashed border-black/15 bg-white p-5 text-center text-sm text-black/40">Save the event details above first, then set the prices here.</p>}

      {eventId && (
        <div className="mt-4 rounded-2xl border border-black/10 bg-white p-5">
          <p className="text-sm text-black/55">
            Each bracket starts at a seat number. The price is set by how many seats are already taken, and every seat in an order
            costs the same. Held seats count as taken. Example: from seat 1 at KES 800, from seat 51 at KES 1,000.
          </p>
          {loading ? <Spinner /> : (
            <div className="mt-4 space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-end gap-3">
                  <label className="text-xs font-semibold text-black/50">From seat #
                    <Input className="mt-1 w-28" type="number" min={1} value={r.from_seat} onChange={e => update(i, "from_seat", e.target.value)} />
                  </label>
                  <label className="text-xs font-semibold text-black/50">Price per seat (KES)
                    <Input className="mt-1 w-40" type="number" min={0} value={r.price_kes} onChange={e => update(i, "price_kes", e.target.value)} />
                  </label>
                  <Button variant="ghost" size="sm" disabled={rows.length === 1} onClick={() => setRows(rs => rs.filter((_, idx) => idx !== i))} className="text-red-500 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {preview && <p className="mt-4 rounded-xl bg-black/[0.03] px-3 py-2 text-xs text-black/55">{preview}</p>}
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={() => void save()} disabled={saving} className="bg-[#c1e51a] text-black hover:bg-[#b1d410]">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save prices
            </Button>
            {msg && <span className={`text-sm font-semibold ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Tier Editor ───────────────────────────────────────────────────────────────
// Any event can have any number of tiers: early bird, advance, special offers…
// Each tier has its own price, quantity (0 = no limit) and sales window.
type Tone = "green" | "amber" | "grey" | "red";
const TONE: Record<Tone, string> = {
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  grey: "bg-black/5 text-black/50",
  red: "bg-red-100 text-red-700",
};

// Mirrors public.tier_state() in the database.
function tierStatus(t: AdminTicketType): { label: string; tone: Tone } {
  const now = Date.now();
  if (!t.is_active) return { label: "Sales off", tone: "grey" };
  if (t.sales_start && now < new Date(t.sales_start).getTime()) return { label: `Starts ${formatNairobi(t.sales_start)}`, tone: "amber" };
  if (t.sales_end && now >= new Date(t.sales_end).getTime()) return { label: "Ended", tone: "grey" };
  if (t.quantity_total > 0 && (t.quantity_sold ?? 0) >= t.quantity_total) return { label: "Sold out", tone: "red" };
  return { label: t.sales_end ? `On sale · ends ${formatNairobi(t.sales_end)}` : "On sale", tone: "green" };
}

const TIER_PRESETS = ["Early bird", "Advance", "Special offer", "Other"] as const;

function TierEditor({
  eventId,
  tiers,
  setTiers,
}: {
  eventId: string | null;
  tiers: AdminTicketType[];
  setTiers: React.Dispatch<React.SetStateAction<AdminTicketType[]>>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, { text: string; ok: boolean }>>({});

  const showMsg = (id: string, text: string, ok: boolean) => {
    setMsgs(m => ({ ...m, [id]: { text, ok } }));
    if (ok) setTimeout(() => setMsgs(m => { const n = { ...m }; delete n[id]; return n; }), 3000);
  };

  const upd = <K extends keyof AdminTicketType>(id: string, k: K, v: AdminTicketType[K]) =>
    setTiers(ts => ts.map(t => t.id === id ? { ...t, [k]: v } : t));

  const addTier = (preset: (typeof TIER_PRESETS)[number]) => {
    if (!eventId) return;
    const id = `new-${Date.now()}`;
    setTiers(ts => [...ts, {
      id, event_id: eventId, name: preset === "Other" ? "New tier" : preset, description: "",
      price_kes: 0, quantity_total: 100, quantity_sold: 0,
      min_per_order: 1, max_per_order: 6,
      sales_start: null, sales_end: null,
      is_visible: true, is_active: true, sort_order: ts.length,
    }]);
    setOpen(id);
  };

  const saveTier = async (tier: AdminTicketType) => {
    if (!eventId) return;
    setSaving(tier.id);
    try {
      const saved = await saveAdminTicketType({ ...tier, event_id: eventId });
      // keep the live sold count we already have; the saved row's own counter is unused
      setTiers(ts => ts.map(t => t.id === tier.id ? { ...saved, quantity_sold: tier.quantity_sold ?? 0 } : t));
      if (open === tier.id) setOpen(saved.id);
      showMsg(saved.id, "Saved.", true);
    } catch (err) {
      showMsg(tier.id, err instanceof Error ? err.message : "Save failed", false);
    } finally {
      setSaving(null);
    }
  };

  const delTier = async (tier: AdminTicketType) => {
    if (!confirm(`Delete "${tier.name}"?`)) return;
    try {
      if (!tier.id.startsWith("new-")) await deleteAdminTicketType(tier.id);
      setTiers(ts => ts.filter(t => t.id !== tier.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-black/50">Ticket configuration</p>
          <h3 className="mt-1 font-display text-2xl font-bold">Ticket tiers</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {TIER_PRESETS.map(p => (
            <Button key={p} variant="outline" size="sm" onClick={() => addTier(p)} disabled={!eventId}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> {p}
            </Button>
          ))}
        </div>
      </div>

      {!eventId && (
        <p className="mt-5 rounded-2xl border border-dashed border-black/15 bg-white p-5 text-center text-sm text-black/40">
          Save the event details above first, then add ticket tiers here.
        </p>
      )}

      {eventId && tiers.length === 0 && (
        <p className="mt-5 rounded-2xl border border-dashed border-black/15 p-5 text-center text-sm text-black/40">
          No tiers yet. Add an early bird, advance or special offer above. An event with no tiers shows as not on sale.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {tiers.map(tier => {
          const isOpen = open === tier.id;
          const sold = tier.quantity_sold ?? 0;
          const unlimited = tier.quantity_total <= 0;
          const avail = unlimited ? null : Math.max(0, tier.quantity_total - sold);
          const pct = unlimited ? 0 : Math.round((sold / tier.quantity_total) * 100);
          const m = msgs[tier.id];
          const status = tierStatus(tier);

          return (
            <div key={tier.id} className={`overflow-hidden rounded-2xl border bg-white transition-all ${isOpen ? "border-black/20 shadow-sm" : "border-black/10"}`}>
              {/* Row */}
              <div className="flex items-center gap-4 p-4">
                <div className={`h-2 w-2 shrink-0 rounded-full ${status.tone === "green" ? "bg-green-500" : "bg-gray-300"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{tier.name || "Untitled"}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[status.tone]}`}>{status.label}</span>
                    {tier.id.startsWith("new-") && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Not saved yet</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-black/50">
                    <span>KES {tier.price_kes.toLocaleString()}</span>
                    <span>·</span>
                    <span>{unlimited ? "No limit" : `${avail} / ${tier.quantity_total} available`}</span>
                    {sold > 0 && <><span>·</span><span className="text-primary">{sold} sold{unlimited ? "" : ` (${pct}%)`}</span></>}
                  </div>
                  {!unlimited && (
                    <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-black/10">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m && <span className={`text-xs font-semibold ${m.ok ? "text-green-700" : "text-red-600"}`}>{m.text}</span>}
                  <Button size="sm" onClick={() => void saveTier(tier)} disabled={saving === tier.id} className="bg-[#c1e51a] text-black hover:bg-[#b1d410]">
                    {saving === tier.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setOpen(isOpen ? null : tier.id)} className="text-black/40 hover:text-black">
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Expanded form */}
              {isOpen && (
                <div className="border-t border-black/8 p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <F label="Tier name *" value={tier.name} onChange={v => upd(tier.id, "name", v)} />
                    <F label="Price (KES)" value={String(tier.price_kes)} onChange={v => upd(tier.id, "price_kes", Number(v) || 0)} type="number" />
                    <F label="Total quantity (0 = no limit)" value={String(tier.quantity_total)} onChange={v => upd(tier.id, "quantity_total", Number(v) || 0)} type="number" />
                    <div>
                      <p className="mb-2 text-sm font-semibold">Sold (auto)</p>
                      <div className="flex h-10 items-center rounded-xl border border-black/10 bg-black/3 px-3 text-sm text-black/45">{sold} sold, including orders waiting for payment check</div>
                    </div>
                    <F label="Min per order" value={String(tier.min_per_order ?? 1)} onChange={v => upd(tier.id, "min_per_order", Number(v) || 1)} type="number" />
                    <F label="Max per order" value={String(tier.max_per_order)} onChange={v => upd(tier.id, "max_per_order", Number(v) || 1)} type="number" />
                    <div>
                      <label className="text-xs text-black/50">Sales start <span className="text-black/35">(Nairobi time)</span></label>
                      <Input type="datetime-local" className="mt-1" value={isoToNairobiInput(tier.sales_start)} onChange={e => upd(tier.id, "sales_start", nairobiInputToIso(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-xs text-black/50">Sales end <span className="text-black/35">(Nairobi time)</span></label>
                      <Input type="datetime-local" className="mt-1" value={isoToNairobiInput(tier.sales_end)} onChange={e => upd(tier.id, "sales_end", nairobiInputToIso(e.target.value))} />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-black/40">Leave both dates empty for a tier that is on sale until the event closes.</p>
                  <label className="mt-4 block text-sm font-semibold">
                    Description / perks
                    <Textarea className="mt-2" rows={3} value={tier.description ?? ""} onChange={e => upd(tier.id, "description", e.target.value || null)} placeholder="What's included, access level, perks…" />
                  </label>

                  {/* Toggles */}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <ToggleBtn label="Visible to buyers" on={tier.is_visible} icon={tier.is_visible ? Eye : EyeOff} toggle={() => upd(tier.id, "is_visible", !tier.is_visible)} />
                    <ToggleBtn label="Sales active" on={tier.is_active} icon={CheckCircle2} toggle={() => upd(tier.id, "is_active", !tier.is_active)} />
                  </div>

                  {/* Ticket card preview */}
                  <div className="mt-6">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-black/35">Ticket card preview</p>
                    <div className="max-w-xs rounded-2xl border border-black/10 bg-[#0b0b0b] p-4 text-white shadow-lg">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Hili Ticketing</p>
                      <p className="mt-1 font-display text-lg font-bold">{tier.name || "Tier name"}</p>
                      {tier.description && <p className="mt-1.5 text-xs leading-relaxed text-white/55">{tier.description}</p>}
                      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                        <div><p className="text-[10px] text-white/35">Price</p><p className="text-sm font-bold text-[#c1ff1a]">KES {tier.price_kes.toLocaleString()}</p></div>
                        <div className="text-right"><p className="text-[10px] text-white/35">Available</p><p className="text-sm font-semibold">{avail === null ? "∞" : avail.toLocaleString()}</p></div>
                        <div className="text-right"><p className="text-[10px] text-white/35">Status</p><p className={`text-xs font-bold ${status.tone === "green" ? "text-green-400" : "text-white/40"}`}>{status.label}</p></div>
                      </div>
                    </div>
                  </div>

                  {/* Delete */}
                  <div className="mt-5 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => void delTier(tier)} className="text-red-500 hover:bg-red-50 hover:text-red-700">
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete tier
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Attendees ─────────────────────────────────────────────────────────────────
function Attendees() {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => { getAdminEvents().then(setEvents).catch(() => undefined); }, []);

  const load = useCallback(async () => {
    try {
      setTickets(await getAdminTickets(eventId || undefined));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load attendees");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  const filtered = tickets.filter(t => {
    if (!q) return true;
    const s = q.toLowerCase();
    return t.attendee_name.toLowerCase().includes(s)
      || t.ticket_number.toLowerCase().includes(s)
      || (t.seat_label ?? "").toLowerCase().includes(s)
      || (t.event?.name ?? "").toLowerCase().includes(s);
  });

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl font-bold">Attendees</h2>
        <div className="flex items-center gap-2">
          <select value={eventId} onChange={e => setEventId(e.target.value)} className="h-10 rounded-xl border border-black/15 bg-white px-3 text-sm">
            <option value="">All events</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); void load(); }}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>
      <Input className="mt-5" placeholder="Search by name, ticket #, seat, or event…" value={q} onChange={e => setQ(e.target.value)} />
      {error && <Banner ok={false} text={error} />}
      {loading
        ? <div className="mt-8 flex items-center gap-2 text-sm text-black/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        : !filtered.length
          ? <EmptyState title={q ? "No results" : "No attendees yet"} />
          : (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-black/10 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-black/10 text-xs uppercase tracking-wider text-black/40">
                  <tr><th className="p-4">Attendee</th><th className="p-4">Ticket #</th><th className="p-4">Seat</th><th className="p-4">Event</th><th className="p-4">Tier</th><th className="p-4">Status</th></tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id} className="border-b border-black/5 last:border-0 hover:bg-black/[0.02]">
                      <td className="p-4 font-semibold">{t.attendee_name}</td>
                      <td className="p-4 font-mono text-xs">{t.ticket_number}</td>
                      <td className="p-4 font-mono text-xs">{t.seat_label ?? "—"}</td>
                      <td className="p-4 text-black/60">{t.event?.name ?? "—"}</td>
                      <td className="p-4 text-black/60">{t.ticket_type?.name ?? "—"}</td>
                      <td className="p-4">
                        {t.checked_in_at
                          ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Checked in</span>
                          : <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">Valid</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </div>
  );
}

// ── Payment config (one per event) ────────────────────────────────────────────
function PaymentConfigEditor({ preselectId }: { preselectId: string | null }) {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [type, setType] = useState<"till" | "paybill">("till");
  const [number, setNumber] = useState("");
  const [tillName, setTillName] = useState("");
  const [account, setAccount] = useState("");
  const [instructions, setInstructions] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await getAdminEvents();
        setEvents(rows);
        setEventId((rows.find(e => e.id === preselectId) ?? rows[0])?.id ?? null);
      } catch (err) {
        setMsg({ text: err instanceof Error ? err.message : "Could not load events", ok: false });
      } finally {
        setLoading(false);
      }
    })();
  }, [preselectId]);

  useEffect(() => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    let active = true;
    setType("till"); setNumber(""); setTillName(""); setAccount(""); setInstructions(""); setMsg(null);
    void fetchPaymentConfig(ev.slug, true).then(config => {
      if (!active || !config) return;
      setType(config.payment_type as "till" | "paybill");
      setNumber(config.number ?? "");
      setTillName(config.till_name ?? "");
      setAccount(config.account_number ?? "");
      setInstructions(config.instructions ?? "");
    });
    return () => { active = false; };
  }, [eventId, events]);

  const save = async () => {
    if (!eventId || !number.trim()) { setMsg({ text: "Payment number is required.", ok: false }); return; }
    try {
      await savePrestigePaymentConfig({
        eventId,
        paymentType: type,
        number: number.trim(),
        accountNumber: account.trim() || undefined,
        instructions: instructions.trim() || undefined,
        tillName: tillName.trim() || undefined,
      });
      setMsg({ text: "Saved.", ok: true });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Could not save", ok: false });
    }
  };

  if (loading) return <Spinner />;
  if (!eventId) return <EmptyState title="No events yet. Create an event first." />;

  const current = events.find(e => e.id === eventId);

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-black/50">M-Pesa payment settings, set separately for each event</p>
          <h2 className="mt-1 font-display text-3xl font-bold">Payment config</h2>
        </div>
        <Button onClick={() => void save()} className="bg-[#c1e51a] text-black hover:bg-[#b1d410]">
          <Save className="mr-2 h-4 w-4" /> Save
        </Button>
      </div>

      <label className="mt-6 block text-sm font-semibold">
        Event
        <select value={eventId} onChange={e => setEventId(e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-black/15 bg-white px-3 text-sm font-normal">
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}{ev.event_date ? ` · ${ev.event_date}` : ""}</option>)}
        </select>
        {current && <span className="mt-1 block text-xs font-normal text-black/35">{current.slug}</span>}
      </label>

      {msg && <Banner ok={msg.ok} text={msg.text} />}

      <div className="mt-6 space-y-5 rounded-3xl border border-black/10 bg-white p-6">
        <div>
          <p className="text-sm font-semibold">Payment type</p>
          <div className="mt-2 flex gap-2">
            {(["till", "paybill"] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${type === t ? "border-black bg-black text-white" : "border-black/15 text-black/50 hover:border-black/30"}`}>
                {t === "till" ? "Buy Goods (Till)" : "Paybill"}
              </button>
            ))}
          </div>
        </div>
        <F label={type === "till" ? "Till Number *" : "Paybill Number *"} value={number} onChange={setNumber} />
        <F label="Name shown on the M-Pesa confirmation" value={tillName} onChange={setTillName} placeholder="e.g. PRESTIGE CINEMA 6" />
        {type === "paybill" && <F label="Account Number / Reference" value={account} onChange={setAccount} />}
        <div>
          <label className="block text-sm font-semibold">Custom instructions <span className="font-normal text-black/40">(optional)</span></label>
          <p className="mt-0.5 text-xs text-black/40">Leave blank for the default step-by-step guide. Basic HTML supported.</p>
          <Textarea className="mt-2 min-h-[100px]" value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="<p>Step 1: Open M-Pesa…</p>" />
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-black/10 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-black/40">Prestige Operations</p>
        <p className="mt-2 text-sm text-black/60">Payment verification and ticket delivery is handled by the Prestige team.</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link to="/admin/prestige">Open Prestige Dashboard <ExternalLink className="ml-2 h-3.5 w-3.5" /></Link>
        </Button>
      </div>
    </div>
  );
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function F({ label, value, onChange, type = "text", placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; hint?: string;
}) {
  return (
    <label className="mb-5 block text-sm font-semibold">
      {label}
      <Input className="mt-2" type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      {hint && <span className="mt-1 block text-xs font-normal text-black/40">{hint}</span>}
    </label>
  );
}

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-black/10 bg-white p-1">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${value === o.value ? "bg-black text-white" : "text-black/45 hover:text-black"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Banner({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-sm ${ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
      {text}
    </div>
  );
}

function ToggleBtn({ label, on, icon: Icon, toggle }: { label: string; on: boolean; icon: React.ElementType; toggle: () => void }) {
  return (
    <button type="button" onClick={toggle}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${on ? "border-green-300 bg-green-50 text-green-800" : "border-black/10 bg-white text-black/40"}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="mt-8 rounded-3xl border border-black/10 bg-white p-8">
      <FileText className="h-7 w-7 text-black/25" />
      <h2 className="mt-4 font-display text-xl font-bold">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-black/45">Records will appear here once events and orders are active.</p>
    </div>
  );
}

function Spinner({ full }: { full?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${full ? "min-h-screen bg-[#0b0b0b]" : "p-12"}`}>
      <Loader2 className={`animate-spin ${full ? "h-8 w-8 text-white/30" : "h-6 w-6 text-black/30"}`} />
    </div>
  );
}

// Suppress unused import warning — BarChart3 kept for potential future Analytics tab
void BarChart3;
