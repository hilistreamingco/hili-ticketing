import { useEffect, useRef, useState } from "react";
import { BarChart3, CalendarDays, FileText, ImagePlus, LayoutDashboard, LogOut, Save, Settings2, Upload, Users, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { events } from "@/lib/events";
import { createAdminEvent, getAdminEvents, getAdminTicketTypes, getAdminTickets, saveAdminEvent, saveAdminTicketType, subscribeToAdminData, supabase, uploadEventPoster, savePrestigePaymentConfig, type AdminEvent, type AdminTicketType, type AdminTicket } from "@/lib/supabase";
import { Link } from "react-router-dom";

type Tab = "Overview" | "Current event" | "Future event" | "Attendees" | "Analytics" | "Payment config";

export default function AdminPage() {
  const [session, setSession] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => { if (!supabase) { setChecking(false); return; } supabase.auth.getSession().then(({ data }) => { setSession(Boolean(data.session)); setChecking(false); }); }, []);
  if (checking) return <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] text-white">Loading admin…</div>;
  if (!session) return <Login onLogin={() => setSession(true)} />;
  return <Dashboard onLogout={async () => { await supabase?.auth.signOut(); setSession(false); }} />;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!supabase) return setError("Supabase is not configured."); const result = await supabase.auth.signInWithPassword({ email, password }); if (result.error) setError(result.error.message); else onLogin(); };
  return <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] px-5 text-white"><form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-7 text-[#0b0b0b] shadow-2xl"><div className="flex items-center gap-3"><img src="/favicon.svg" alt="Hili" className="h-10 w-10 rounded-full" /><strong className="font-display text-xl">Hili Admin</strong></div><h1 className="mt-10 font-display text-3xl font-bold">Welcome back.</h1>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<label className="mt-7 block text-sm font-semibold">Email<Input className="mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label className="mt-4 block text-sm font-semibold">Password<Input className="mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><Button className="mt-6 h-12 w-full bg-[#c1e51a] text-black hover:bg-[#b1d410]">Sign in</Button></form></div>;
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const tabs: { label: Tab; icon: typeof LayoutDashboard }[] = [{ label: "Overview", icon: LayoutDashboard }, { label: "Current event", icon: CalendarDays }, { label: "Future event", icon: ImagePlus }, { label: "Attendees", icon: Users }, { label: "Analytics", icon: BarChart3 }, { label: "Payment config", icon: Settings2 }];
  return <div className="min-h-screen bg-[#f4f4ef] text-[#0b0b0b]"><aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[#0b0b0b] p-6 text-white lg:flex"><Brand /><nav className="mt-14 space-y-1">{tabs.map(({ label, icon: Icon }) => <button key={label} onClick={() => setTab(label)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${tab === label ? "bg-[#c1ff1a] font-semibold text-black" : "text-white/60 hover:bg-white/10 hover:text-white"}`}><Icon className="h-4 w-4" />{label}</button>)}</nav><button onClick={onLogout} className="mt-auto flex items-center gap-2 text-sm text-white/60 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button></aside><main className="lg:pl-64"><header className="flex items-center justify-between border-b border-black/10 px-5 py-5 sm:px-10"><div><p className="text-[10px] uppercase tracking-[.25em] text-black/45">Hili workspace</p><h1 className="mt-1 font-display text-xl font-bold">{tab}</h1></div><div className="flex gap-2 lg:hidden">{tabs.map(({ label }) => <button key={label} onClick={() => setTab(label)} className={`rounded-full px-3 py-2 text-xs font-semibold ${tab === label ? "bg-black text-white" : "bg-black/5"}`}>{label}</button>)}</div></header><div className="p-5 sm:p-10">{tab === "Overview" && <Overview />}{tab === "Current event" && <EventEditor current />}{tab === "Future event" && <EventEditor />}{tab === "Attendees" && <AttendeeSummary />}{tab === "Analytics" && <Empty title="Analytics" />}{tab === "Payment config" && <PaymentConfigEditor />}</div></main></div>;
}

