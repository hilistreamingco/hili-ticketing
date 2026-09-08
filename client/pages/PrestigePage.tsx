import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  BanknoteIcon,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Download,
  FileText,
  Inbox,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
  TicketIcon,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  supabase,
  fetchPrestigeStats,
  fetchPrestigeOrders,
  fetchPrestigeOrder,
  confirmPrestigePayment,
  markPrestigeNotFound,
  sendPrestigeTicket,
  subscribeToPrestigeOrders,
  getCurrentUserRole,
  isPrestigeRole,
} from "@/lib/supabase";
import type { Order, PrestigeStats } from "@shared/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatKes(amount: number) {
  return `KES ${amount.toLocaleString("en-KE")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    processing: "bg-amber-100 text-amber-800 border-amber-200",
    confirmed: "bg-green-100 text-green-800 border-green-200",
    paid: "bg-green-100 text-green-800 border-green-200",
    sent: "bg-blue-100 text-blue-800 border-blue-200",
    not_found: "bg-red-100 text-red-800 border-red-200",
    failed: "bg-red-100 text-red-800 border-red-200",
    refunded: "bg-gray-100 text-gray-700 border-gray-200",
  };
  const labels: Record<string, string> = {
    pending: "Pending",
    processing: "Pending",
    confirmed: "Confirmed",
    paid: "Confirmed",
    sent: "Sent",
    not_found: "Not Found",
    failed: "Failed",
    refunded: "Refunded",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${variants[status] || "bg-gray-100 text-gray-600 border-gray-200"}`}
    >
      {labels[status] || status}
    </span>
  );
}

