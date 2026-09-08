import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { attachCheckoutRequest, createPendingOrder, finalizePaidOrder, getNotificationStatus, getOrderContact, getOrderTickets, markNotificationFailed, markNotificationSent, markOrderFailed } from "../services/order.js";
import { sendTicketEmail } from "../services/tickets.js";

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return digits;
};

const darajaBase = () => process.env.MPESA_ENVIRONMENT === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
const missingConfig = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_PASSKEY", "MPESA_TILL_NUMBER", "MPESA_CALLBACK_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const paymentStatuses = new Map<string, "Pending" | "Paid" | "Failed">();

async function deliverTickets(orderId: string) {
  const status = await getNotificationStatus(orderId);
  if (status === "sent") return;
  try {
    const [contact, tickets] = await Promise.all([getOrderContact(orderId), getOrderTickets(orderId)]);
    for (const ticket of tickets) {
      const event = Array.isArray(ticket.event) ? ticket.event[0] : ticket.event;
      const tier = Array.isArray(ticket.ticket_type) ? ticket.ticket_type[0] : ticket.ticket_type;
      await sendTicketEmail(contact.purchaser_email, { 
        ticketNumber: ticket.ticket_number, 
        attendeeName: ticket.attendee_name, 
        eventName: event?.name || "Hili event", 
        eventDate: event?.event_date || "Date to be confirmed", 
        ticketTier: tier?.name || "Ticket",
        venue: event?.venue,
        ticketId: ticket.id,
      });
    }
    await markNotificationSent(orderId, `tickets-${orderId}`);
  } catch (error) {
    await markNotificationFailed(orderId, error instanceof Error ? error.message : "Ticket email failed");
    throw error;
  }
}

