import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured");
  adminClient ||= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

export type PendingOrderInput = {
  eventSlug: string;
  ticketTypeId?: string;
  ticketTypeName?: string;
  purchaserName: string;
  purchaserEmail: string;
  purchaserPhone: string;
  attendeeNames: string[];
  amountKes: number;
};

export async function createPendingOrder(input: PendingOrderInput) {
  const supabase = getAdminClient();
  const { data: event, error: eventError } = await supabase.from("events").select("id").eq("slug", input.eventSlug).single();
  if (eventError || !event) throw new Error("Event was not found");

  let ticketQuery = supabase.from("ticket_types").select("id,price_kes,quantity_total,quantity_sold").eq("event_id", event.id).eq("is_active", true);
  const { data: ticketTypes, error: ticketError } = input.ticketTypeId
    ? await ticketQuery.eq("id", input.ticketTypeId)
    : await ticketQuery.eq("name", input.ticketTypeName || "");
  const ticketType = ticketTypes?.[0];
  if (ticketError || !ticketType) throw new Error("Ticket type was not found");
  if (input.attendeeNames.length < 1 || input.attendeeNames.length > 20) throw new Error("Invalid attendee list");
  if (ticketType.quantity_total - ticketType.quantity_sold < input.attendeeNames.length) throw new Error("Not enough tickets remain");
  if (input.amountKes !== ticketType.price_kes * input.attendeeNames.length) throw new Error("Order total does not match ticket price");

  const orderNumber = `HILI-${randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: order, error: orderError } = await supabase.from("orders").insert({
    order_number: orderNumber,
    event_id: event.id,
    purchaser_name: input.purchaserName,
    purchaser_email: input.purchaserEmail,
    purchaser_phone: input.purchaserPhone,
    amount_kes: input.amountKes,
    status: "pending",
  }).select("id,order_number").single();
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
  return { ...order, eventId: event.id };
}

export async function markOrderFailed(orderId: string) {
  await getAdminClient().from("orders").update({ status: "failed" }).eq("id", orderId).in("status", ["pending", "processing"]);
}

export async function getOrderContact(orderId: string) {
  const { data, error } = await getAdminClient().from("orders").select("purchaser_email,order_number").eq("id", orderId).single();
  if (error || !data) throw error || new Error("Order was not found");
  return data;
}

export async function attachCheckoutRequest(orderId: string, checkoutRequestId: string) {
  const { error } = await getAdminClient().from("orders").update({ mpesa_checkout_request_id: checkoutRequestId, status: "processing" }).eq("id", orderId);
  if (error) throw error;
}

export async function finalizePaidOrder(checkoutRequestId: string, receipt?: string) {
  const { data, error } = await getAdminClient().rpc("finalize_paid_order", { target_checkout_id: checkoutRequestId, receipt: receipt || null });
  if (error) throw error;
  return data as { order_id: string; created: number; already_finalized: boolean };
}

export async function getOrderTickets(orderId: string) {
  const { data, error } = await getAdminClient().from("tickets").select("ticket_number,attendee_name,event:events(name,event_date),ticket_type:ticket_types(name)").eq("order_id", orderId).order("created_at");
  if (error) throw error;
  return data || [];
}

export async function getNotificationStatus(orderId: string) {
  const { data, error } = await getAdminClient().from("notifications").select("status").eq("order_id", orderId).eq("channel", "email").eq("template", "ticket_confirmation").maybeSingle();
  if (error) throw error;
  return data?.status || null;
}

export async function markNotificationSent(orderId: string, messageId: string) {
  const { error } = await getAdminClient().from("notifications").update({ status: "sent", sent_at: new Date().toISOString(), payload: { message_id: messageId } }).eq("order_id", orderId).eq("channel", "email").eq("template", "ticket_confirmation").eq("status", "queued");
  if (error) throw error;
}

export async function markNotificationFailed(orderId: string, message: string) {
  await getAdminClient().from("notifications").update({ status: "failed", attempts: 1, last_error: message }).eq("order_id", orderId).eq("channel", "email").eq("template", "ticket_confirmation").eq("status", "queued");
}
