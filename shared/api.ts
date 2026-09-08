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
  ticket_type_id: string;
  ticket_type_name?: string;
  quantity: number;
  unit_price_kes: number;
  attendee_names: string[];
}

export interface Order {
  id: string;
  order_number: string;
  event_id: string;
  event_name?: string;
  event?: {
    id: string;
    name: string;
    venue?: string;
    event_date?: string;
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
  tickets?: Array<{
    id: string;
    ticket_number: string;
    attendee_name: string;
    ticket_type?: { name: string };
  }>;
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
  is_active: boolean;
}

export interface UpsertPaymentConfigRequest {
  eventId: string;
  paymentType: PaymentType;
  number: string;
  accountNumber?: string;
  instructions?: string;
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
