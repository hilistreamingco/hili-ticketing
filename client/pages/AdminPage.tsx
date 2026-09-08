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
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getAdminEvents,
  createAdminEvent,
  saveAdminEvent,
  getAdminTicketTypes,
  saveAdminTicketType,
  deleteAdminTicketType,
  uploadEventPoster,
  getAdminTickets,
  subscribeToAdminData,
  supabase,
  type AdminEvent,
  type AdminTicketType,
  type AdminTicket,
} from "@/lib/supabase";
import type { PaymentConfig } from "@shared/api";

type Tab = "Overview" | "Current event" | "Future event" | "Attendees" | "Payment config";

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
  const [tab, setTab] = useState<Tab>("Overview");
  const tabs: { label: Tab; icon: typeof LayoutDashboard }[] = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Current event", icon: CalendarDays },
    { label: "Future event", icon: ImagePlus },
    { label: "Attendees", icon: Users },
    { label: "Payment config", icon: Settings2 },
  ];

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
          {tab === "Current event"  && <EventEditor isCurrent />}
          {tab === "Future event"   && <EventEditor isCurrent={false} />}
          {tab === "Attendees"      && <Attendees />}
          {tab === "Payment config" && <PaymentConfigEditor />}
        </div>
      </main>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function Overview() {
  const [stats, setStats] = useState({ events: 0, orders: 0, confirmed: 0, revenue: 0, sold: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!supabase) { setLoading(false); return; }
      const [evRes, ordRes] = await Promise.all([
        supabase.from("events").select("id").eq("status", "published"),
        supabase.from("orders").select("status, amount_kes, order_items(quantity)"),
      ]);
      if (!active) return;
      const orders = (ordRes.data ?? []) as Array<{ status: string; amount_kes: number; order_items: Array<{ quantity: number }> }>;
      const conf = orders.filter(o => o.status === "confirmed" || o.status === "paid");
      setStats({
        events: evRes.data?.length ?? 0,
        orders: orders.length,
        confirmed: conf.length,
        revenue: conf.reduce((s, o) => s + o.amount_kes, 0),
        sold: conf.reduce((s, o) => s + (o.order_items ?? []).reduce((ss, i) => ss + i.quantity, 0), 0),
      });
      setLoading(false);
    };
    void load();
    const unsub = subscribeToAdminData(() => void load());
    return () => { active = false; unsub(); };
  }, []);

  return (
    <div>
      <h2 className="font-display text-4xl font-bold">Your events at a glance.</h2>
      {loading ? <div className="mt-8 flex items-center gap-2 text-sm text-black/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Published events" value={String(stats.events)} />
          <Metric label="Total orders" value={String(stats.orders)} />
          <Metric label="Confirmed orders" value={String(stats.confirmed)} />
          <Metric label="Tickets sold" value={String(stats.sold)} />
          <Metric label="Confirmed revenue" value={`KES ${stats.revenue.toLocaleString("en-KE")}`} accent />
          <Metric label="Ops dashboard" value="Prestige →" />
        </div>
      )}
      <div className="mt-8 rounded-3xl border border-black/10 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-black/40">Note</p>
        <p className="mt-2 text-sm leading-7 text-black/60">
          Create and manage events in <strong>Current event</strong> and <strong>Future event</strong>. 
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

