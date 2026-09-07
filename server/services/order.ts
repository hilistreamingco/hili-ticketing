import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Order, PaymentConfig } from "@shared/api";

let adminClient: SupabaseClient | null = null;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured");
  adminClient ||= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type PendingOrderInput = {
  eventSlug: string;
  ticketTypeId?: string;
  ticketTypeName?: string;
  purchaserName: string;
  purchaserEmail: string;
  purchaserPhone: string;
  attendeeNames: string[];
  amountKes: number;
  // Manual payment fields
  mpesaName?: string;
  mpesaTransactionCode?: string;
  paymentProvider?: "manual" | "daraja" | "pesapal";
};

// ── Order creation ─────────────────────────────────────────────────────────

export async function createPendingOrder(input: PendingOrderInput) {
  const supabase = getAdminClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name")
    .eq("slug", input.eventSlug)
    .single();
  if (eventError || !event) throw new Error("Event was not found");

  const ticketQuery = supabase
    .from("ticket_types")
    .select("id,name,price_kes,quantity_total,quantity_sold")
    .eq("event_id", event.id)
    .eq("is_active", true);

  const { data: ticketTypes, error: ticketError } = input.ticketTypeId
    ? await ticketQuery.eq("id", input.ticketTypeId)
    : await ticketQuery.eq("name", input.ticketTypeName || "");

  const ticketType = ticketTypes?.[0];
  if (ticketError || !ticketType) throw new Error("Ticket type was not found");
  if (input.attendeeNames.length < 1 || input.attendeeNames.length > 20) throw new Error("Invalid attendee list");
  if (ticketType.quantity_total - ticketType.quantity_sold < input.attendeeNames.length) throw new Error("Not enough tickets remain");
  if (input.amountKes !== ticketType.price_kes * input.attendeeNames.length) throw new Error("Order total does not match ticket price");

  // Generate human-readable order number: HILI-YYYY-NNNNN
  const { data: seqData } = await supabase
    .from("orders")
    .select("order_number")
    .like("order_number", `HILI-${new Date().getFullYear()}-%`)
    .order("created_at", { ascending: false })
    .limit(1);

  let seq = 1;
  if (seqData && seqData.length > 0) {
    const last = seqData[0].order_number as string;
    const parts = last.split("-");
    if (parts.length === 3) seq = (parseInt(parts[2], 10) || 0) + 1;
  }
  const orderNumber = `HILI-${new Date().getFullYear()}-${String(seq).padStart(5, "0")}`;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      event_id: event.id,
      purchaser_name: input.purchaserName,
      purchaser_email: input.purchaserEmail,
      purchaser_phone: input.purchaserPhone,
      amount_kes: input.amountKes,
      status: "pending",
      fulfillment_status: "not_sent",
      payment_provider: input.paymentProvider ?? "manual",
      mpesa_name: input.mpesaName ?? null,
      mpesa_transaction_code: input.mpesaTransactionCode ?? null,
    })
    .select("id,order_number")
    .single();

  if (orderError || !order) throw orderError || new Error("Could not create order");

  const { error: itemError } = await supabase.from("order_items").insert({
    order_id: order.id,
    ticket_type_id: ticketType.id,
    quantity: input.attendeeNames.length,
    unit_price_kes: ticketType.price_kes,
    attendee_names: input.attendeeNames,
  });

  if (itemError) {
    await supabase.from("orders").delete().eq("id", order.id);
    throw itemError;
  }

  // Audit log
  await supabase.from("audit_log").insert({
    order_id: order.id,
    action: "order_created",
    metadata: {
      order_number: orderNumber,
      event: event.name,
      ticket_type: ticketType.name,
      amount_kes: input.amountKes,
      purchaser: input.purchaserName,
    },
  });

  return { ...order, eventId: event.id, eventName: event.name as string };
}

// ── Daraja-specific helpers (kept for backward compat) ─────────────────────

export async function markOrderFailed(orderId: string) {
  await getAdminClient()
    .from("orders")
    .update({ status: "failed" })
    .eq("id", orderId)
    .in("status", ["pending", "processing"]);
}

export async function attachCheckoutRequest(orderId: string, checkoutRequestId: string) {
  const { error } = await getAdminClient()
    .from("orders")
    .update({ mpesa_checkout_request_id: checkoutRequestId, status: "processing" })
    .eq("id", orderId);
  if (error) throw error;
}

