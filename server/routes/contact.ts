import type { RequestHandler } from "express";

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);

export const handleContactEmail: RequestHandler = async (req, res) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;
  const recipient = process.env.CONTACT_TO_EMAIL || "hilistreaming.co@gmail.com";
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!apiKey || !from) { res.status(503).json({ error: "Email is not configured" }); return; }
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !message || message.length > 5000) { res.status(400).json({ error: "Name, valid email, and message are required" }); return; }
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [recipient], reply_to: email, subject: `Hili website message from ${name}`, html: `<div style="font-family:Arial,sans-serif"><h2>Hili website message</h2><p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p><p>${escapeHtml(message).replace(/\n/g, "<br />")}</p></div>` }) });
    if (!response.ok) { const detail = await response.text(); console.error("Resend contact request failed", detail); res.status(502).json({ error: "Email delivery failed" }); return; }
    res.status(202).json({ sent: true });
  } catch (error) { console.error("Contact email failed", error); res.status(502).json({ error: "Unable to send message" }); }
};
