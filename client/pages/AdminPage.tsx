import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  Save,
  Settings2,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminEvent,
  deleteAdminTicketType,
  getAdminEvents,
  getAdminTicketTypes,
  getAdminTickets,
  saveAdminEvent,
  saveAdminTicketType,
  savePrestigePaymentConfig,
  subscribeToAdminData,
  supabase,
  uploadEventPoster,
  type AdminEvent,
  type AdminTicket,
  type AdminTicketType,
} from "@/lib/supabase";
import type { PaymentConfig } from "@shared/api";

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "Overview" | "Current event" | "Future event" | "Attendees" | "Analytics" | "Payment config";

// ── Root page ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [session, setSession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(Boolean(data.session));
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] text-white">
        <Loader2 className="h-7 w-7 animate-spin text-white/30" />
      </div>
    );
  }
  if (!session) return <Login onLogin={() => setSession(true)} />;
  return (
    <Dashboard
      onLogout={async () => {
        await supabase?.auth.signOut();
        setSession(false);
      }}
    />
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return setError("Supabase is not configured.");
    setLoading(true);
    setError("");
    const result = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (result.error) setError(result.error.message);
    else onLogin();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] px-5 text-white">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-md rounded-3xl bg-white p-8 text-[#0b0b0b] shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#0b0b0b]">
            <img src="/favicon.svg" alt="Hili" className="h-8 w-8 object-contain" />
          </div>
          <strong className="font-display text-xl">Hili Admin</strong>
        </div>
        <h1 className="mt-10 font-display text-3xl font-bold">Welcome back.</h1>
        {error && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
        <label className="mt-7 block text-sm font-semibold">
          Email
          <Input
            className="mt-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="mt-4 block text-sm font-semibold">
          Password
          <Input
            className="mt-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <Button
          className="mt-6 h-12 w-full bg-[#c1e51a] text-black hover:bg-[#b1d410]"
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

// ── Dashboard shell ───────────────────────────────────────────────────────────
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("Overview");

  const tabs: { label: Tab; icon: typeof LayoutDashboard }[] = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Current event", icon: CalendarDays },
    { label: "Future event", icon: ImagePlus },
    { label: "Attendees", icon: Users },
    { label: "Analytics", icon: BarChart3 },
    { label: "Payment config", icon: Settings2 },
  ];

  return (
    <div className="min-h-screen bg-[#f4f4ef] text-[#0b0b0b]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[#0b0b0b] p-6 text-white lg:flex">
        <Brand />
        <nav className="mt-14 space-y-1">
          {tabs.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => setTab(label)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                tab === label
                  ? "bg-[#c1ff1a] font-semibold text-black"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
        {/* Prestige dashboard link */}
        <Link
          to="/admin/prestige"
          className="mt-6 flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-xs text-white/50 hover:border-white/30 hover:text-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open Prestige Dashboard
        </Link>
        <button
          onClick={onLogout}
          className="mt-4 flex items-center gap-2 text-sm text-white/40 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      {/* Main */}
      <main className="lg:pl-64">
        <header className="flex items-center justify-between border-b border-black/10 px-5 py-5 sm:px-10">
          <div>
            <p className="text-[10px] uppercase tracking-[.25em] text-black/45">Hili workspace</p>
            <h1 className="mt-1 font-display text-xl font-bold">{tab}</h1>
          </div>
          {/* Mobile tabs */}
          <div className="flex gap-1 overflow-x-auto lg:hidden">
            {tabs.map(({ label }) => (
              <button
                key={label}
                onClick={() => setTab(label)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  tab === label ? "bg-black text-white" : "bg-black/5"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="p-5 sm:p-10">
          {tab === "Overview" && <Overview />}
          {tab === "Current event" && <EventEditor isCurrent />}
          {tab === "Future event" && <EventEditor isCurrent={false} />}
          {tab === "Attendees" && <AttendeeSummary />}
          {tab === "Analytics" && <EmptyState title="Analytics coming soon" />}
          {tab === "Payment config" && <PaymentConfigEditor />}
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#c1ff1a]">
        <img src="/favicon.svg" alt="Hili" className="h-7 w-7 object-contain" />
      </div>
      <span className="font-display text-lg font-bold">Hili Admin</span>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function Overview() {
  const [stats, setStats] = useState({
    publishedEvents: 0,
    totalOrders: 0,
    confirmedOrders: 0,
    totalRevenue: 0,
    ticketsSold: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!supabase) { setLoading(false); return; }
      const [eventsRes, ordersRes] = await Promise.all([
        supabase.from("events").select("id, status").eq("status", "published"),
        supabase
          .from("orders")
          .select("id, status, amount_kes, order_items(quantity)")
      ]);
      if (!active) return;

      const orders = ordersRes.data || [];
      const confirmed = orders.filter(
        (o) => o.status === "confirmed" || o.status === "paid"
      );
      const revenue = confirmed.reduce(
        (s: number, o: { amount_kes: number }) => s + o.amount_kes, 0
      );
      const sold = confirmed.reduce((s: number, o: { order_items: Array<{ quantity: number }> }) =>
        s + (o.order_items || []).reduce((ss, i) => ss + i.quantity, 0), 0
      );

      setStats({
        publishedEvents: eventsRes.data?.length ?? 0,
        totalOrders: orders.length,
        confirmedOrders: confirmed.length,
        totalRevenue: revenue,
        ticketsSold: sold,
      });
      setLoading(false);
    };
    void load();
    const unsub = subscribeToAdminData(() => void load());
    return () => { active = false; unsub(); };
  }, []);

  const fmt = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

  return (
    <div>
      <p className="text-sm font-semibold text-black/50">Good morning, Hili</p>
      <h2 className="mt-2 font-display text-4xl font-bold">Your events at a glance.</h2>

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-black/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading stats…
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Published events" value={String(stats.publishedEvents)} />
          <Metric label="Total orders" value={String(stats.totalOrders)} />
          <Metric label="Confirmed orders" value={String(stats.confirmedOrders)} />
          <Metric label="Tickets sold" value={String(stats.ticketsSold)} />
          <Metric label="Confirmed revenue" value={fmt(stats.totalRevenue)} accent />
          <Metric label="Ticket delivery" value="Manual → Prestige" />
        </div>
      )}

      <div className="mt-8 rounded-3xl border border-black/10 bg-white p-6">
        <p className="text-xs uppercase tracking-widest text-black/45">Admin workflow</p>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-black/60">
          Manage events and tickets in the <strong>Current event</strong> and{" "}
          <strong>Future event</strong> tabs. Configure payment instructions in{" "}
          <strong>Payment config</strong>. The Prestige team handles order verification and ticket
          delivery from their own dashboard.
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <p className="text-sm text-black/50">{label}</p>
      <p className={`mt-3 font-display text-2xl font-bold ${accent ? "text-primary" : ""}`}>
        {value}
      </p>
    </div>
  );
}

// ── Event Editor ──────────────────────────────────────────────────────────────
function EventEditor({ isCurrent }: { isCurrent: boolean }) {
  const [row, setRow] = useState<AdminEvent | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    short_description: "",
    description: "",
    venue: "",
    address: "",
    city: "",
    event_date: "",
    start_time: "",
    end_time: "",
    venue_map_url: "",
    status: "draft" as AdminEvent["status"],
    is_current: isCurrent,
  });
  const [poster, setPoster] = useState("");
  const [tiers, setTiers] = useState<AdminTicketType[]>([]);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── ensure org exists (auto-bootstrap) ───────────────────────────────────
  const ensureOrg = async (): Promise<string> => {
    if (!supabase) throw new Error("Supabase is not configured");
    // Look for any existing org
    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .single();
    if (existing) return existing.id as string;
    // Create one automatically — no manual step needed
    const { data: created, error } = await supabase
      .from("organizations")
      .insert({ name: "Hili" })
      .select("id")
      .single();
    if (error || !created) throw new Error("Could not create organization");
    return created.id as string;
  };

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const rows = await getAdminEvents();
    const found = isCurrent
      ? rows.find((e) => e.is_current)
      : rows.find((e) => !e.is_current && e.status !== "archived");
    if (found) {
      setRow(found);
      setDraft({
        name: found.name,
        short_description: found.short_description ?? "",
        description: found.description ?? "",
        venue: found.venue ?? "",
        address: found.address ?? "",
        city: found.city ?? "",
        event_date: found.event_date ?? "",
        start_time: found.start_time ?? "",
        end_time: found.end_time ?? "",
        venue_map_url: found.venue_map_url ?? "",
        status: found.status,
        is_current: found.is_current,
      });
      setPoster(found.poster_path ?? "");
      setTiers(await getAdminTicketTypes(found.id));
    }
  }, [isCurrent]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const unsub = subscribeToAdminData(() => void refresh());
    return unsub;
  }, [refresh]);

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((old) => ({ ...old, [key]: value }));

  const upload = async (file?: File) => {
    if (!file) return;
    // If no row yet, save first to get an ID for the storage path
    let targetId = row?.id;
    if (!targetId) {
      await save(true);
      // row state may not have updated yet — re-read
      const rows = await getAdminEvents();
      const found = isCurrent
        ? rows.find((e) => e.is_current)
        : rows.find((e) => !e.is_current && e.status !== "archived");
      targetId = found?.id;
    }
    if (!targetId) return;
    try {
      const uploaded = await uploadEventPoster(file, targetId);
      setPoster(uploaded.url);
      if (row) await saveAdminEvent({ id: targetId, poster_path: uploaded.url });
      setMessage({ text: "Poster uploaded.", ok: true });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Upload failed", ok: false });
    }
  };

  const save = async (silent = false) => {
    if (!draft.name.trim()) {
      setMessage({ text: "Event name is required.", ok: false });
      return;
    }
    setSaving(true);
    try {
      let saved: AdminEvent;
      if (row) {
        saved = await saveAdminEvent({
          id: row.id,
          name: draft.name,
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
          is_current: draft.is_current,
          poster_path: poster || null,
        });
      } else {
        // Auto-bootstrap org, then create event
        const orgId = await ensureOrg();
        const slug = draft.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          || `event-${Date.now()}`;

        saved = await createAdminEvent({
          organization_id: orgId,
          slug,
          name: draft.name,
          short_description: draft.short_description || null,
          description: draft.description || null,
          poster_path: poster || null,
          venue: draft.venue || null,
          address: draft.address || null,
          city: draft.city || null,
          event_date: draft.event_date || null,
          start_time: draft.start_time || null,
          end_time: draft.end_time || null,
          venue_map_url: draft.venue_map_url || null,
          status: draft.status,
          is_current: draft.is_current,
          theme: {},
          settings: {},
        });
      }
      setRow(saved);
      setTiers(await getAdminTicketTypes(saved.id));
      if (!silent) setMessage({ text: "Saved successfully.", ok: true });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Could not save", ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-black/50">{isCurrent ? "Live event" : "Draft / upcoming event"}</p>
          <h2 className="mt-2 font-display text-3xl font-bold">
            {isCurrent ? "Current event" : "Future event"}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Status toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-black/10 bg-white p-1">
            {(["draft", "published", "archived"] as const).map((s) => (
              <button
                key={s}
                onClick={() => set("status", s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  draft.status === s ? "bg-black text-white" : "text-black/50 hover:text-black"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="bg-[#c1e51a] text-black hover:bg-[#b1d410]"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-sm ${
            message.ok
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.ok && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {message.text}
        </div>
      )}

      {!row && (
        <p className="mt-4 rounded-xl border border-dashed border-black/15 bg-white p-4 text-sm text-black/50">
          No {isCurrent ? "current" : "upcoming"} event found. Fill in the details below and click
          Save to create one.
        </p>
      )}

      {/* Content grid */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Poster upload */}
        <div>
          <div
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-black/15 bg-white transition-colors hover:border-black/30"
          >
            <div className="flex aspect-[4/5] items-center justify-center bg-black/3">
              {poster ? (
                <img src={poster} alt="Event poster" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-black/30">
                  <Upload className="h-8 w-8" />
                  <p className="text-xs">Click to upload poster</p>
                </div>
              )}
            </div>
            <p className="p-3 text-center text-xs font-semibold text-black/50">
              {poster ? "Click to replace" : "Upload event poster"}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </div>

          {/* is_current toggle */}
          <button
            onClick={() => set("is_current", !draft.is_current)}
            className={`mt-3 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
              draft.is_current
                ? "border-green-300 bg-green-50 text-green-800"
                : "border-black/10 bg-white text-black/60"
            }`}
          >
            <span>Set as current event</span>
            {draft.is_current ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <div className="h-4 w-4 rounded-full border-2 border-black/20" />
            )}
          </button>
          <p className="mt-1 px-1 text-xs text-black/40">
            Only one event can be current. Setting this will unset any other.
          </p>
        </div>

        {/* Fields */}
        <div className="rounded-3xl border border-black/10 bg-white p-6">
          <Field
            label="Event name"
            value={draft.name}
            onChange={(v) => set("name", v)}
            required
          />
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Field
              label="Date"
              value={draft.event_date}
              onChange={(v) => set("event_date", v)}
              type="date"
            />
            <Field
              label="Start time"
              value={draft.start_time}
              onChange={(v) => set("start_time", v)}
              type="time"
            />
            <Field
              label="End time"
              value={draft.end_time}
              onChange={(v) => set("end_time", v)}
              type="time"
            />
          </div>
          <Field label="Venue" value={draft.venue} onChange={(v) => set("venue", v)} />
          <Field label="Address" value={draft.address} onChange={(v) => set("address", v)} />
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <Field label="City" value={draft.city} onChange={(v) => set("city", v)} />
            <Field
              label="Google Maps link"
              value={draft.venue_map_url}
              onChange={(v) => set("venue_map_url", v)}
            />
          </div>
          <label className="mb-5 block text-sm font-semibold">
            Short description
            <Input
              className="mt-2"
              value={draft.short_description}
              onChange={(e) => set("short_description", e.target.value)}
              placeholder="One-line summary shown on cards"
            />
          </label>
          <label className="block text-sm font-semibold">
            Full description
            <Textarea
              className="mt-2 min-h-[120px]"
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Event details, lineup, what to expect…"
            />
          </label>
        </div>
      </div>

      {/* Ticket tiers — only when we have a saved event */}
      {row && (
        <TicketEditor eventId={row.id} tiers={tiers} setTiers={setTiers} />
      )}
    </div>
  );
}

// ── Ticket Editor ─────────────────────────────────────────────────────────────
function TicketEditor({
  eventId,
  tiers,
  setTiers,
}: {
  eventId: string;
  tiers: AdminTicketType[];
  setTiers: React.Dispatch<React.SetStateAction<AdminTicketType[]>>;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const update = <K extends keyof AdminTicketType>(
    id: string,
    key: K,
    value: AdminTicketType[K],
  ) => {
    setTiers((old) =>
      old.map((t) => (t.id === id ? { ...t, [key]: value } : t)),
    );
  };

  const addTier = () => {
    const newId = `new-${Date.now()}`;
    const newTier: AdminTicketType = {
      id: newId,
      event_id: eventId,
      name: "New Tier",
      description: "",
      price_kes: 0,
      quantity_total: 100,
      quantity_sold: 0,
      max_per_order: 6,
      is_visible: true,
      is_active: true,
      sort_order: tiers.length,
    };
    setTiers((old) => [...old, newTier]);
    setExpanded(newId);
  };

  const saveTier = async (tier: AdminTicketType) => {
    setSaving(tier.id);
    try {
      const saved = await saveAdminTicketType({ ...tier, event_id: eventId });
      setTiers((old) => old.map((t) => (t.id === tier.id ? saved : t)));
      if (expanded === tier.id) setExpanded(saved.id);
      setMessage({ id: saved.id, text: "Saved.", ok: true });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({
        id: tier.id,
        text: err instanceof Error ? err.message : "Save failed",
        ok: false,
      });
    } finally {
      setSaving(null);
    }
  };

  const deleteTier = async (tier: AdminTicketType) => {
    if (!confirm(`Delete "${tier.name}"? This cannot be undone.`)) return;
    try {
      if (!tier.id.startsWith("new-")) await deleteAdminTicketType(tier.id);
      setTiers((old) => old.filter((t) => t.id !== tier.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete tier");
    }
  };

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-black/50">Ticket configuration</p>
          <h3 className="mt-1 font-display text-2xl font-bold">Ticket tiers</h3>
        </div>
        <Button variant="outline" onClick={addTier}>
          <Plus className="mr-2 h-4 w-4" /> Add tier
        </Button>
      </div>

      {tiers.length === 0 && (
        <p className="mt-5 rounded-2xl border border-dashed border-black/15 p-6 text-center text-sm text-black/40">
          No ticket tiers yet. Click "Add tier" to create the first one.
        </p>
      )}

      <div className="mt-5 space-y-3">
        {tiers.map((tier) => {
          const isOpen = expanded === tier.id;
          const sold = tier.quantity_sold ?? 0;
          const available = Math.max(0, tier.quantity_total - sold);
          const pct = tier.quantity_total > 0 ? Math.round((sold / tier.quantity_total) * 100) : 0;

          return (
            <div
              key={tier.id}
              className={`overflow-hidden rounded-2xl border bg-white transition-all ${
                isOpen ? "border-black/20 shadow-sm" : "border-black/10"
              }`}
            >
              {/* Collapsed row — summary / preview */}
              <div className="flex items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-4">
                  {/* Status dot */}
                  <div
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      tier.is_active && tier.is_visible
                        ? "bg-green-500"
                        : "bg-gray-300"
                    }`}
                    title={tier.is_active ? "Active" : "Inactive"}
                  />
                  <div>
                    <p className="font-semibold">{tier.name || "Untitled tier"}</p>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-black/50">
                      <span>KES {tier.price_kes.toLocaleString()}</span>
                      <span>·</span>
                      <span>{available} of {tier.quantity_total} available</span>
                      {sold > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-primary">{pct}% sold</span>
                        </>
                      )}
                    </div>
                    {/* Mini progress bar */}
                    {tier.quantity_total > 0 && (
                      <div className="mt-1.5 h-1 w-32 overflow-hidden rounded-full bg-black/10">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {message?.id === tier.id && (
                    <span
                      className={`text-xs font-semibold ${message.ok ? "text-green-700" : "text-red-600"}`}
                    >
                      {message.text}
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={() => void saveTier(tier)}
                    disabled={saving === tier.id}
                    className="bg-[#c1e51a] text-black hover:bg-[#b1d410]"
                  >
                    {saving === tier.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpanded(isOpen ? null : tier.id)}
                    className="text-black/40 hover:text-black"
                  >
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Expanded form */}
              {isOpen && (
                <div className="border-t border-black/8 p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Tier name"
                      value={tier.name}
                      onChange={(v) => update(tier.id, "name", v)}
                      required
                    />
                    <Field
                      label="Price (KES)"
                      value={String(tier.price_kes)}
                      onChange={(v) => update(tier.id, "price_kes", Number(v) || 0)}
                      type="number"
                    />
                    <Field
                      label="Total quantity"
                      value={String(tier.quantity_total)}
                      onChange={(v) => update(tier.id, "quantity_total", Number(v) || 0)}
                      type="number"
                    />
                    <div>
                      <p className="mb-2 text-sm font-semibold">Sold (read-only)</p>
                      <div className="flex h-10 items-center rounded-xl border border-black/10 bg-black/3 px-3 text-sm text-black/50">
                        {sold} sold
                      </div>
                    </div>
                    <Field
                      label="Min per order"
                      value={String(tier.min_per_order ?? 1)}
                      onChange={(v) => update(tier.id, "min_per_order", Number(v) || 1)}
                      type="number"
                    />
                    <Field
                      label="Max per order"
                      value={String(tier.max_per_order)}
                      onChange={(v) => update(tier.id, "max_per_order", Number(v) || 1)}
                      type="number"
                    />
                    <div className="sm:col-span-2">
                      <p className="mb-1 text-sm font-semibold">Sales window (optional)</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs text-black/50">Sales start</label>
                          <Input
                            type="datetime-local"
                            className="mt-1"
                            value={tier.sales_start ?? ""}
                            onChange={(e) => update(tier.id, "sales_start", e.target.value || null)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-black/50">Sales end</label>
                          <Input
                            type="datetime-local"
                            className="mt-1"
                            value={tier.sales_end ?? ""}
                            onChange={(e) => update(tier.id, "sales_end", e.target.value || null)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <label className="mb-4 mt-4 block text-sm font-semibold">
                    Description / perks
                    <Textarea
                      className="mt-2"
                      value={tier.description ?? ""}
                      onChange={(e) => update(tier.id, "description", e.target.value || null)}
                      placeholder="What's included, perks, access level…"
                      rows={3}
                    />
                  </label>

                  {/* Toggles */}
                  <div className="flex flex-wrap gap-3">
                    <Toggle
                      label="Visible to buyers"
                      value={tier.is_visible}
                      onChange={(v) => update(tier.id, "is_visible", v)}
                      icon={tier.is_visible ? Eye : EyeOff}
                    />
                    <Toggle
                      label="Sales active"
                      value={tier.is_active}
                      onChange={(v) => update(tier.id, "is_active", v)}
                      icon={tier.is_active ? CheckCircle2 : FileText}
                    />
                  </div>

                  {/* Ticket card preview */}
                  <div className="mt-6">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-black/40">
                      Ticket card preview
                    </p>
                    <TicketPreview tier={tier} />
                  </div>

                  {/* Delete */}
                  <div className="mt-5 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void deleteTier(tier)}
                      className="text-red-500 hover:bg-red-50 hover:text-red-700"
                    >
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

// ── Ticket card preview ───────────────────────────────────────────────────────
function TicketPreview({ tier }: { tier: AdminTicketType }) {
  return (
    <div className="max-w-sm rounded-2xl border border-black/10 bg-gradient-to-br from-[#0b0b0b] to-[#1a1a1a] p-5 text-white shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-white/40">
            Hili Ticketing
          </p>
          <p className="mt-1 font-display text-lg font-bold">
            {tier.name || "Ticket Name"}
          </p>
        </div>
        <span className="rounded-full bg-[#c1ff1a]/20 px-2 py-1 text-xs font-bold text-[#c1ff1a]">
          KES {(tier.price_kes || 0).toLocaleString()}
        </span>
      </div>
      {tier.description && (
        <p className="mt-3 text-sm leading-relaxed text-white/60">{tier.description}</p>
      )}
      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
        <div>
          <p className="text-[10px] text-white/35">Available</p>
          <p className="text-sm font-semibold">
            {Math.max(0, tier.quantity_total - (tier.quantity_sold ?? 0)).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-white/35">Max per order</p>
          <p className="text-sm font-semibold">{tier.max_per_order}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-white/35">Status</p>
          <p
            className={`text-xs font-bold ${
              tier.is_active && tier.is_visible ? "text-green-400" : "text-white/30"
            }`}
          >
            {tier.is_active && tier.is_visible ? "On Sale" : "Hidden"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Toggle button ─────────────────────────────────────────────────────────────
function Toggle({
  label,
  value,
  onChange,
  icon: Icon,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon: React.ElementType;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
        value
          ? "border-green-300 bg-green-50 text-green-800"
          : "border-black/10 bg-white text-black/40"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ── Reusable field ────────────────────────────────────────────────────────────
function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="mb-5 block text-sm font-semibold">
      {label}
      {required && <span className="ml-1 text-red-500">*</span>}
      <Input
        className="mt-2"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// ── Attendees ─────────────────────────────────────────────────────────────────
function AttendeeSummary() {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const rows = await getAdminTickets();
        if (active) setTickets(rows);
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const unsub = subscribeToAdminData(() => void refresh());
    return () => { active = false; unsub(); };
  }, []);

  const filtered = tickets.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.attendee_name.toLowerCase().includes(q) ||
      t.ticket_number.toLowerCase().includes(q) ||
      (t.event?.name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-5xl">
      <p className="text-sm text-black/50">Issued tickets from Supabase</p>
      <h2 className="mt-2 font-display text-3xl font-bold">Attendees</h2>
      <Input
        className="mt-5"
        placeholder="Search by name, ticket number or event…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-black/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !filtered.length ? (
        <EmptyState title={search ? "No results" : "No attendees yet"} />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-black/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/10 text-xs uppercase tracking-wider text-black/45">
              <tr>
                <th className="p-4">Attendee</th>
                <th className="p-4">Ticket #</th>
                <th className="p-4">Event</th>
                <th className="p-4">Type</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-black/5 last:border-0 hover:bg-black/2">
                  <td className="p-4 font-semibold">{t.attendee_name}</td>
                  <td className="p-4 font-mono text-xs">{t.ticket_number}</td>
                  <td className="p-4 text-black/60">{t.event?.name ?? "—"}</td>
                  <td className="p-4 text-black/60">{t.ticket_type?.name ?? "—"}</td>
                  <td className="p-4">
                    {t.checked_in_at ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                        Checked in
                      </span>
                    ) : (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        Valid
                      </span>
                    )}
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

// ── Payment Config Editor ─────────────────────────────────────────────────────
function PaymentConfigEditor() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventSlug, setEventSlug] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<"till" | "paybill">("till");
  const [number, setNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [instructions, setInstructions] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      if (!supabase) { setLoading(false); return; }
      const rows = await getAdminEvents();
      const current = rows.find((e) => e.is_current) ?? rows[0];
      if (!current) { setLoading(false); return; }
      setEventId(current.id);
      setEventSlug(current.slug);
      const res = await fetch(`/api/payment-config/${current.slug}`)
        .then((r) => r.json() as Promise<{ config: PaymentConfig | null }>)
        .catch(() => ({ config: null }));
      if (res.config) {
        setPaymentType(res.config.payment_type as "till" | "paybill");
        setNumber(res.config.number ?? "");
        setAccountNumber(res.config.account_number ?? "");
        setInstructions(res.config.instructions ?? "");
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!eventId || !number.trim()) {
      setMessage({ text: "Payment number is required.", ok: false });
      return;
    }
    try {
      await savePrestigePaymentConfig({
        eventId,
        paymentType,
        number: number.trim(),
        accountNumber: accountNumber.trim() || undefined,
        instructions: instructions.trim() || undefined,
      });
      setMessage({ text: "Payment configuration saved.", ok: true });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Could not save", ok: false });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-black/40">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!eventId) return <EmptyState title="No events found. Create an event first." />;

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-black/50">M-Pesa payment settings</p>
          <h2 className="mt-2 font-display text-3xl font-bold">Payment config</h2>
          {eventSlug && (
            <p className="mt-1 text-xs text-black/40">For event: <span className="font-mono">{eventSlug}</span></p>
          )}
        </div>
        <Button onClick={() => void save()} className="bg-[#c1e51a] text-black hover:bg-[#b1d410]">
          <Save className="mr-2 h-4 w-4" /> Save
        </Button>
      </div>

      {message && (
        <div
          className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-sm ${
            message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {message.ok && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {message.text}
        </div>
      )}

      <div className="mt-8 space-y-5 rounded-3xl border border-black/10 bg-white p-6">
        <div>
          <p className="text-sm font-semibold">Payment type</p>
          <div className="mt-2 flex gap-3">
            {(["till", "paybill"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPaymentType(t)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                  paymentType === t
                    ? "border-black bg-black text-white"
                    : "border-black/15 text-black/60 hover:border-black/30"
                }`}
              >
                {t === "till" ? "Buy Goods (Till)" : "Paybill"}
              </button>
            ))}
          </div>
        </div>

        <Field
          label={paymentType === "till" ? "Till Number" : "Paybill Number"}
          value={number}
          onChange={setNumber}
          required
        />

        {paymentType === "paybill" && (
          <Field
            label="Account Number / Reference"
            value={accountNumber}
            onChange={setAccountNumber}
          />
        )}

        <div>
          <label className="block text-sm font-semibold">
            Custom instructions
            <span className="ml-1 font-normal text-black/40">(optional)</span>
          </label>
          <p className="mt-1 text-xs text-black/45">
            Leave blank to show the default step-by-step guide. Basic HTML supported.
          </p>
          <Textarea
            className="mt-2 min-h-[120px]"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="<p>Step 1: Open M-Pesa…</p>"
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-5">
        <p className="text-xs uppercase tracking-widest text-black/40">Prestige dashboard</p>
        <p className="mt-2 text-sm text-black/60">
          The Prestige/BeerBirds operations dashboard handles orders, payment verification, and
          ticket delivery.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link to="/admin/prestige">
            Open Prestige Dashboard <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ title }: { title: string }) {
  return (
    <div className="mt-8 rounded-3xl border border-black/10 bg-white p-8">
      <FileText className="h-7 w-7 text-black/30" />
      <h2 className="mt-4 font-display text-xl font-bold">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-black/50">
        Records will appear here once events and orders are active.
      </p>
    </div>
  );
}
