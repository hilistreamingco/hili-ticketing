import { useCallback, useEffect, useState } from "react";
import { BadgePercent, CheckCircle2, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkDiscountCode,
  createDiscountCode,
  deleteDiscountCode,
  getDiscountReport,
  redeemDiscountAtGate,
  updateDiscountCode,
  type DiscountRow,
} from "@/lib/supabase";
import { formatNairobi, nairobiInputToIso } from "@/lib/time";

type EventOption = { id: string; title: string };

const kes = (n: number) => `KES ${n.toLocaleString()}`;

function statusOf(c: DiscountRow): { label: string; cls: string } {
  const now = Date.now();
  if (!c.is_active) return { label: "Off", cls: "bg-black/10 text-black/60" };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { label: "Expired", cls: "bg-red-50 text-red-700" };
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: "Scheduled", cls: "bg-amber-50 text-amber-800" };
  if (c.usage_limit !== null && c.uses_count >= c.usage_limit) return { label: "Used up", cls: "bg-red-50 text-red-700" };
  return { label: "Live", cls: "bg-green-50 text-green-800" };
}

/**
 * Creator codes.
 * - Inside an event (eventId given): codes for that event, plus codes that work on every event.
 * - On its own tab (no eventId): every code, with an event picker for new codes and for checking.
 * Works for every event type. For gate events, "Redeem at gate" records the use at the door.
 */