// ── Event Editor ──────────────────────────────────────────────────────────────
function EventEditor({ isCurrent }: { isCurrent: boolean }) {
  const [row, setRow] = useState<AdminEvent | null>(null);
  const [draft, setDraft] = useState({
    name: "", short_description: "", description: "",
    venue: "", address: "", city: "",
    event_date: "", start_time: "", end_time: "", venue_map_url: "",
    status: "draft" as AdminEvent["status"], is_current: isCurrent,
  });
  const [poster, setPoster] = useState("");
  const [tiers, setTiers] = useState<AdminTicketType[]>([]);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const showMsg = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    if (ok) setTimeout(() => setMsg(null), 4000);
  };

  const refresh = useCallback(async () => {
    try {
      const rows = await getAdminEvents();
      const found = isCurrent
        ? rows.find(e => e.is_current)
        : rows.find(e => !e.is_current && e.status !== "archived");
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
    } catch (err) {
      // server not ready yet — ignore
      console.warn("Could not load events:", err);
    }
  }, [isCurrent]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { return subscribeToAdminData(() => void refresh()); }, [refresh]);

  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const doSave = async (silent = false) => {
    if (!draft.name.trim()) { showMsg("Event name is required.", false); return; }
    setSaving(true);
    try {
      let saved: AdminEvent;
      if (row) {
        saved = await saveAdminEvent({
          id: row.id,
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
          is_current: draft.is_current,
          poster_path: poster || null,
        });
      } else {
        saved = await createAdminEvent({
          name: draft.name.trim(),
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
      if (!silent) showMsg("Saved successfully.", true);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not save";
      const hint = text.includes("SERVICE_ROLE")
        ? text + " — set SUPABASE_SERVICE_ROLE_KEY in your .env file."
        : text;
      showMsg(hint, false);
    } finally {
      setSaving(false);
    }
  };

  const doUpload = async (file?: File) => {
    if (!file) return;
    // Save first to get an event ID
    if (!row) {
      await doSave(true);
    }
    // Re-read to get current row id
    const rows = await getAdminEvents();
    const found = isCurrent ? rows.find(e => e.is_current) : rows.find(e => !e.is_current && e.status !== "archived");
    if (!found) return;

    setUploading(true);
    try {
      const { url } = await uploadEventPoster(file, found.id);
      setPoster(url);
      await saveAdminEvent({ id: found.id, poster_path: url });
      setRow({ ...found, poster_path: url });
      showMsg("Poster uploaded.", true);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Upload failed", false);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-5xl">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-black/50">{isCurrent ? "Live event" : "Draft / upcoming event"}</p>
          <h2 className="mt-1 font-display text-3xl font-bold">{isCurrent ? "Current event" : "Future event"}</h2>
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
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {msg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      {!row && (
        <p className="mt-4 rounded-xl border border-dashed border-black/15 bg-white px-5 py-4 text-sm text-black/50">
          No {isCurrent ? "current" : "upcoming"} event yet. Fill in the name below and click Save to create one.
        </p>
      )}

      {/* Two-column layout */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Poster + is_current */}
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
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => void doUpload(e.target.files?.[0])} />
          </div>

          {/* is_current toggle */}
          <button onClick={() => set("is_current", !draft.is_current)}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${draft.is_current ? "border-green-300 bg-green-50 text-green-800" : "border-black/10 bg-white text-black/50"}`}>
            <span>Set as current event</span>
            {draft.is_current ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <div className="h-4 w-4 rounded-full border-2 border-black/20" />}
          </button>
          <p className="px-1 text-xs text-black/35">Only one event can be current at a time.</p>
        </div>

        {/* Fields */}
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
      </div>

      {/* Ticket tiers */}
      <TierEditor eventId={row?.id ?? null} tiers={tiers} setTiers={setTiers} />
    </div>
  );
}

// ── Tier Editor ───────────────────────────────────────────────────────────────
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

  const addTier = () => {
    if (!eventId) return;
    const id = `new-${Date.now()}`;
    setTiers(ts => [...ts, {
      id, event_id: eventId, name: "New tier", description: "",
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
      setTiers(ts => ts.map(t => t.id === tier.id ? saved : t));
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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-black/50">Ticket configuration</p>
          <h3 className="mt-1 font-display text-2xl font-bold">Ticket tiers</h3>
        </div>
        <Button variant="outline" onClick={addTier} disabled={!eventId}>
          <Plus className="mr-2 h-4 w-4" /> Add tier
        </Button>
      </div>

      {!eventId && (
        <p className="mt-5 rounded-2xl border border-dashed border-black/15 bg-white p-5 text-center text-sm text-black/40">
          Save the event details above first, then add ticket tiers here.
        </p>
      )}

      {eventId && tiers.length === 0 && (
        <p className="mt-5 rounded-2xl border border-dashed border-black/15 p-5 text-center text-sm text-black/40">
          No tiers yet. Click "Add tier" to create your first ticket type.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {tiers.map(tier => {
          const isOpen = open === tier.id;
          const sold = tier.quantity_sold ?? 0;
          const avail = Math.max(0, tier.quantity_total - sold);
          const pct = tier.quantity_total > 0 ? Math.round((sold / tier.quantity_total) * 100) : 0;
          const m = msgs[tier.id];

          return (
            <div key={tier.id} className={`overflow-hidden rounded-2xl border bg-white transition-all ${isOpen ? "border-black/20 shadow-sm" : "border-black/10"}`}>
              {/* Row */}
              <div className="flex items-center gap-4 p-4">
                <div className={`h-2 w-2 shrink-0 rounded-full ${tier.is_active && tier.is_visible ? "bg-green-500" : "bg-gray-300"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{tier.name || "Untitled"}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-black/50">
                    <span>KES {tier.price_kes.toLocaleString()}</span>
                    <span>·</span>
                    <span>{avail} / {tier.quantity_total} available</span>
                    {sold > 0 && <><span>·</span><span className="text-primary">{pct}% sold</span></>}
                  </div>
                  {tier.quantity_total > 0 && (
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
                    <F label="Total quantity" value={String(tier.quantity_total)} onChange={v => upd(tier.id, "quantity_total", Number(v) || 0)} type="number" />
                    <div>
                      <p className="mb-2 text-sm font-semibold">Sold (auto)</p>
                      <div className="flex h-10 items-center rounded-xl border border-black/10 bg-black/3 px-3 text-sm text-black/45">{sold} sold</div>
                    </div>
                    <F label="Min per order" value={String(tier.min_per_order ?? 1)} onChange={v => upd(tier.id, "min_per_order", Number(v) || 1)} type="number" />
                    <F label="Max per order" value={String(tier.max_per_order)} onChange={v => upd(tier.id, "max_per_order", Number(v) || 1)} type="number" />
                    <div>
                      <label className="text-xs text-black/50">Sales start</label>
                      <Input type="datetime-local" className="mt-1" value={tier.sales_start ?? ""} onChange={e => upd(tier.id, "sales_start", e.target.value || null)} />
                    </div>
                    <div>
                      <label className="text-xs text-black/50">Sales end</label>
                      <Input type="datetime-local" className="mt-1" value={tier.sales_end ?? ""} onChange={e => upd(tier.id, "sales_end", e.target.value || null)} />
                    </div>
                  </div>
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
                        <div className="text-right"><p className="text-[10px] text-white/35">Available</p><p className="text-sm font-semibold">{avail.toLocaleString()}</p></div>
                        <div className="text-right"><p className="text-[10px] text-white/35">Status</p><p className={`text-xs font-bold ${tier.is_active && tier.is_visible ? "text-green-400" : "text-white/25"}`}>{tier.is_active && tier.is_visible ? "On Sale" : "Hidden"}</p></div>
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
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const rows = await getAdminTickets(); if (active) setTickets(rows); }
      finally { if (active) setLoading(false); }
    };
    void load();
    const unsub = subscribeToAdminData(() => void load());
    return () => { active = false; unsub(); };
  }, []);

  const filtered = tickets.filter(t => {
    if (!q) return true;
    const s = q.toLowerCase();
    return t.attendee_name.toLowerCase().includes(s) || t.ticket_number.toLowerCase().includes(s) || (t.event?.name ?? "").toLowerCase().includes(s);
  });

  return (
    <div className="max-w-5xl">
      <h2 className="font-display text-3xl font-bold">Attendees</h2>
      <Input className="mt-5" placeholder="Search by name, ticket #, or event…" value={q} onChange={e => setQ(e.target.value)} />
      {loading
        ? <div className="mt-8 flex items-center gap-2 text-sm text-black/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        : !filtered.length
          ? <EmptyState title={q ? "No results" : "No attendees yet"} />
          : (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-black/10 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-black/10 text-xs uppercase tracking-wider text-black/40">
                  <tr><th className="p-4">Attendee</th><th className="p-4">Ticket #</th><th className="p-4">Event</th><th className="p-4">Type</th><th className="p-4">Status</th></tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id} className="border-b border-black/5 last:border-0 hover:bg-black/[0.02]">
                      <td className="p-4 font-semibold">{t.attendee_name}</td>
                      <td className="p-4 font-mono text-xs">{t.ticket_number}</td>
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

// ── Payment config ────────────────────────────────────────────────────────────
function PaymentConfigEditor() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventSlug, setEventSlug] = useState<string | null>(null);
  const [type, setType] = useState<"till" | "paybill">("till");
  const [number, setNumber] = useState("");
  const [account, setAccount] = useState("");
  const [instructions, setInstructions] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      if (!supabase) { setLoading(false); return; }
      const rows = await getAdminEvents();
      const cur = rows.find(e => e.is_current) ?? rows[0];
      if (!cur) { setLoading(false); return; }
      setEventId(cur.id);
      setEventSlug(cur.slug);
      const r = await fetch(`/api/payment-config/${cur.slug}`)
        .then(x => x.json() as Promise<{ config: PaymentConfig | null }>)
        .catch(() => ({ config: null }));
      if (r.config) {
        setType(r.config.payment_type as "till" | "paybill");
        setNumber(r.config.number ?? "");
        setAccount(r.config.account_number ?? "");
        setInstructions(r.config.instructions ?? "");
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!eventId || !number.trim()) { setMsg({ text: "Payment number is required.", ok: false }); return; }
    try {
      const { savePrestigePaymentConfig } = await import("@/lib/supabase");
      await savePrestigePaymentConfig({ eventId, paymentType: type, number: number.trim(), accountNumber: account.trim() || undefined, instructions: instructions.trim() || undefined });
      setMsg({ text: "Saved.", ok: true });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Could not save", ok: false });
    }
  };

  if (loading) return <Spinner />;
  if (!eventId) return <EmptyState title="No events yet. Create an event first." />;

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-black/50">M-Pesa payment settings{eventSlug ? ` · ${eventSlug}` : ""}</p>
          <h2 className="mt-1 font-display text-3xl font-bold">Payment config</h2>
        </div>
        <Button onClick={() => void save()} className="bg-[#c1e51a] text-black hover:bg-[#b1d410]">
          <Save className="mr-2 h-4 w-4" /> Save
        </Button>
      </div>

      {msg && (
        <div className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {msg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      <div className="mt-8 space-y-5 rounded-3xl border border-black/10 bg-white p-6">
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
function F({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="mb-5 block text-sm font-semibold">
      {label}
      <Input className="mt-2" type={type} value={value} onChange={e => onChange(e.target.value)} />
    </label>
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
