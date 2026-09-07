import type { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  getAllOrders,
  getOrderById,
  getOrdersByStatus,
  getPrestigeStats,
  confirmManualPayment,
  markOrderNotFound,
  markTicketSent,
  getOrderTickets,
  getOrderContact,
  getNotificationStatus,
  markNotificationSent,
  markNotificationFailed,
  getPaymentConfigBySlug,
  upsertPaymentConfig,
} from "../services/order";
import { sendTicketEmail } from "../services/tickets";
import type {
  ConfirmPaymentRequest,
  MarkNotFoundRequest,
  SendTicketRequest,
  UpsertPaymentConfigRequest,
} from "@shared/api";

// ── Auth helper ────────────────────────────────────────────────────────────
// Validates the Supabase JWT from the Authorization header and returns the
// user + their role in the organization. All prestige routes require this.

async function getSessionUser(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  // Fetch their role in the organization
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", data.user.id)
    .single();

  return { user: data.user, role: member?.role as string | undefined };
}

const PRESTIGE_ROLES = ["super_admin", "hili_admin", "event_manager", "prestige_admin", "prestige_staff"];
const PRESTIGE_ADMIN_ROLES = ["super_admin", "hili_admin", "prestige_admin"];
const HILI_ROLES = ["super_admin", "hili_admin", "event_manager"];

function canAccessPrestige(role?: string) {
  return role ? PRESTIGE_ROLES.includes(role) : false;
}
function canAdminPrestige(role?: string) {
  return role ? PRESTIGE_ADMIN_ROLES.includes(role) : false;
}
function isHiliAdmin(role?: string) {
  return role ? HILI_ROLES.includes(role) : false;
}

// ── Stats ──────────────────────────────────────────────────────────────────

export const handlePrestigeStats: RequestHandler = async (req, res) => {
  const session = await getSessionUser(req.headers.authorization);
  if (!session || !canAccessPrestige(session.role)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const stats = await getPrestigeStats();
    res.json(stats);
  } catch (err) {
    console.error("Prestige stats error", err);
    res.status(500).json({ error: "Could not load stats" });
  }
};

// ── List orders ────────────────────────────────────────────────────────────

export const handleListOrders: RequestHandler = async (req, res) => {
  const session = await getSessionUser(req.headers.authorization);
  if (!session || !canAccessPrestige(session.role)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { status, fulfillment } = req.query as Record<string, string>;
    let orders;
    if (status === "pending") {
      orders = await getOrdersByStatus(["pending", "processing"]);
    } else if (status === "confirmed") {
      orders = await getOrdersByStatus(["confirmed", "paid"], fulfillment);
    } else if (status === "sent") {
      orders = await getOrdersByStatus(["confirmed", "paid"], "sent");
    } else {
      orders = await getAllOrders();
    }
    res.json({ orders });
  } catch (err) {
    console.error("List orders error", err);
    res.status(500).json({ error: "Could not load orders" });
  }
};

// ── Get single order ───────────────────────────────────────────────────────

export const handleGetOrder: RequestHandler = async (req, res) => {
  const session = await getSessionUser(req.headers.authorization);
  if (!session || !canAccessPrestige(session.role)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const order = await getOrderById(req.params.orderId);
    res.json({ order });
  } catch (err) {
    console.error("Get order error", err);
    res.status(404).json({ error: "Order not found" });
  }
};

// ── Confirm payment ────────────────────────────────────────────────────────

