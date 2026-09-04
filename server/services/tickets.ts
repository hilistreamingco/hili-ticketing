export interface TicketEmailData {
  ticketNumber: string;
  attendeeName: string;
  eventName: string;
  eventDate: string;
  ticketTier: string;
  posterUrl?: string;
}

export function ticketEmailHtml(ticket: TicketEmailData) {
  const poster = ticket.posterUrl ? `<img src="${escapeHtml(ticket.posterUrl)}" alt="" style="width:100%;height:180px;object-fit:cover;border-radius:16px 16px 0 0;display:block" />` : "";
  return `<div style="font-family:Arial,sans-serif;background:#f4f4ef;padding:24px;color:#0b0b0b"><div style="max-width:420px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #deded6">${poster}<div style="padding:22px"><p style="font-size:11px;letter-spacing:2px;color:#748000;font-weight:bold">HILI TICKETING</p><h1 style="font-size:24px;margin:12px 0">${escapeHtml(ticket.eventName)}</h1><div style="border-top:1px dashed #aaa;border-bottom:1px dashed #aaa;padding:16px 0;margin:18px 0"><p style="margin:0 0 8px;color:#777;font-size:12px">ATTENDEE</p><strong>${escapeHtml(ticket.attendeeName)}</strong><p style="margin:14px 0 8px;color:#777;font-size:12px">TICKET</p><strong>${escapeHtml(ticket.ticketTier)}</strong><p style="margin:14px 0 8px;color:#777;font-size:12px">DATE</p><strong>${escapeHtml(ticket.eventDate)}</strong></div><p style="margin:0;color:#777;font-size:12px">Ticket number</p><p style="font-family:monospace;font-weight:bold;letter-spacing:1px">${escapeHtml(ticket.ticketNumber)}</p></div></div></div>`;
}

export async function sendTicketEmail(recipient: string, ticket: TicketEmailData) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Email delivery is not configured");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [recipient], subject: `Your ${ticket.eventName} ticket`, html: ticketEmailHtml(ticket) }) });
  if (!response.ok) throw new Error(`Email delivery failed with status ${response.status}`);
  return response.json() as Promise<{ id: string }>;
}

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character); }
