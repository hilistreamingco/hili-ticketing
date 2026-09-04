import type { RequestHandler } from "express";

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return digits;
};

const darajaBase = () => process.env.MPESA_ENVIRONMENT === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

const missingConfig = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_PASSKEY", "MPESA_TILL_NUMBER", "MPESA_CALLBACK_URL"];
const paymentStatuses = new Map<string, "Pending" | "Paid" | "Failed">();

export const handleMpesaStkPush: RequestHandler = async (req, res) => {
  const absent = missingConfig.filter((key) => !process.env[key]);
  if (absent.length) {
    res.status(503).json({ error: "M-Pesa is not configured", missing: absent });
    return;
  }
  const { phone, amount, accountReference, transactionDescription } = req.body as Record<string, unknown>;
  if (typeof phone !== "string" || typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "A valid phone number and amount are required" });
    return;
  }
  const timestamp = new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi", hour12: false }).replace(/[^0-9]/g, "").slice(0, 14);
  const shortcode = process.env.MPESA_TILL_NUMBER!;
  const password = Buffer.from(`${shortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString("base64");
  try {
    const tokenResponse = await fetch(`${darajaBase()}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64")}` },
    });
    if (!tokenResponse.ok) throw new Error("Daraja authentication failed");
    const token = (await tokenResponse.json() as { access_token?: string }).access_token;
    if (!token) throw new Error("Daraja did not return an access token");
    const stkResponse = await fetch(`${darajaBase()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerBuyGoodsOnline",
        Amount: Math.round(amount),
        PartyA: normalizePhone(phone),
        PartyB: shortcode,
        PhoneNumber: normalizePhone(phone),
        CallBackURL: process.env.MPESA_CALLBACK_URL,
        AccountReference: typeof accountReference === "string" ? accountReference.slice(0, 12) : "HILI",
        TransactionDesc: typeof transactionDescription === "string" ? transactionDescription.slice(0, 20) : "Hili ticket",
      }),
    });
    const data = await stkResponse.json() as Record<string, unknown>;
    if (!stkResponse.ok || data.ResponseCode === "1") {
      res.status(502).json({ error: "M-Pesa could not start the payment", detail: data });
      return;
    }
    if (typeof data.CheckoutRequestID === "string") paymentStatuses.set(data.CheckoutRequestID, "Pending");
    res.status(202).json({ merchantRequestId: data.MerchantRequestID, checkoutRequestId: data.CheckoutRequestID, customerMessage: data.CustomerMessage });
  } catch (error) {
    console.error("M-Pesa STK Push failed", error);
    res.status(502).json({ error: "Unable to reach M-Pesa" });
  }
};

export const handleMpesaCallback: RequestHandler = (req, res) => {
  const callback = req.body?.Body?.stkCallback;
  const checkoutRequestId = callback?.CheckoutRequestID;
  if (typeof checkoutRequestId === "string") paymentStatuses.set(checkoutRequestId, callback?.ResultCode === 0 ? "Paid" : "Failed");
  console.info("M-Pesa callback received", { checkoutRequestId, resultCode: callback?.ResultCode });
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
};

export const handleMpesaStatus: RequestHandler = (req, res) => {
  const checkoutRequestId = Array.isArray(req.params.checkoutRequestId) ? req.params.checkoutRequestId[0] : req.params.checkoutRequestId;
  const status = paymentStatuses.get(checkoutRequestId);
  if (!status) { res.status(404).json({ error: "Payment not found" }); return; }
  res.json({ status });
};