function Brand() { return <div className="flex items-center gap-3"><img src="/favicon.svg" alt="Hili" className="h-9 w-9 rounded-full" /><span className="font-display text-lg font-bold">Hili Admin</span></div>; }
function Overview() { return <div><p className="text-sm font-semibold text-black/50">Good morning, Hili</p><h2 className="mt-2 font-display text-4xl font-bold">Your events at a glance.</h2><div className="mt-8 grid gap-4 sm:grid-cols-3"><Metric label="Published events" value="1" /><Metric label="Ticket delivery" value="Automatic" /><Metric label="Storage" value="Supabase" /></div><div className="mt-8 rounded-3xl border border-black/10 bg-white p-6"><p className="text-xs uppercase tracking-widest text-black/45">Admin workflow</p><p className="mt-3 max-w-2xl text-sm leading-7 text-black/60">Edit event details, upload posters to Supabase Storage, manage ticket tiers, and publish updates from the Current event and Future event tabs.</p></div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-black/10 bg-white p-5"><p className="text-sm text-black/50">{label}</p><p className="mt-3 font-display text-2xl font-bold">{value}</p></div>; }

function EventEditor({ current = false }: { current?: boolean }) {
  const [row, setRow] = useState<AdminEvent | null>(null); const [draft, setDraft] = useState({ name: current ? events[0].title : "", short_description: current ? events[0].shortDescription : "", description: current ? events[0].description : "", venue: current ? events[0].venue : "", address: current ? events[0].address : "", city: current ? events[0].city : "", event_date: current ? events[0].date : "", venue_map_url: current ? events[0].mapUrl : "", status: (current ? "published" : "draft") as AdminEvent["status"] });
  const [poster, setPoster] = useState(current ? events[0].coverImage : ""); const [tiers, setTiers] = useState<AdminTicketType[]>([]); const [message, setMessage] = useState(""); const fileRef = useRef<HTMLInputElement>(null);
  const refresh = async () => { if (!supabase) return; const rows = await getAdminEvents(); const found = current ? rows.find((item) => item.is_current) : rows.find((item) => !item.is_current && item.status !== "archived"); if (found) { setRow(found); setDraft({ name: found.name, short_description: found.short_description || "", description: found.description || "", venue: found.venue || "", address: found.address || "", city: found.city || "", event_date: found.event_date || "", venue_map_url: found.venue_map_url || "", status: found.status }); setPoster(found.poster_path || ""); setTiers(await getAdminTicketTypes(found.id)); } };
  useEffect(() => { void refresh().catch(() => undefined); }, [current]);
  useEffect(() => { const unsubscribe = subscribeToAdminData(() => { void refresh().catch(() => undefined); }); return unsubscribe; }, [current]);
  const set = (key: keyof typeof draft, value: string) => setDraft((old) => ({ ...old, [key]: value }));
  const upload = async (file?: File) => { if (!file || !row) return; try { const uploaded = await uploadEventPoster(file, row.id); setPoster(uploaded.url); setMessage("Poster uploaded to Supabase Storage."); } catch (error) { setMessage(error instanceof Error ? error.message : "Poster upload failed"); } };
  const save = async () => { try { let saved: AdminEvent; if (row) saved = await saveAdminEvent({ id: row.id, ...draft, poster_path: poster }); else { const existing = (await getAdminEvents())[0]; if (!existing) throw new Error("Create the Hili organization first in Supabase."); saved = await createAdminEvent({ organization_id: existing.organization_id, slug: draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), name: draft.name, short_description: draft.short_description, description: draft.description, poster_path: poster || null, venue: draft.venue, address: draft.address, city: draft.city, event_date: draft.event_date || null, start_time: null, end_time: null, venue_map_url: draft.venue_map_url, status: draft.status, is_current: false, theme: {}, settings: {} }); } setRow(saved); setMessage("Saved to Supabase."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save event"); } };
  return <div className="max-w-5xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-black/50">{current ? "Live event" : "Draft event"}</p><h2 className="mt-2 font-display text-3xl font-bold">{current ? "Current event" : "Future event"}</h2></div><Button onClick={save} className="bg-[#c1e51a] text-black hover:bg-[#b1d410]"><Save className="mr-2 h-4 w-4" />Save to Supabase</Button></div>{message && <p className="mt-4 rounded-xl bg-white p-3 text-sm text-black/65">{message}</p>}<div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]"><div onClick={() => fileRef.current?.click()} className="cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-black/15 bg-white"><div className="flex aspect-[4/3] items-center justify-center">{poster ? <img src={poster} alt="Event poster" className="h-full w-full object-cover" /> : <Upload className="h-8 w-8 text-black/30" />}</div><p className="p-3 text-center text-sm font-semibold">Upload poster</p><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} /></div><div className="rounded-3xl border border-black/10 bg-white p-6"><Field label="Event name" value={draft.name} onChange={(value) => set("name", value)} /><Field label="Proposed/event date" value={draft.event_date} onChange={(value) => set("event_date", value)} type="date" /><Field label="Venue" value={draft.venue} onChange={(value) => set("venue", value)} /><Field label="Address" value={draft.address} onChange={(value) => set("address", value)} /><Field label="City" value={draft.city} onChange={(value) => set("city", value)} /><Field label="Google Maps link" value={draft.venue_map_url} onChange={(value) => set("venue_map_url", value)} /><label className="mb-5 block text-sm font-semibold">Short description<Input className="mt-2" value={draft.short_description} onChange={(event) => set("short_description", event.target.value)} /></label><label className="block text-sm font-semibold">Description<Textarea className="mt-2" value={draft.description} onChange={(event) => set("description", event.target.value)} /></label></div></div>{current && <TicketEditor eventId={row?.id} tiers={tiers} setTiers={setTiers} />}</div>;
}

function TicketEditor({ eventId, tiers, setTiers }: { eventId?: string; tiers: AdminTicketType[]; setTiers: React.Dispatch<React.SetStateAction<AdminTicketType[]>> }) { const update = (index: number, key: keyof AdminTicketType, value: string) => setTiers((old) => old.map((tier, itemIndex) => itemIndex === index ? { ...tier, [key]: key === "price_kes" || key === "quantity_total" || key === "max_per_order" ? Number(value) || 0 : value } : tier)); const save = async (tier: AdminTicketType) => { if (!eventId) return; const saved = await saveAdminTicketType({ ...tier, event_id: eventId }); setTiers((old) => old.map((item) => item.id === tier.id ? saved : item)); }; return <section className="mt-10"><div className="flex items-end justify-between"><div><p className="text-sm text-black/50">Supabase ticket types</p><h3 className="mt-1 font-display text-2xl font-bold">Ticket tiers</h3></div><Button variant="outline" onClick={() => eventId && setTiers((old) => [...old, { id: `new-${old.length}`, event_id: eventId, name: "New tier", description: "", price_kes: 0, quantity_total: 100, quantity_sold: 0, max_per_order: 6, is_visible: true, is_active: true, sort_order: old.length }])}>Add tier</Button></div><div className="mt-5 grid gap-4">{tiers.map((tier, index) => <div key={tier.id} className="grid gap-4 rounded-2xl border border-black/10 bg-white p-5 sm:grid-cols-4"><Field label="Name" value={tier.name} onChange={(value) => update(index, "name", value)} /><Field label="Price (KSh)" value={String(tier.price_kes)} onChange={(value) => update(index, "price_kes", value)} /><Field label="Quantity" value={String(tier.quantity_total)} onChange={(value) => update(index, "quantity_total", value)} /><Button className="mt-6" onClick={() => void save(tier)}>Save tier</Button></div>)}</div></section>; }
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="mb-5 block text-sm font-semibold">{label}<Input className="mt-2" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function AttendeeSummary() { const [tickets, setTickets] = useState<AdminTicket[]>([]); const [loading, setLoading] = useState(true); useEffect(() => { let active = true; const refresh = async () => { try { const rows = await getAdminTickets(); if (active) setTickets(rows); } finally { if (active) setLoading(false); } }; void refresh(); const unsubscribe = subscribeToAdminData(() => { void refresh(); }); return () => { active = false; unsubscribe(); }; }, []); return <div className="max-w-5xl"><p className="text-sm text-black/50">Issued tickets from Supabase</p><h2 className="mt-2 font-display text-3xl font-bold">Attendees</h2>{loading ? <p className="mt-8 text-sm text-black/55">Loading attendee records…</p> : !tickets.length ? <Empty title="No attendees yet" /> : <div className="mt-8 overflow-x-auto rounded-2xl border border-black/10 bg-white"><table className="w-full text-left text-sm"><thead className="border-b border-black/10 text-xs uppercase tracking-wider text-black/45"><tr><th className="p-4">Attendee</th><th className="p-4">Ticket</th><th className="p-4">Event</th><th className="p-4">Status</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id} className="border-b border-black/5 last:border-0"><td className="p-4 font-semibold">{ticket.attendee_name}</td><td className="p-4 font-mono text-xs">{ticket.ticket_number}</td><td className="p-4">{ticket.event?.name || "—"}</td><td className="p-4">{ticket.checked_in_at ? "Checked in" : "Valid"}</td></tr>)}</tbody></table></div>}</div>; }
function Empty({ title }: { title: string }) { return <div className="rounded-3xl border border-black/10 bg-white p-7"><FileText className="h-7 w-7" /><h2 className="mt-5 font-display text-2xl font-bold">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-black/55">This workspace is connected to Supabase. Ticket and attendee records appear after a confirmed payment.</p></div>; }

// ── Payment Config Editor ────────────────────────────────────────────────────
function PaymentConfigEditor() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<"till" | "paybill">("till");
  const [number, setNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [instructions, setInstructions] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      if (!supabase) { setLoading(false); return; }
      const rows = await getAdminEvents();
      const current = rows.find((e) => e.is_current);
      if (!current) { setLoading(false); return; }
      setEventId(current.id);
      // Fetch existing config
      const res = await fetch(`/api/payment-config/${current.slug}`).then((r) => r.json()).catch(() => ({ config: null })) as { config: import("@shared/api").PaymentConfig | null };
      if (res.config) {
        setPaymentType(res.config.payment_type as "till" | "paybill");
        setNumber(res.config.number || "");
        setAccountNumber(res.config.account_number || "");
        setInstructions(res.config.instructions || "");
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!eventId || !number.trim()) { setMessage("Please fill in the payment number."); return; }
    try {
      await savePrestigePaymentConfig({ eventId, paymentType, number: number.trim(), accountNumber: accountNumber.trim() || undefined, instructions: instructions.trim() || undefined });
      setMessage("Payment configuration saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save configuration");
    }
  };

  if (loading) return <p className="text-sm text-black/50">Loading payment configuration…</p>;
  if (!eventId) return <Empty title="No current event" />;

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-black/50">M-Pesa payment settings</p>
          <h2 className="mt-2 font-display text-3xl font-bold">Payment config</h2>
        </div>
        <Button onClick={() => void save()} className="bg-[#c1e51a] text-black hover:bg-[#b1d410]">
          <Save className="mr-2 h-4 w-4" />Save
        </Button>
      </div>
      {message && <p className="mt-4 rounded-xl bg-white p-3 text-sm text-black/65">{message}</p>}

      <div className="mt-8 rounded-3xl border border-black/10 bg-white p-6 space-y-5">
        <div>
          <p className="text-sm font-semibold">Payment type</p>
          <div className="mt-2 flex gap-3">
            {(["till", "paybill"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPaymentType(t)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${paymentType === t ? "border-black bg-black text-white" : "border-black/15 bg-white text-black/60 hover:border-black/30"}`}
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
        />

        {paymentType === "paybill" && (
          <Field label="Account Number / Reference" value={accountNumber} onChange={setAccountNumber} />
        )}

        <div>
          <label className="block text-sm font-semibold">
            Custom instructions{" "}
            <span className="font-normal text-black/40">(optional — shown on checkout page)</span>
          </label>
          <p className="mt-1 text-xs text-black/45">
            Leave blank to use the default step-by-step M-Pesa instructions. You can use basic HTML
            for formatting.
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
          The Prestige/BeerBirds operations dashboard is available at{" "}
          <Link to="/admin/prestige" className="font-semibold text-black underline underline-offset-2">
            /admin/prestige
          </Link>.
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