export const handleConfirmPayment: RequestHandler = async (req, res) => {
  const session = await getSessionUser(req.headers.authorization);
  if (!session || !canAccessPrestige(session.role)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { orderId } = req.body as ConfirmPaymentRequest;
  if (!orderId) { res.status(400).json({ error: "orderId is required" }); return; }
  try {
    const result = await confirmManualPayment(orderId, session.user.id);
    if (result.already_confirmed) {
      res.json({ success: true, message: "Payment was already confirmed" });
      return;
    }
    res.json({ success: true, message: "Payment confirmed and tickets generated" });
  } catch (err) {
    console.error("Confirm payment error", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not confirm payment" });
  }
};

// ── Mark payment not found ─────────────────────────────────────────────────

export const handleMarkNotFound: RequestHandler = async (req, res) => {
  const session = await getSessionUser(req.headers.authorization);
  if (!session || !canAccessPrestige(session.role)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { orderId, note } = req.body as MarkNotFoundRequest;
  if (!orderId) { res.status(400).json({ error: "orderId is required" }); return; }
  try {
    await markOrderNotFound(orderId, session.user.id, note);
    res.json({ success: true, message: "Order marked as payment not found" });
  } catch (err) {
    console.error("Mark not found error", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not update order" });
  }
};

// ── Send ticket ────────────────────────────────────────────────────────────

export const handleSendTicket: RequestHandler = async (req, res) => {
  const session = await getSessionUser(req.headers.authorization);
  if (!session || !canAccessPrestige(session.role)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { orderId } = req.body as SendTicketRequest;
  if (!orderId) { res.status(400).json({ error: "orderId is required" }); return; }

  try {
    const notifStatus = await getNotificationStatus(orderId);
    if (notifStatus === "sent") {
      // Already sent — still mark as sent in orders table in case it wasn't updated
      await markTicketSent(orderId, session.user.id).catch(() => undefined);
      res.json({ success: true, message: "Ticket was already sent" });
      return;
    }

    const [contact, tickets] = await Promise.all([
      getOrderContact(orderId),
      getOrderTickets(orderId),
    ]);

    if (!tickets.length) {
      res.status(400).json({ error: "No tickets found for this order. Confirm payment first." });
      return;
    }

    for (const ticket of tickets) {
      const event = Array.isArray(ticket.event) ? ticket.event[0] : ticket.event;
      const tier = Array.isArray(ticket.ticket_type) ? ticket.ticket_type[0] : ticket.ticket_type;
      await sendTicketEmail(contact.purchaser_email, {
        ticketNumber: ticket.ticket_number,
        attendeeName: ticket.attendee_name,
        eventName: event?.name || "Hili Event",
        eventDate: event?.event_date || "Date to be confirmed",
        ticketTier: tier?.name || "Ticket",
      });
    }

    await markNotificationSent(orderId, `manual-${Date.now()}`);
    await markTicketSent(orderId, session.user.id);

    res.json({ success: true, message: `Ticket${tickets.length > 1 ? "s" : ""} sent successfully` });
  } catch (err) {
    await markNotificationFailed(orderId, err instanceof Error ? err.message : "Send failed").catch(() => undefined);
    console.error("Send ticket error", err);
    res.status(500).json({ error: "Could not send ticket. Please try again." });
  }
};

// ── Payment config (read — public, used by checkout) ──────────────────────

export const handleGetPaymentConfig: RequestHandler = async (req, res) => {
  try {
    const config = await getPaymentConfigBySlug(req.params.eventSlug);
    res.json({ config });
  } catch (err) {
    console.error("Get payment config error", err);
    res.status(500).json({ error: "Could not load payment config" });
  }
};

// ── Payment config (write — Hili admin only) ──────────────────────────────

export const handleUpsertPaymentConfig: RequestHandler = async (req, res) => {
  const session = await getSessionUser(req.headers.authorization);
  if (!session || !isHiliAdmin(session.role)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { eventId, paymentType, number, accountNumber, instructions } =
    req.body as UpsertPaymentConfigRequest;
  if (!eventId || !paymentType || !number) {
    res.status(400).json({ error: "eventId, paymentType, and number are required" });
    return;
  }
  try {
    await upsertPaymentConfig(eventId, { paymentType, number, accountNumber, instructions });
    res.json({ success: true });
  } catch (err) {
    console.error("Upsert payment config error", err);
    res.status(500).json({ error: "Could not save payment config" });
  }
};

// ── Manual order creation (public — called from checkout) ──────────────────

export const handleCreateManualOrder: RequestHandler = async (req, res) => {
  const {
    eventSlug,
    ticketTypeId,
    ticketTypeName,
    purchaserName,
    purchaserEmail,
    purchaserPhone,
    mpesaName,
    mpesaTransactionCode,
    attendeeNames,
    amountKes,
  } = req.body as Record<string, unknown>;

  // Validate required fields
  if (
    typeof purchaserName !== "string" || !purchaserName.trim() ||
    typeof purchaserEmail !== "string" || !/^\S+@\S+\.\S+$/.test(purchaserEmail) ||
    typeof purchaserPhone !== "string" || !purchaserPhone.trim() ||
    typeof eventSlug !== "string" || !eventSlug.trim() ||
    !Array.isArray(attendeeNames) || attendeeNames.length < 1 ||
    typeof amountKes !== "number" || amountKes <= 0
  ) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { createPendingOrder, sendNewOrderInternalNotification } = await import("../services/order");

    const order = await createPendingOrder({
      eventSlug: eventSlug as string,
      ticketTypeId: typeof ticketTypeId === "string" ? ticketTypeId : undefined,
      ticketTypeName: typeof ticketTypeName === "string" ? ticketTypeName : undefined,
      purchaserName: (purchaserName as string).trim(),
      purchaserEmail: (purchaserEmail as string).trim().toLowerCase(),
      purchaserPhone: (purchaserPhone as string).trim(),
      mpesaName: typeof mpesaName === "string" ? mpesaName.trim() || undefined : undefined,
      mpesaTransactionCode: typeof mpesaTransactionCode === "string" ? mpesaTransactionCode.trim().toUpperCase() || undefined : undefined,
      attendeeNames: (attendeeNames as unknown[]).filter((n): n is string => typeof n === "string").map((n) => n.trim()),
      amountKes: amountKes as number,
      paymentProvider: "manual",
    });

    // Fire-and-forget internal ops notification
    const ticketTypeFallback = typeof ticketTypeName === "string" ? ticketTypeName : "Ticket";
    void sendNewOrderInternalNotification({
      orderNumber: order.order_number,
      purchaserName: (purchaserName as string).trim(),
      purchaserPhone: (purchaserPhone as string).trim(),
      purchaserEmail: (purchaserEmail as string).trim().toLowerCase(),
      ticketTypeName: ticketTypeFallback,
      quantity: (attendeeNames as string[]).length,
      amountKes: amountKes as number,
      mpesaName: typeof mpesaName === "string" ? mpesaName : null,
      mpesaTransactionCode: typeof mpesaTransactionCode === "string" ? mpesaTransactionCode.toUpperCase() : null,
    });

    res.status(201).json({ orderId: order.id, orderNumber: order.order_number });
  } catch (err) {
    console.error("Create manual order error", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not create order" });
  }
};
