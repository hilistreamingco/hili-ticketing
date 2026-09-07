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

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── Health / demo ────────────────────────────────────────────────────────
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });
  app.get("/api/demo", handleDemo);
  app.post("/api/contact", handleContactEmail);

  // ── Legacy Daraja STK push (kept for backward compat / mock mode) ────────
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

  // ── Payment config management (Hili admin only) ───────────────────────────
  app.put("/api/prestige/payment-config", handleUpsertPaymentConfig);

  return app;
}