export default function DiscountCodesPanel({
  eventId,
  eventType,
  events = [],
}: {
  eventId?: string | null;
  eventType?: string;
  events?: EventOption[];
}) {
  const scoped = eventId !== undefined;
  const [rows, setRows] = useState<DiscountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [creator, setCreator] = useState("");
  const [amount, setAmount] = useState("");
  const [limit, setLimit] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [forEvent, setForEvent] = useState<string>(eventId ?? "");

  const [testCode, setTestCode] = useState("");
  const [testEvent, setTestEvent] = useState<string>(eventId ?? "");
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await getDiscountReport(eventId ?? null));
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || "Could not load codes" });
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await createDiscountCode({
        code,
        creator_name: creator,
        amount_kes: Number(amount),
        usage_limit: limit.trim() ? Number(limit) : null,
        starts_at: starts ? nairobiInputToIso(starts) : null,
        ends_at: ends ? nairobiInputToIso(ends) : null,
        event_id: scoped ? (eventId ?? null) : (forEvent || null),
      });
      setCode(""); setCreator(""); setAmount(""); setLimit(""); setStarts(""); setEnds("");
      setMsg({ ok: true, text: "Code created." });
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || "Could not create the code" });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: DiscountRow) => {
    try { await updateDiscountCode(c.id, { is_active: !c.is_active }); await load(); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  const remove = async (c: DiscountRow) => {
    if (!window.confirm(`Delete ${c.code}?`)) return;
    try { await deleteDiscountCode(c.id); await load(); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  const test = async (redeem: boolean) => {
    if (!testCode.trim() || !testEvent) { setTestResult({ ok: false, text: "Enter a code and choose an event." }); return; }
    setBusy(true);
    setTestResult(null);
    try {
      const r = redeem ? await redeemDiscountAtGate(testCode, testEvent) : await checkDiscountCode(testCode, testEvent);
      if (r.valid) {
        setTestResult({
          ok: true,
          text: redeem
            ? `Redeemed. ${r.creator}'s code ${r.code} takes ${kes(r.amountKes)} off at the gate.`
            : `Valid. ${r.creator}'s code ${r.code} takes ${kes(r.amountKes)} off.`,
        });
        if (redeem) await load();
      } else {
        setTestResult({ ok: false, text: r.message });
      }
    } catch (e: any) {
      setTestResult({ ok: false, text: e.message || "Could not check the code" });
    } finally {
      setBusy(false);
    }
  };

  const totals = rows.reduce(
    (a, c) => ({ tickets: a.tickets + c.tickets, off: a.off + c.discount_total, net: a.net + c.net_total, gate: a.gate + c.gate_uses }),
    { tickets: 0, off: 0, net: 0, gate: 0 },
  );
  const isGate = eventType === "gate";

  return (
    <div className="mt-8 rounded-3xl border border-black/10 bg-white p-6">
      <div className="flex items-center gap-2">
        <BadgePercent className="h-5 w-5 text-black/50" />
        <h3 className="font-display text-lg font-bold">Creator codes</h3>
      </div>
      <p className="mt-1 text-sm text-black/50">
        A code takes a fixed amount off an order. {isGate
          ? "Gate events have no online checkout, so check the code and press Redeem at gate when the guest arrives."
          : "Buyers type it at checkout and see their new price straight away."}
      </p>

      {/* Check / redeem */}
      <div className="mt-5 rounded-2xl bg-black/[.03] p-4">
        <p className="text-sm font-semibold">Check a code</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={testCode} onChange={(e) => setTestCode(e.target.value.toUpperCase())} placeholder="Code" className="sm:max-w-[200px]" />
          {!scoped && (
            <select value={testEvent} onChange={(e) => setTestEvent(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Choose event</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </select>
          )}
          <Button type="button" variant="outline" disabled={busy} onClick={() => test(false)}>Check</Button>
          {(isGate || !scoped) && (
            <Button type="button" disabled={busy} onClick={() => test(true)}>Redeem at gate</Button>
          )}
        </div>
        {testResult && (
          <p className={`mt-3 flex items-center gap-2 text-sm ${testResult.ok ? "text-green-800" : "text-red-700"}`}>
            {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {testResult.text}
          </p>
        )}
        {!scoped && <p className="mt-2 text-xs text-black/40">Redeem at gate is for gate events only. Online orders use the code at checkout.</p>}
      </div>

      {/* Create */}
      <div className="mt-5">
        <p className="text-sm font-semibold">New code</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-semibold">Creator name
            <Input className="mt-1" value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="e.g. Wanjiru" />
          </label>
          <label className="text-xs font-semibold">Code
            <Input className="mt-1" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. WANJIRU200" />
          </label>
          <label className="text-xs font-semibold">KES off
            <Input className="mt-1" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="200" />
          </label>
          <label className="text-xs font-semibold">Uses allowed
            <Input className="mt-1" type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Empty = unlimited" />
          </label>
          <label className="text-xs font-semibold">Starts (Nairobi time)
            <Input className="mt-1" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
          </label>
          <label className="text-xs font-semibold">Ends (Nairobi time)
            <Input className="mt-1" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
          </label>
          {!scoped && (
            <label className="text-xs font-semibold">Works on
              <select value={forEvent} onChange={(e) => setForEvent(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Every event</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>
            </label>
          )}
        </div>
        <Button type="button" className="mt-3" disabled={busy || !code || !creator || !amount} onClick={create}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add code"}
        </Button>
        {scoped && !eventId && <p className="mt-2 text-xs text-black/40">Save the event first, then add codes.</p>}
        {msg && (
          <p className={`mt-3 flex items-center gap-2 text-sm ${msg.ok ? "text-green-800" : "text-red-700"}`}>
            {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{msg.text}
          </p>
        )}
      </div>

      {/* Report */}
      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">Sales by creator</p>
          {rows.length > 0 && (
            <p className="text-xs text-black/50">
              {totals.tickets} online tickets · {totals.gate} gate uses · {kes(totals.off)} off · {kes(totals.net)} paid
            </p>
          )}
        </div>
        {loading ? <p className="mt-3 text-sm text-black/40">Loading…</p> : rows.length === 0 ? (
          <p className="mt-3 text-sm text-black/40">No codes yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-black/40">
                <tr>
                  <th className="py-2 pr-3">Creator</th><th className="pr-3">Code</th><th className="pr-3">Off</th>
                  <th className="pr-3">Uses</th><th className="pr-3">Tickets</th><th className="pr-3">Paid</th>
                  <th className="pr-3">Window</th><th className="pr-3">Status</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const st = statusOf(c);
                  return (
                    <tr key={c.id} className="border-t border-black/5 align-top">
                      <td className="py-2 pr-3 font-semibold">{c.creator_name}
                        {!scoped && <span className="block text-xs font-normal text-black/40">{c.event_name ?? "Every event"}</span>}
                        {scoped && !c.event_id && <span className="block text-xs font-normal text-black/40">Every event</span>}
                      </td>
                      <td className="pr-3 font-mono text-xs">{c.code}</td>
                      <td className="pr-3">{kes(c.amount_kes)}</td>
                      <td className="pr-3">{c.uses_count}{c.usage_limit !== null ? ` / ${c.usage_limit}` : ""}{c.gate_uses ? ` (${c.gate_uses} gate)` : ""}</td>
                      <td className="pr-3">{c.tickets}</td>
                      <td className="pr-3">{kes(c.net_total)}</td>
                      <td className="pr-3 text-xs text-black/50">
                        {c.starts_at ? formatNairobi(c.starts_at) : "Any time"}<br />{c.ends_at ? `to ${formatNairobi(c.ends_at)}` : "no end"}
                      </td>
                      <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
                      <td className="whitespace-nowrap text-right">
                        <button type="button" onClick={() => toggle(c)} className="mr-2 text-xs font-semibold underline">{c.is_active ? "Turn off" : "Turn on"}</button>
                        {c.uses_count === 0 && (
                          <button type="button" onClick={() => remove(c)} aria-label="Delete code" className="text-black/40 hover:text-red-600">
                            <Trash2 className="inline h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