export async function finalizePaidOrder(checkoutRequestId: string, receipt?: string) {
  const { data, error } = await getAdminClient().rpc("finalize_paid_order", {
    target_checkout_id: checkoutRequestId,
    receipt: receipt || null,
  });
  if (error) throw error;
  return data as { order_id: string; created: number; already_finalized: boolean };
}

// ── Manual payment confirmation ────────────────────────────────────────────

export async function confirmManualPayment(orderId: string, actorId: string) {
  const { data, error } = await getAdminClient().rpc("confirm_manual_payment", {
    target_order_id: orderId,
    actor_id: actorId,
  });
  if (error) throw error;
  return data as { order_id: string; created: number; already_confirmed: boolean };
}

export async function markOrderNotFound(orderId: string, actorId: string, note?: string) {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "not_found",
      payment_note: note ?? "Payment not found on M-Pesa account",
    })
    .eq("id", orderId)
    .in("status", ["pending", "processing"]);
  if (error) throw error;

  await supabase.from("audit_log").insert({
    order_id: orderId,
    action: "payment_not_found",
    actor_id: actorId,
    metadata: { note },
  });
}

export async function markTicketSent(orderId: string, actorId: string) {
  const { error } = await getAdminClient().rpc("mark_ticket_sent", {
    target_order_id: orderId,
    actor_id: actorId,
  });
  if (error) throw error;
}

// ── Order reads ────────────────────────────────────────────────────────────

export async function getOrderById(orderId: string): Promise<Order> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, order_number, event_id, purchaser_name, purchaser_email, purchaser_phone,
      amount_kes, status, fulfillment_status, payment_provider,
      mpesa_name, mpesa_transaction_code, mpesa_receipt_number, payment_note,
      confirmed_at, confirmed_by, sent_at, sent_by,
      created_at, paid_at,
      events!inner(name),
      order_items(id, ticket_type_id, quantity, unit_price_kes, attendee_names, ticket_types(name))
    `)
    .eq("id", orderId)
    .single();

  if (error || !data) throw error || new Error("Order not found");
  return shapeOrder(data);
}

export async function getOrdersByStatus(
  status: string | string[],
  fulfillmentStatus?: string,
): Promise<Order[]> {
  const supabase = getAdminClient();
  let query = supabase
    .from("orders")
    .select(`
      id, order_number, event_id, purchaser_name, purchaser_email, purchaser_phone,
      amount_kes, status, fulfillment_status, payment_provider,
      mpesa_name, mpesa_transaction_code, mpesa_receipt_number, payment_note,
      confirmed_at, confirmed_by, sent_at, sent_by,
      created_at, paid_at,
      events!inner(name),
      order_items(id, ticket_type_id, quantity, unit_price_kes, attendee_names, ticket_types(name))
    `)
    .order("created_at", { ascending: false });

  if (Array.isArray(status)) {
    query = query.in("status", status);
  } else {
    query = query.eq("status", status);
  }

  if (fulfillmentStatus) {
    query = query.eq("fulfillment_status", fulfillmentStatus);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(shapeOrder);
}

export async function getAllOrders(): Promise<Order[]> {
  const { data, error } = await getAdminClient()
    .from("orders")
    .select(`
      id, order_number, event_id, purchaser_name, purchaser_email, purchaser_phone,
      amount_kes, status, fulfillment_status, payment_provider,
      mpesa_name, mpesa_transaction_code, mpesa_receipt_number, payment_note,
      confirmed_at, confirmed_by, sent_at, sent_by,
      created_at, paid_at,
      events!inner(name),
      order_items(id, ticket_type_id, quantity, unit_price_kes, attendee_names, ticket_types(name))
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map(shapeOrder);
}

