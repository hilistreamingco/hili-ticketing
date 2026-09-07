import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleMpesaCallback, handleMpesaStkPush, handleMpesaStatus } from "./routes/mpesa";
import { handleContactEmail } from "./routes/contact";
import {
  handlePrestigeStats,
  handleListOrders,
  handleGetOrder,
  handleConfirmPayment,
  handleMarkNotFound,
  handleSendTicket,
  handleGetPaymentConfig,
  handleUpsertPaymentConfig,
  handleCreateManualOrder,
} from "./routes/prestige";
import {
  handleGetEvents,
  handleCreateEvent,
  handleUpdateEvent,
  handleGetTicketTypes,
  handleCreateTicketType,
  handleUpdateTicketType,
  handleDeleteTicketType,
  handleUploadPoster,
  handleGetMyRole,
} from "./routes/admin";

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // ── Health / demo ────────────────────────────────────────────────────────
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });
  app.get("/api/demo", handleDemo);
  app.post("/api/contact", handleContactEmail);

  // ── Hili Admin API (service-role, hili_admin only) ────────────────────────
  app.get("/api/admin/events", handleGetEvents);
  app.post("/api/admin/events", handleCreateEvent);
  app.put("/api/admin/events/:id", handleUpdateEvent);
  app.get("/api/admin/events/:id/tickets", handleGetTicketTypes);
  app.post("/api/admin/tickets", handleCreateTicketType);
  app.put("/api/admin/tickets/:id", handleUpdateTicketType);
  app.delete("/api/admin/tickets/:id", handleDeleteTicketType);
  app.post("/api/admin/upload-poster", handleUploadPoster);
  app.get("/api/admin/me", handleGetMyRole);

  // ── Legacy Daraja STK push (kept for mock mode) ──────────────────────────
  app.post("/api/payments/mpesa/stk-push", handleMpesaStkPush);
  app.post("/api/payments/mpesa/callback", handleMpesaCallback);
  app.get("/api/payments/mpesa/status/:checkoutRequestId", handleMpesaStatus);

  // ── Manual order creation (called from public checkout) ──────────────────
  app.post("/api/orders/manual", handleCreateManualOrder);

  // ── Payment config (public read) ─────────────────────────────────────────
  app.get("/api/payment-config/:eventSlug", handleGetPaymentConfig);

  // ── Prestige dashboard API (auth-gated) ───────────────────────────────────
  app.get("/api/prestige/stats", handlePrestigeStats);
  app.get("/api/prestige/orders", handleListOrders);
  app.get("/api/prestige/orders/:orderId", handleGetOrder);
  app.post("/api/prestige/orders/confirm", handleConfirmPayment);
  app.post("/api/prestige/orders/not-found", handleMarkNotFound);
  app.post("/api/prestige/orders/send-ticket", handleSendTicket);
  app.put("/api/prestige/payment-config", handleUpsertPaymentConfig);

  return app;
}
