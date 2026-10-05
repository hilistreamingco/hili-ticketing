/**
 * Shared types between client and server.
 */

export interface DemoResponse {
  message: string;
}

// ── Roles ──────────────────────────────────────────────────────────────────
// Two roles only:
//   hili_admin    — full access: event management, site config, AND prestige ops
//   prestige_admin — operational access: orders, payments, tickets only
export type UserRole = "hili_admin" | "prestige_admin";

/** Roles that can access the Hili event/site management dashboard */
export const HILI_ROLES: UserRole[] = ["hili_admin"];

/** Roles that can access the Prestige operations dashboard */
export const PRESTIGE_ROLES: UserRole[] = ["hili_admin", "prestige_admin"];

// ── Payment / Fulfillment status ───────────────────────────────────────────
export type PaymentStatus =
  | "pending"
  | "processing"
  | "confirmed"
  | "paid"        // legacy Daraja-confirmed
  | "not_found"
  | "failed"
  | "cancelled"
  | "refunded";

export type FulfillmentStatus = "not_sent" | "sent";

export type PaymentProvider = "manual" | "daraja" | "pesapal";

// ── Order types ────────────────────────────────────────────────────────────
export interface OrderItem {
  id: string;
  /** null for cinema seats priced by seats taken (no tier) */
  ticket_type_id: string | null;
  ticket_type?: { name: string } | null;
  quantity: number;
  unit_price_kes: number;
  attendee_names: string[];
  /** seat ids in the same order as attendee_names (cinema orders) */
  seat_ids?: string[];
  /** printable seat labels (A07...) in the same order, filled in by the server */
  seat_labels?: string[];
}

export interface Order {
  id: string;
  order_number: string;
  event_id: string;
  event_name?: string;
  event?: {
    id?: string;
    name: string;
    slug?: string;
    venue?: string;
    address?: string;
    city?: string;
    event_date?: string;
    start_time?: string;
    event_type?: "general" | "cinema";
  };
  purchaser_name: string;
  purchaser_email: string;
  purchaser_phone: string;
  amount_kes: number;
  status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  payment_provider: PaymentProvider;
  mpesa_name: string | null;
  mpesa_transaction_code: string | null;
  mpesa_receipt_number: string | null;
  payment_note: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  sent_at: string | null;
  sent_by: string | null;
  created_at: string;
  paid_at: string | null;
  items?: OrderItem[];
  tickets?: OrderTicket[];
}

export interface OrderTicket {
  id: string;
  ticket_number: string;
  attendee_name: string;
  qr_token?: string;
  seat_label?: string | null;
  checked_in_at?: string | null;
  ticket_type?: { name: string } | null;
}

/** One row of the Prestige attendee list: a single ticket with its order. */
export interface PrestigeAttendee {
  id: string;
  ticket_number: string;
  attendee_name: string;
  seat_label: string | null;
  checked_in_at: string | null;
  created_at: string;
  event: { name: string; event_type: "general" | "cinema" } | null;
  ticket_type: { name: string } | null;
  order: {
    id: string;
    order_number: string;
    status: string;
    purchaser_name: string;
    purchaser_phone: string;
    purchaser_email: string;
    fulfillment_status: string;
  };
}

export interface PrestigeEvent {
  id: string;
  name: string;
  slug: string;
  event_type: "general" | "cinema";
  event_date: string | null;
  start_time: string | null;
  status: string;
  ticket_prefix: string | null;
}

// ── Manual order creation ──────────────────────────────────────────────────
export interface CreateManualOrderRequest {
  eventSlug: string;
  ticketTypeId?: string;
  ticketTypeName?: string;
  purchaserName: string;
  purchaserEmail: string;
  purchaserPhone: string;
  mpesaName?: string;
  mpesaTransactionCode?: string;
  attendeeNames: string[];
  amountKes: number;
}

export interface CreateManualOrderResponse {
  orderId: string;
  orderNumber: string;
}

// ── Payment config ─────────────────────────────────────────────────────────
export type PaymentType = "till" | "paybill";

export interface PaymentConfig {
  id: string;
  event_id: string;
  provider: PaymentProvider;
  payment_method: string;
  payment_type: PaymentType;
  number: string | null;
  account_number: string | null;
  instructions: string | null;
  till_name?: string | null;
  is_active: boolean;
}

export interface UpsertPaymentConfigRequest {
  eventId: string;
  paymentType: PaymentType;
  number: string;
  accountNumber?: string;
  instructions?: string;
  tillName?: string;
}

// ── Prestige dashboard stats ───────────────────────────────────────────────
export interface PrestigeStats {
  totalTicketsSold: number;
  totalRevenue: number;
  pendingOrders: number;
  confirmedOrders: number;
  sentOrders: number;
  notFoundOrders: number;
  ticketsByType: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

// ── Prestige API responses ─────────────────────────────────────────────────
export interface ListOrdersResponse {
  orders: Order[];
}

export interface GetOrderResponse {
  order: Order;
}

export interface ConfirmPaymentRequest {
  orderId: string;
}

export interface ConfirmPaymentResponse {
  success: boolean;
  message: string;
  /** set when the payment was confirmed but the tickets could not be created yet */
  ticketError?: string;
}

export interface MarkNotFoundRequest {
  orderId: string;
  note?: string;
}

export interface SendTicketRequest {
  orderId: string;
}

export interface SendTicketResponse {
  success: boolean;
  message: string;
}

// ── Audit log ──────────────────────────────────────────────────────────────
export interface AuditEntry {
  id: string;
  order_id: string | null;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