export const handleMpesaStkPush: RequestHandler = async (req, res) => {
  const mockMode = process.env.MPESA_MODE === "mock";
  const requiredConfig = mockMode ? ["SUPABASE_SERVICE_ROLE_KEY"] : missingConfig;
  const absent = requiredConfig.filter((key) => !process.env[key]);
  if (absent.length) { res.status(503).json({ error: mockMode ? "Mock payments require Supabase server credentials" : "M-Pesa is not configured", missing: absent }); return; }
  const body = req.body as Record<string, unknown>;
  const phone = typeof body.phone === "string" ? normalizePhone(body.phone) : "";
  const amount = typeof body.amount === "number" ? body.amount : 0;
  const eventSlug = typeof body.eventSlug === "string" ? body.eventSlug : "";
  const ticketTypeId = typeof body.ticketTypeId === "string" ? body.ticketTypeId : undefined;
  const ticketTypeName = typeof body.ticketTypeName === "string" ? body.ticketTypeName : undefined;
  const purchaserName = typeof body.purchaserName === "string" ? body.purchaserName.trim() : "";
  const purchaserEmail = typeof body.purchaserEmail === "string" ? body.purchaserEmail.trim().toLowerCase() : "";
  const attendeeNames = Array.isArray(body.attendeeNames) ? body.attendeeNames.filter((name): name is string => typeof name === "string").map((name) => name.trim()).filter(Boolean) : [];
  if (!phone || !/^254\d{9}$/.test(phone) || !eventSlug || !purchaserName || !/^\S+@\S+\.\S+$/.test(purchaserEmail) || !Number.isFinite(amount) || amount <= 0 || !attendeeNames.length || attendeeNames.length > 20) {
    res.status(400).json({ error: "Valid purchaser, attendee, phone, email, and amount details are required" }); return;
  }

  let order: { id: string; order_number: string; eventId: string };
  try {
    order = await createPendingOrder({ eventSlug, ticketTypeId, ticketTypeName, purchaserName, purchaserEmail, purchaserPhone: phone, attendeeNames, amountKes: Math.round(amount) });
  } catch (error) {
    console.error("Could not create pending order", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not create order" }); return;
  }

  if (mockMode) {
    const checkoutRequestId = `MOCK-${randomUUID()}`;
    await attachCheckoutRequest(order.id, checkoutRequestId);
    paymentStatuses.set(checkoutRequestId, "Pending");
    setTimeout(() => { void finalizePaidOrder(checkoutRequestId, `MOCK-${Date.now()}`).then(async (result) => { await deliverTickets(result.order_id); paymentStatuses.set(checkoutRequestId, "Paid"); console.info("Mock payment finalized", result.order_id); }).catch((error) => { paymentStatuses.set(checkoutRequestId, "Failed"); console.error("Mock payment finalization failed", error); }); }, 1200);
    res.status(202).json({ checkoutRequestId, customerMessage: "Mock payment accepted for testing" });
    return;
  }

  const timestamp = new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi", hour12: false }).replace(/[^0-9]/g, "").slice(0, 14);
  const shortcode = process.env.MPESA_TILL_NUMBER!;
  const password = Buffer.from(`${shortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString("base64");
  try {
    const tokenResponse = await fetch(`${darajaBase()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64")}` } });
    if (!tokenResponse.ok) throw new Error("Daraja authentication failed");
    const token = (await tokenResponse.json() as { access_token?: string }).access_token;
    if (!token) throw new Error("Daraja did not return an access token");
    const stkResponse = await fetch(`${darajaBase()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ BusinessShortCode: shortcode, Password: password, Timestamp: timestamp, TransactionType: "CustomerBuyGoodsOnline", Amount: Math.round(amount), PartyA: phone, PartyB: shortcode, PhoneNumber: phone, CallBackURL: process.env.MPESA_CALLBACK_URL, AccountReference: order.order_number.slice(0, 12), TransactionDesc: "Hili ticket" }),
    });
    const data = await stkResponse.json() as Record<string, unknown>;
    if (!stkResponse.ok || data.ResponseCode === "1" || typeof data.CheckoutRequestID !== "string") throw new Error("M-Pesa could not start the payment");
    await attachCheckoutRequest(order.id, data.CheckoutRequestID);
    paymentStatuses.set(data.CheckoutRequestID, "Pending");
    res.status(202).json({ merchantRequestId: data.MerchantRequestID, checkoutRequestId: data.CheckoutRequestID, customerMessage: data.CustomerMessage });
  } catch (error) {
    await markOrderFailed(order.id).catch((failure) => console.error("Could not mark failed order", failure));
    console.error("M-Pesa STK Push failed", error);
    res.status(502).json({ error: "Unable to start M-Pesa payment" });
  }
};

export const handleMpesaCallback: RequestHandler = async (req, res) => {
  const callback = req.body?.Body?.stkCallback;
  const checkoutRequestId = callback?.CheckoutRequestID;
  if (typeof checkoutRequestId !== "string") { res.json({ ResultCode: 0, ResultDesc: "Accepted" }); return; }
  if (callback?.ResultCode !== 0) { paymentStatuses.set(checkoutRequestId, "Failed"); res.json({ ResultCode: 0, ResultDesc: "Accepted" }); return; }
  const metadata = Array.isArray(callback.CallbackMetadata?.Item) ? callback.CallbackMetadata.Item as Array<{ Name?: string; Value?: string | number }> : [];
  const receipt = metadata.find((item) => item.Name === "MpesaReceiptNumber")?.Value;
  try {
    const finalized = await finalizePaidOrder(checkoutRequestId, receipt ? String(receipt) : undefined);
    paymentStatuses.set(checkoutRequestId, "Paid");
    try {
      await deliverTickets(finalized.order_id);
    } catch (emailError) {
      console.error("Ticket email delivery failed; order remains paid for retry", emailError);
    }
  } catch (error) {
    paymentStatuses.set(checkoutRequestId, "Failed");
    console.error("M-Pesa callback finalization failed", error);
  }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
};

export const handleMpesaStatus: RequestHandler = async (req, res) => {
  const checkoutRequestId = Array.isArray(req.params.checkoutRequestId) ? req.params.checkoutRequestId[0] : req.params.checkoutRequestId;
  const status = paymentStatuses.get(checkoutRequestId);
  if (!status) { res.status(404).json({ error: "Payment not found" }); return; }
  res.json({ status });
};