export async function getPrestigeStats() {
  const supabase = getAdminClient();

  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      status, fulfillment_status, amount_kes,
      order_items(quantity, unit_price_kes, ticket_types(name))
    `);

  if (error) throw error;

  let totalTicketsSold = 0;
  let totalRevenue = 0;
  let pendingOrders = 0;
  let confirmedOrders = 0;
  let sentOrders = 0;
  let notFoundOrders = 0;
  const typeMap = new Map<string, { quantity: number; revenue: number }>();

  for (const order of orders || []) {
    const st = order.status as string;
    if (st === "pending" || st === "processing") pendingOrders++;
    if (st === "confirmed" || st === "paid") {
      confirmedOrders++;
      totalRevenue += order.amount_kes as number;
      for (const item of (order.order_items || []) as Array<{
        quantity: number;
        unit_price_kes: number;
        ticket_types: { name: string } | null;
      }>) {
        const name = item.ticket_types?.name ?? "Unknown";
        const existing = typeMap.get(name) ?? { quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue += item.quantity * item.unit_price_kes;
        typeMap.set(name, existing);
        totalTicketsSold += item.quantity;
      }
    }
    if ((order.fulfillment_status as string) === "sent") sentOrders++;
    if (st === "not_found") notFoundOrders++;
  }

  return {
    totalTicketsSold,
    totalRevenue,
    pendingOrders,
    confirmedOrders,
    sentOrders,
    notFoundOrders,
    ticketsByType: Array.from(typeMap.entries()).map(([name, v]) => ({ name, ...v })),
  };
}

// ── Payment config ─────────────────────────────────────────────────────────

export async function getPaymentConfig(eventId: string): Promise<PaymentConfig | null> {
  const { data, error } = await getAdminClient()
    .from("payment_config")
    .select("*")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as PaymentConfig | null;
}

export async function upsertPaymentConfig(
  eventId: string,
  patch: {
    paymentType: "till" | "paybill";
    number: string;
    accountNumber?: string;
    instructions?: string;
  },
) {
  const supabase = getAdminClient();
  const existing = await getPaymentConfig(eventId);

  if (existing) {
    const { error } = await supabase
      .from("payment_config")
      .update({
        payment_type: patch.paymentType,
        number: patch.number,
        account_number: patch.accountNumber ?? null,
        instructions: patch.instructions ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("payment_config").insert({
      event_id: eventId,
      provider: "manual",
      payment_method: "mpesa",
      payment_type: patch.paymentType,
      number: patch.number,
      account_number: patch.accountNumber ?? null,
      instructions: patch.instructions ?? null,
      is_active: true,
    });
    if (error) throw error;
  }
}

export async function getPaymentConfigBySlug(eventSlug: string): Promise<PaymentConfig | null> {
  const supabase = getAdminClient();
  const { data: event } = await supabase.from("events").select("id").eq("slug", eventSlug).single();
  if (!event) return null;
  return getPaymentConfig(event.id);
}

// ── Notifications ──────────────────────────────────────────────────────────

export async function getOrderContact(orderId: string) {
  const { data, error } = await getAdminClient()
    .from("orders")
    .select("purchaser_email,order_number,purchaser_name")
    .eq("id", orderId)
    .single();
  if (error || !data) throw error || new Error("Order was not found");
  return data;
}

export async function getOrderTickets(orderId: string) {
  const { data, error } = await getAdminClient()
    .from("tickets")
    .select("ticket_number,attendee_name,event:events(name,event_date),ticket_type:ticket_types(name)")
    .eq("order_id", orderId)
    .order("created_at");
  if (error) throw error;
  return data || [];
}

export async function getNotificationStatus(orderId: string) {
  const { data, error } = await getAdminClient()
    .from("notifications")
    .select("status")
    .eq("order_id", orderId)
    .eq("channel", "email")
    .eq("template", "ticket_confirmation")
    .maybeSingle();
  if (error) throw error;
  return data?.status || null;
}

export async function markNotificationSent(orderId: string, messageId: string) {
  const { error } = await getAdminClient()
    .from("notifications")
    .update({ status: "sent", sent_at: new Date().toISOString(), payload: { message_id: messageId } })
    .eq("order_id", orderId)
    .eq("channel", "email")
    .eq("template", "ticket_confirmation")
    .eq("status", "queued");
  if (error) throw error;
}

export async function markNotificationFailed(orderId: string, message: string) {
  await getAdminClient()
    .from("notifications")
    .update({ status: "failed", attempts: 1, last_error: message })
    .eq("order_id", orderId)
    .eq("channel", "email")
    .eq("template", "ticket_confirmation")
    .eq("status", "queued");
}

// ── Internal notification email (new order alert to ops team) ──────────────

export async function sendNewOrderInternalNotification(order: {
  orderNumber: string;
  purchaserName: string;
  purchaserPhone: string;
  purchaserEmail: string;
  ticketTypeName: string;
  quantity: number;
  amountKes: number;
  mpesaName?: string | null;
  mpesaTransactionCode?: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;

  // Send to all configured recipients — always includes both Hili and Prestige
  const toAddresses = [
    "hilistreaming.co@gmail.com",
    "social@prestigeplaza.co.ke",
    // Any additional address from env (e.g. for staging overrides)
    ...(process.env.OPS_NOTIFICATION_EMAIL
      ? process.env.OPS_NOTIFICATION_EMAIL.split(",").map((e) => e.trim())
      : []),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i); // deduplicate

  if (!apiKey || !from) return; // silently skip if email not configured

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f4f4ef;padding:24px;color:#0b0b0b">
      <div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #deded6">
        <p style="font-size:11px;letter-spacing:2px;color:#748000;font-weight:bold;margin:0 0 12px">HILI × PRESTIGE — NEW ORDER</p>
        <h1 style="font-size:22px;margin:0 0 6px">New Ticket Order Received</h1>
        <p style="font-size:14px;color:#555;margin:0 0 24px">Payment verification required.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#777;width:40%">Order</td><td style="padding:8px 0;font-weight:bold;font-family:monospace">${escapeHtml(order.orderNumber)}</td></tr>
          <tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#777">Customer</td><td style="padding:8px 0">${escapeHtml(order.purchaserName)}</td></tr>
          <tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#777">Phone</td><td style="padding:8px 0">${escapeHtml(order.purchaserPhone)}</td></tr>
          <tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#777">Email</td><td style="padding:8px 0">${escapeHtml(order.purchaserEmail)}</td></tr>
          <tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#777">Ticket</td><td style="padding:8px 0">${escapeHtml(order.ticketTypeName)}</td></tr>
          <tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#777">Quantity</td><td style="padding:8px 0">${order.quantity}</td></tr>
          <tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#777">Amount</td><td style="padding:8px 0;font-weight:bold">KES ${order.amountKes.toLocaleString()}</td></tr>
          <tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#777">M-Pesa Name</td><td style="padding:8px 0">${escapeHtml(order.mpesaName || "—")}</td></tr>
          <tr><td style="padding:8px 0;color:#777">Transaction Code</td><td style="padding:8px 0;font-family:monospace;font-weight:bold">${escapeHtml(order.mpesaTransactionCode || "—")}</td></tr>
        </table>
        <div style="margin-top:24px;padding:14px;background:#fff8e1;border-radius:8px;border-left:4px solid #f59e0b;font-size:13px">
          <strong>Payment Status: PENDING VERIFICATION</strong><br/>
          Please log into the Prestige dashboard to verify and confirm this payment.
        </div>
      </div>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: toAddresses,
      subject: `New Ticket Order — ${order.orderNumber} — Payment Verification Required`,
      html,
    }),
  }).catch((err) => console.error("Internal notification email failed:", err));
}

// ── Shape helper ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shapeOrder(raw: any): Order {
  const event = Array.isArray(raw.events) ? raw.events[0] : raw.events;
  return {
    id: raw.id,
    order_number: raw.order_number,
    event_id: raw.event_id,
    event_name: event?.name ?? undefined,
    purchaser_name: raw.purchaser_name,
    purchaser_email: raw.purchaser_email,
    purchaser_phone: raw.purchaser_phone,
    amount_kes: raw.amount_kes,
    status: raw.status,
    fulfillment_status: raw.fulfillment_status ?? "not_sent",
    payment_provider: raw.payment_provider ?? "manual",
    mpesa_name: raw.mpesa_name ?? null,
    mpesa_transaction_code: raw.mpesa_transaction_code ?? null,
    mpesa_receipt_number: raw.mpesa_receipt_number ?? null,
    payment_note: raw.payment_note ?? null,
    confirmed_at: raw.confirmed_at ?? null,
    confirmed_by: raw.confirmed_by ?? null,
    sent_at: raw.sent_at ?? null,
    sent_by: raw.sent_by ?? null,
    created_at: raw.created_at,
    paid_at: raw.paid_at ?? null,
    items: (raw.order_items || []).map((item: {
      id: string;
      ticket_type_id: string;
      ticket_types: { name: string } | Array<{ name: string }> | null;
      quantity: number;
      unit_price_kes: number;
      attendee_names: string[];
    }) => {
      const tt = Array.isArray(item.ticket_types) ? item.ticket_types[0] : item.ticket_types;
      return {
        id: item.id,
        ticket_type_id: item.ticket_type_id,
        ticket_type_name: tt?.name ?? undefined,
        quantity: item.quantity,
        unit_price_kes: item.unit_price_kes,
        attendee_names: item.attendee_names ?? [],
      };
    }),
  };
}

function escapeHtml(value: string) {
  return String(value).replace(/[&<>'"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c] || c,
  );
}