function FulfillmentBadge({ status }: { status: string }) {
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
        <CheckCircle2 className="h-3 w-3" /> Ticket Sent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
      <Clock className="h-3 w-3" /> Not Sent
    </span>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/8 p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-white/55">{label}</p>
        <Icon className="h-4 w-4 text-white/30" />
      </div>
      <p className={`mt-3 font-display text-3xl font-bold ${accent || "text-white"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-white/40">{sub}</p>}
    </div>
  );
}

// ── Order row ────────────────────────────────────────────────────────────────

function OrderRow({
  order,
  onView,
}: {
  order: Order;
  onView: (order: Order) => void;
}) {
  const ticketName = order.items?.[0]?.ticket_type_name ?? "Ticket";
  const qty = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 1;
  return (
    <tr className="border-b border-white/8 transition-colors hover:bg-white/5">
      <td className="p-4 font-mono text-xs font-semibold text-[#c1ff1a]">{order.order_number}</td>
      <td className="p-4">
        <p className="font-semibold text-white">{order.purchaser_name}</p>
        <p className="text-xs text-white/50">{order.purchaser_phone}</p>
      </td>
      <td className="hidden p-4 text-sm text-white/70 md:table-cell">
        {ticketName} × {qty}
      </td>
      <td className="hidden p-4 text-sm font-semibold text-white lg:table-cell">
        {formatKes(order.amount_kes)}
      </td>
      <td className="p-4">
        <StatusBadge status={order.status} />
      </td>
      <td className="hidden p-4 lg:table-cell">
        <FulfillmentBadge status={order.fulfillment_status} />
      </td>
      <td className="p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onView(order)}
          className="text-white/60 hover:bg-white/10 hover:text-white"
        >
          View <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

// ── Order detail modal ────────────────────────────────────────────────────────

function OrderModal({
  orderId,
  onClose,
  onRefresh,
}: {
  orderId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<"idle" | "confirming" | "sending" | "marking">("idle");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showNotFoundDialog, setShowNotFoundDialog] = useState(false);
  const [notFoundNote, setNotFoundNote] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const o = await fetchPrestigeOrder(orderId);
      setOrder(o);
    } catch {
      setToast({ msg: "Could not load order details", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleConfirm = async () => {
    if (!order) return;
    setActionState("confirming");
    setShowConfirmDialog(false);
    try {
      await confirmPrestigePayment(order.id);
      showToast("Payment confirmed and tickets generated", "success");
      await load();
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not confirm payment", "error");
    } finally {
      setActionState("idle");
    }
  };

  const handleNotFound = async () => {
    if (!order) return;
    setActionState("marking");
    setShowNotFoundDialog(false);
    try {
      await markPrestigeNotFound(order.id, notFoundNote || undefined);
      showToast("Order marked as payment not found", "success");
      await load();
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not update order", "error");
    } finally {
      setActionState("idle");
    }
  };

  const handleSend = async () => {
    if (!order) return;
    setActionState("sending");
    try {
      // Generate PDF tickets
      const { generateTicketPDF, openGmailWithTickets } = await import("@/lib/ticketGenerator");
      
      const ticketData = order.tickets?.map((ticket: any) => ({
        ticketNumber: ticket.ticket_number,
        attendeeName: ticket.attendee_name,
        eventName: order.event_name || "Event",
        ticketType: order.items?.[0]?.ticket_type_name || "General Admission",
        eventDate: order.event?.start_date ? new Date(order.event.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : undefined,
        eventVenue: order.event?.venue || undefined,
        orderId: order.id.slice(0, 28), // Shortened order ID
      })) || [];

      if (ticketData.length === 0) {
        throw new Error("No tickets found");
      }

      const pdfBlob = await generateTicketPDF(ticketData);
      
      // Open Gmail with pre-filled message
      openGmailWithTickets(
        order.purchaser_email,
        order.purchaser_name,
        order.event_name || "Event",
        pdfBlob,
        ticketData
      );

      // Mark as sent in backend
      await sendPrestigeTicket(order.id);
      
      showToast("Gmail opened with ticket PDF downloaded", "success");
      await load();
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not generate tickets", "error");
    } finally {
      setActionState("idle");
    }
  };

  const isPending = order && (order.status === "pending" || order.status === "processing");
  const isConfirmed = order && (order.status === "confirmed" || order.status === "paid");
  const isSent = order?.fulfillment_status === "sent";
  const ticketName = order?.items?.[0]?.ticket_type_name ?? "Ticket";
  const qty = order?.items?.reduce((s, i) => s + i.quantity, 0) ?? 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#111] text-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-[#111] px-6 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/40">Order details</p>
            <p className="mt-0.5 font-mono text-lg font-bold text-[#c1ff1a]">
              {order?.order_number ?? "…"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`mx-6 mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
              toast.type === "success"
                ? "bg-green-900/60 text-green-300"
                : "bg-red-900/60 text-red-300"
            }`}
          >
            {toast.msg}
          </div>
        )}

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-white/30" />
          </div>
        ) : !order ? (
          <p className="p-8 text-white/50">Order not found.</p>
        ) : (
          <div className="space-y-5 p-6">
            {/* Status badges */}
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={order.status} />
              <FulfillmentBadge status={order.fulfillment_status} />
            </div>

            {/* Customer info */}
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="mb-3 text-xs uppercase tracking-widest text-white/40">Customer</p>
              <div className="space-y-2 text-sm">
                <Row label="Name" value={order.purchaser_name} />
                <Row label="Phone" value={order.purchaser_phone} />
                <Row label="Email" value={order.purchaser_email} />
              </div>
            </section>

            {/* Ticket info */}
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="mb-3 text-xs uppercase tracking-widest text-white/40">Ticket</p>
              <div className="space-y-2 text-sm">
                <Row label="Type" value={ticketName} />
                <Row label="Quantity" value={String(qty)} />
                <Row label="Amount" value={formatKes(order.amount_kes)} highlight />
              </div>
              {order.items?.[0]?.attendee_names?.length ? (
                <div className="mt-3">
                  <p className="text-xs text-white/40">Attendees</p>
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {order.items[0].attendee_names.map((n, i) => (
                      <li key={i} className="text-white/80">
                        {i + 1}. {n}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            {/* M-Pesa info */}
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="mb-3 text-xs uppercase tracking-widest text-white/40">M-Pesa Information</p>
              <div className="space-y-2 text-sm">
                <Row label="M-Pesa Name" value={order.mpesa_name || "—"} />
                <Row
                  label="Transaction Code"
                  value={order.mpesa_transaction_code || "—"}
                  mono
                  highlight={!!order.mpesa_transaction_code}
                />
                <Row label="Expected Amount" value={formatKes(order.amount_kes)} />
                <Row
                  label="Payment Status"
                  value={
                    isPending
                      ? "PENDING VERIFICATION"
                      : isConfirmed
                        ? "CONFIRMED"
                        : order.status.toUpperCase().replace("_", " ")
                  }
                  highlight={isConfirmed}
                />
              </div>
              {order.payment_note && (
                <p className="mt-3 rounded-lg bg-red-900/30 px-3 py-2 text-xs text-red-300">
                  Note: {order.payment_note}
                </p>
              )}
            </section>

            {/* Audit trail */}
            {(order.confirmed_at || order.sent_at) && (
              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="mb-3 text-xs uppercase tracking-widest text-white/40">History</p>
                <div className="space-y-2 text-sm">
                  <Row label="Order Created" value={formatDate(order.created_at)} />
                  {order.confirmed_at && (
                    <Row label="Payment Confirmed" value={formatDate(order.confirmed_at)} highlight />
                  )}
                  {order.sent_at && (
                    <Row label="Ticket Sent" value={formatDate(order.sent_at)} highlight />
                  )}
                </div>
              </section>
            )}

            {/* Actions */}
            <section className="space-y-3 pt-2">
              {isPending && (
                <>
                  <Button
                    onClick={() => setShowConfirmDialog(true)}
                    disabled={actionState !== "idle"}
                    className="h-12 w-full bg-[#c1ff1a] text-black hover:bg-[#b0ee10]"
                  >
                    {actionState === "confirming" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <BadgeCheck className="mr-2 h-4 w-4" />
                    )}
                    Confirm Payment
                  </Button>
                  <Button
                    onClick={() => setShowNotFoundDialog(true)}
                    disabled={actionState !== "idle"}
                    variant="outline"
                    className="h-12 w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Payment Not Found
                  </Button>
                </>
              )}

              {isConfirmed && !isSent && (
                <Button
                  onClick={handleSend}
                  disabled={actionState !== "idle"}
                  className="h-12 w-full bg-blue-500 text-white hover:bg-blue-600"
                >
                  {actionState === "sending" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send Ticket
                </Button>
              )}

              {isSent && (
                <div className="flex items-center gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-300">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Ticket sent</p>
                    <p className="text-xs opacity-70">
                      Sent to {order.purchaser_email}
                      {order.sent_at ? ` on ${formatDate(order.sent_at)}` : ""}
                    </p>
                  </div>
                  {/* Allow re-send */}
                  <Button
                    onClick={handleSend}
                    disabled={actionState !== "idle"}
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-blue-300 hover:bg-blue-500/20"
                  >
                    {actionState === "sending" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Mail className="mr-1 h-3.5 w-3.5" /> Re-send
                      </>
                    )}
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Confirm Payment dialog */}
        {showConfirmDialog && order && (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/80 p-6">
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#1a1a1a] p-6 text-center">
              <ShieldAlert className="mx-auto h-10 w-10 text-[#c1ff1a]" />
              <h3 className="mt-4 font-display text-lg font-bold text-white">Confirm Payment</h3>
              <p className="mt-2 text-sm text-white/60">
                Confirm that you have verified this payment on the designated M-Pesa account.
              </p>
              <div className="mt-4 rounded-xl bg-white/5 p-4 text-left text-sm space-y-2">
                <Row label="Customer" value={order.purchaser_name} />
                <Row label="Amount" value={formatKes(order.amount_kes)} highlight />
                <Row
                  label="Transaction"
                  value={order.mpesa_transaction_code || "Not provided"}
                  mono
                />
              </div>
              <div className="mt-5 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-white/20 text-white hover:bg-white/10"
                  onClick={() => setShowConfirmDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-[#c1ff1a] text-black hover:bg-[#b0ee10]"
                  onClick={() => void handleConfirm()}
                >
                  Yes, Confirm
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Not Found dialog */}
        {showNotFoundDialog && order && (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/80 p-6">
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#1a1a1a] p-6">
              <XCircle className="mx-auto h-10 w-10 text-red-400" />
              <h3 className="mt-4 text-center font-display text-lg font-bold text-white">
                Payment Not Found
              </h3>
              <p className="mt-2 text-center text-sm text-white/60">
                Mark this order as payment not found on the M-Pesa account.
              </p>
              <label className="mt-4 block text-xs text-white/50">
                Note (optional)
                <Input
                  className="mt-1 border-white/20 bg-white/5 text-white placeholder:text-white/30"
                  placeholder="e.g. Transaction not found after 3 attempts"
                  value={notFoundNote}
                  onChange={(e) => setNotFoundNote(e.target.value)}
                />
              </label>
              <div className="mt-5 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-white/20 text-white hover:bg-white/10"
                  onClick={() => setShowNotFoundDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-500 text-white hover:bg-red-600"
                  onClick={() => void handleNotFound()}
                >
                  Mark Not Found
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-white/45">{label}</span>
      <span
        className={`text-right ${highlight ? "font-semibold text-white" : "text-white/80"} ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "overview" | "pending" | "confirmed" | "sent" | "attendees" | "finances";

// ── Dashboard layout ─────────────────────────────────────────────────────────

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<PrestigeStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const [s, o] = await Promise.all([
          fetchPrestigeStats(),
          fetchPrestigeOrders(
            tab === "overview" ? "all" : (tab as "pending" | "confirmed" | "sent"),
          ),
        ]);
        setStats(s);
        setOrders(o);
      } catch {
        // silently fail — stats/orders just won't update
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tab],
  );

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const unsub = subscribeToPrestigeOrders(() => void loadData(true));
    return unsub;
  }, [loadData]);

  const filteredOrders = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(q) ||
      o.purchaser_name.toLowerCase().includes(q) ||
      o.purchaser_phone.includes(q) ||
      o.purchaser_email.toLowerCase().includes(q) ||
      (o.mpesa_transaction_code || "").toLowerCase().includes(q)
    );
  });

  const navItems: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "overview", label: "Dashboard", icon: TicketIcon },
    { id: "pending", label: "Pending", icon: Clock, badge: stats?.pendingOrders },
    { id: "confirmed", label: "Confirmed", icon: BadgeCheck },
    { id: "sent", label: "Sent", icon: Send },
    { id: "attendees", label: "Attendees", icon: Users },
    { id: "finances", label: "Finances", icon: CircleDollarSign },
  ];

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-white/8 bg-[#0f0f0f] p-6 lg:flex">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c1ff1a]">
            <span className="font-display text-sm font-bold text-black">P</span>
          </div>
          <div>
            <span className="font-display text-sm font-bold text-white">Prestige</span>
            <p className="text-[10px] text-white/35">Operations Dashboard</p>
          </div>
        </div>

        <nav className="mt-10 space-y-1">
          {navItems.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                tab === id
                  ? "bg-[#c1ff1a] font-semibold text-black"
                  : "text-white/50 hover:bg-white/8 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {label}
              </span>
              {badge !== undefined && badge > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${tab === id ? "bg-black/20 text-black" : "bg-amber-500/20 text-amber-400"}`}
                >
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <button
          onClick={onLogout}
          className="mt-auto flex items-center gap-2 text-sm text-white/40 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      {/* Main */}
      <main className="lg:pl-64">
        <header className="flex items-center justify-between border-b border-white/8 px-5 py-5 sm:px-10">
          <div>
            <p className="text-[10px] uppercase tracking-[.25em] text-white/35">Prestige × BeerBirds</p>
            <h1 className="mt-1 font-display text-xl font-bold capitalize">
              {navItems.find((n) => n.id === tab)?.label ?? tab}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Mobile nav */}
            <div className="flex gap-1 lg:hidden">
              {navItems.slice(0, 4).map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`rounded-xl p-2 text-xs ${tab === id ? "bg-[#c1ff1a] text-black" : "text-white/50 hover:bg-white/10 hover:text-white"}`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <button
              onClick={() => void loadData(true)}
              className="rounded-xl p-2 text-white/40 hover:bg-white/8 hover:text-white"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        <div className="p-5 sm:p-10">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-white/30" />
            </div>
          ) : (
            <>
              {tab === "overview" && stats && (
                <OverviewTab
                  stats={stats}
                  recentPending={orders
                    .filter((o) => o.status === "pending" || o.status === "processing")
                    .slice(0, 8)}
                  onView={(o) => setSelectedOrderId(o.id)}
                  onTabChange={setTab}
                />
              )}
              {(tab === "pending" || tab === "confirmed" || tab === "sent") && (
                <OrdersTab
                  tab={tab}
                  orders={filteredOrders}
                  search={search}
                  onSearch={setSearch}
                  onView={(o) => setSelectedOrderId(o.id)}
                />
              )}
              {tab === "attendees" && (
                <AttendeesTab
                  orders={orders}
                  search={search}
                  onSearch={setSearch}
                  onView={(o) => setSelectedOrderId(o.id)}
                />
              )}
              {tab === "finances" && stats && <FinancesTab stats={stats} orders={orders} />}
            </>
          )}
        </div>
      </main>

      {/* Order modal */}
      {selectedOrderId && (
        <OrderModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onRefresh={() => void loadData(true)}
        />
      )}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  stats,
  recentPending,
  onView,
  onTabChange,
}: {
  stats: PrestigeStats;
  recentPending: Order[];
  onView: (o: Order) => void;
  onTabChange: (t: Tab) => void;
}) {
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Tickets Sold" value={stats.totalTicketsSold} icon={TicketIcon} />
        <StatCard
          label="Confirmed Revenue"
          value={formatKes(stats.totalRevenue)}
          sub="Confirmed payments only"
          accent="text-[#c1ff1a]"
          icon={BanknoteIcon}
        />
        <StatCard
          label="Pending Orders"
          value={stats.pendingOrders}
          sub="Awaiting verification"
          accent={stats.pendingOrders > 0 ? "text-amber-400" : undefined}
          icon={Clock}
        />
        <StatCard label="Confirmed" value={stats.confirmedOrders} icon={BadgeCheck} />
        <StatCard label="Tickets Sent" value={stats.sentOrders} icon={Send} />
        <StatCard label="Not Found" value={stats.notFoundOrders} icon={AlertCircle} />
      </div>

      {recentPending.length > 0 && (
        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-white">
              Pending Verification
              <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400">
                {recentPending.length}
              </span>
            </h2>
            <button
              onClick={() => onTabChange("pending")}
              className="text-sm text-white/45 hover:text-white"
            >
              View all →
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/8">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/8 text-xs uppercase tracking-wider text-white/35">
                <tr>
                  <th className="p-4">Order</th>
                  <th className="p-4">Customer</th>
                  <th className="hidden p-4 md:table-cell">Ticket</th>
                  <th className="hidden p-4 lg:table-cell">Amount</th>
                  <th className="p-4">Status</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody>
                {recentPending.map((o) => (
                  <OrderRow key={o.id} order={o} onView={onView} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recentPending.length === 0 && (
        <div className="mt-10 flex flex-col items-center justify-center rounded-3xl border border-white/8 bg-white/3 py-16 text-center">
          <Inbox className="h-10 w-10 text-white/20" />
          <p className="mt-4 font-display text-lg font-bold text-white">No pending orders</p>
          <p className="mt-2 text-sm text-white/40">All orders have been verified.</p>
        </div>
      )}
    </div>
  );
}

// ── Orders tab ────────────────────────────────────────────────────────────────

function OrdersTab({
  tab,
  orders,
  search,
  onSearch,
  onView,
}: {
  tab: Tab;
  orders: Order[];
  search: string;
  onSearch: (v: string) => void;
  onView: (o: Order) => void;
}) {
  const labels: Record<string, string> = {
    pending: "Awaiting M-Pesa verification",
    confirmed: "Payment confirmed — ready to send",
    sent: "Tickets delivered",
  };

  return (
    <div>
      <p className="mb-5 text-sm text-white/45">{labels[tab]}</p>
      <Input
        className="mb-5 border-white/15 bg-white/5 text-white placeholder:text-white/30 focus-visible:border-[#c1ff1a]"
        placeholder="Search by name, phone, email, order # or transaction code…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-white/8 bg-white/3 py-16 text-center">
          <FileText className="h-10 w-10 text-white/20" />
          <p className="mt-4 font-display text-lg font-bold text-white">No orders here</p>
          <p className="mt-2 text-sm text-white/40">
            {search ? "No orders match your search." : `No ${tab} orders yet.`}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/8">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/8 text-xs uppercase tracking-wider text-white/35">
              <tr>
                <th className="p-4">Order</th>
                <th className="p-4">Customer</th>
                <th className="hidden p-4 md:table-cell">Ticket</th>
                <th className="hidden p-4 lg:table-cell">Amount</th>
                <th className="p-4">Status</th>
                <th className="hidden p-4 lg:table-cell">Ticket</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <OrderRow key={o.id} order={o} onView={onView} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Attendees tab ─────────────────────────────────────────────────────────────

function AttendeesTab({
  orders,
  search,
  onSearch,
  onView,
}: {
  orders: Order[];
  search: string;
  onSearch: (v: string) => void;
  onView: (o: Order) => void;
}) {
  const q = search.toLowerCase();
  const filtered = orders.filter(
    (o) =>
      !q ||
      o.purchaser_name.toLowerCase().includes(q) ||
      o.purchaser_phone.includes(q) ||
      o.purchaser_email.toLowerCase().includes(q) ||
      o.order_number.toLowerCase().includes(q),
  );

  return (
    <div>
      <Input
        className="mb-5 border-white/15 bg-white/5 text-white placeholder:text-white/30 focus-visible:border-[#c1ff1a]"
        placeholder="Search by name, phone, email or order number…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <div className="overflow-hidden rounded-2xl border border-white/8">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/8 text-xs uppercase tracking-wider text-white/35">
            <tr>
              <th className="p-4">Attendee</th>
              <th className="p-4">Contact</th>
              <th className="hidden p-4 md:table-cell">Order</th>
              <th className="p-4">Payment</th>
              <th className="p-4">Ticket</th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-b border-white/8 hover:bg-white/5">
                <td className="p-4 font-semibold text-white">{o.purchaser_name}</td>
                <td className="p-4 text-white/60">
                  <p>{o.purchaser_phone}</p>
                  <p className="text-xs">{o.purchaser_email}</p>
                </td>
                <td className="hidden p-4 font-mono text-xs text-[#c1ff1a] md:table-cell">
                  {o.order_number}
                </td>
                <td className="p-4">
                  <StatusBadge status={o.status} />
                </td>
                <td className="p-4">
                  <FulfillmentBadge status={o.fulfillment_status} />
                </td>
                <td className="p-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onView(o)}
                    className="text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Finances tab ──────────────────────────────────────────────────────────────

function FinancesTab({ stats, orders }: { stats: PrestigeStats; orders: Order[] }) {
  const pendingRevenue = orders
    .filter((o) => o.status === "pending" || o.status === "processing")
    .reduce((s, o) => s + o.amount_kes, 0);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Confirmed Revenue"
          value={formatKes(stats.totalRevenue)}
          sub="Confirmed payments only"
          accent="text-[#c1ff1a]"
          icon={BanknoteIcon}
        />
        <StatCard
          label="Pending Revenue"
          value={formatKes(pendingRevenue)}
          sub="Not yet verified"
          accent="text-amber-400"
          icon={Clock}
        />
      </div>

      {stats.ticketsByType.length > 0 && (
        <div className="rounded-2xl border border-white/8 overflow-hidden">
          <div className="border-b border-white/8 px-6 py-4">
            <p className="font-display font-bold text-white">Revenue by Ticket Type</p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/8 text-xs uppercase tracking-wider text-white/35">
              <tr>
                <th className="p-4">Ticket Type</th>
                <th className="p-4">Sold</th>
                <th className="p-4">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {stats.ticketsByType.map((t) => (
                <tr key={t.name} className="border-b border-white/5">
                  <td className="p-4 font-semibold text-white">{t.name}</td>
                  <td className="p-4 text-white/70">{t.quantity}</td>
                  <td className="p-4 font-semibold text-[#c1ff1a]">{formatKes(t.revenue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/15">
                <td className="p-4 font-bold text-white">Total</td>
                <td className="p-4 font-bold text-white">{stats.totalTicketsSold}</td>
                <td className="p-4 font-bold text-[#c1ff1a]">{formatKes(stats.totalRevenue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
          onClick={() => {
            const csv = [
              ["Order", "Customer", "Phone", "Email", "Ticket", "Quantity", "Amount", "Status", "Ticket Status", "Date"].join(","),
              ...orders.map((o) => [
                o.order_number,
                `"${o.purchaser_name}"`,
                o.purchaser_phone,
                o.purchaser_email,
                `"${o.items?.[0]?.ticket_type_name ?? "Ticket"}"`,
                String(o.items?.reduce((s, i) => s + i.quantity, 0) ?? 1),
                String(o.amount_kes),
                o.status,
                o.fulfillment_status,
                new Date(o.created_at).toLocaleDateString("en-KE"),
              ].join(","))
            ].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `hili-orders-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="mr-2 h-4 w-4" /> Download CSV
        </Button>
      </div>
    </div>
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
    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) { setError(result.error.message); return; }

      const role = await getCurrentUserRole();
      if (!role) {
        await supabase.auth.signOut();
        setError(
          `Access denied. "${email}" is not in the Prestige access list.\n\nAsk Hili to add your email to PRESTIGE_EMAILS in the server environment variables.`,
        );
        return;
      }
      if (!isPrestigeRole(role)) {
        await supabase.auth.signOut();
        setError(`Your account role (${role}) cannot access this dashboard.`);
        return;
      }
      onLogin();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] px-5">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-md rounded-3xl bg-[#111] p-8 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#c1ff1a]">
            <span className="font-display text-sm font-bold text-black">P</span>
          </div>
          <div>
            <strong className="font-display text-white">Prestige Admin</strong>
            <p className="text-[10px] text-white/35">Operations Dashboard</p>
          </div>
        </div>
        <h1 className="mt-10 font-display text-3xl font-bold text-white">Sign in</h1>
        <p className="mt-2 text-sm text-white/45">
          Prestige/BeerBirds operations access only.
        </p>
        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-red-900/30 p-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <pre className="whitespace-pre-wrap font-sans">{error}</pre>
          </div>
        )}
        <label className="mt-7 block text-sm font-semibold text-white">
          Email
          <Input
            className="mt-2 border-white/15 bg-white/5 text-white placeholder:text-white/30"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="mt-4 block text-sm font-semibold text-white">
          Password
          <Input
            className="mt-2 border-white/15 bg-white/5 text-white placeholder:text-white/30"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <Button
          className="mt-6 h-12 w-full bg-[#c1ff1a] text-black hover:bg-[#b0ee10]"
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function PrestigePage() {
  const [session, setSession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const role = await getCurrentUserRole();
        setSession(isPrestigeRole(role));
      }
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b]">
        <Loader2 className="h-8 w-8 animate-spin text-white/30" />
      </div>
    );
  }

  if (!session) {
    return <Login onLogin={() => setSession(true)} />;
  }

  return (
    <Dashboard
      onLogout={async () => {
        await supabase?.auth.signOut();
        setSession(false);
      }}
    />
  );
}
