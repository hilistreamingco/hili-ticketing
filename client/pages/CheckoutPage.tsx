import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Smartphone, TriangleAlert } from "lucide-react";
import Layout from "@/components/layout/Layout";
import PlaceholderPage from "@/components/PlaceholderPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { events, formatPrice, getEventBySlug } from "@/lib/events";

export default function CheckoutPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const event = getEventBySlug(slug || events[0].slug);
  const ticket = event?.ticketTypes.find((item) => item.id === params.get("ticket")) || event?.ticketTypes[0];
  const quantity = Number(params.get("quantity")) || 1;
  const email = params.get("email") || "";
  const names = (() => { try { const value = JSON.parse(params.get("names") || "[]"); return Array.isArray(value) ? value.filter((name): name is string => typeof name === "string") : []; } catch { return []; } })();
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  if (!event || !ticket) return <PlaceholderPage title="Checkout unavailable" description="Please return to the event and try again." />;
  const pay = async () => {
    if (!phone.trim() || !email || names.length !== quantity) return;
    setStatus("processing");
    try {
      const response = await fetch("/api/payments/mpesa/stk-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, amount: ticket.price * quantity, eventSlug: event.slug, ticketTypeName: ticket.name, purchaserName: names[0], purchaserEmail: email, attendeeNames: names }) });
      if (!response.ok) throw new Error("Payment request failed");
      const { checkoutRequestId } = await response.json() as { checkoutRequestId?: string };
      if (!checkoutRequestId) throw new Error("Missing payment reference");
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusResponse = await fetch(`/api/payments/mpesa/status/${checkoutRequestId}`);
        if (!statusResponse.ok) continue;
        const payment = await statusResponse.json() as { status: "Pending" | "Paid" | "Failed" };
        if (payment.status === "Paid") { setStatus("success"); return; }
        if (payment.status === "Failed") throw new Error("M-Pesa payment failed");
      }
      throw new Error("Payment confirmation timed out");
    } catch { setStatus("error"); }
  };
  if (status === "success") return <Layout><div className="container flex min-h-[70vh] max-w-xl flex-col items-center justify-center py-20 text-center"><CheckCircle2 className="h-16 w-16 text-primary" /><p className="mt-7 text-[10px] font-semibold uppercase tracking-[.3em] text-primary">Payment received</p><h1 className="mt-3 font-display text-4xl font-bold">Tickets are being delivered.</h1><p className="mt-4 leading-7 text-muted-foreground">Your payment was confirmed. Each attendee will receive a ticket with the event, date, tier, attendee name, and unique ticket number at {email}.</p><Button asChild className="mt-8"><Link to="/">Back to home</Link></Button></div></Layout>;
  return <Layout><div className="container max-w-xl py-12 md:py-20"><Link to={`/attendee/${event.slug}?ticket=${ticket.id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Back to details</Link><p className="mt-10 text-[10px] font-semibold uppercase tracking-[.3em] text-primary">Step 3 / Payment</p><h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Pay with M-Pesa</h1><p className="mt-3 text-muted-foreground">We'll send a payment prompt to your phone. Tickets are created only after Safaricom confirms payment.</p>{status === "error" && <div className="mt-7 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><TriangleAlert className="h-5 w-5 shrink-0" /><div><p className="font-semibold">Payment could not be completed</p><p className="mt-1">If money was deducted, do not pay again. Contact hilistreaming.co@gmail.com with your M-Pesa receipt.</p></div></div>}<div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-card"><div className="flex items-center justify-between border-b border-border pb-5"><div><p className="font-display font-semibold">{ticket.name}</p><p className="mt-1 text-sm text-muted-foreground">{event.title} · {quantity} ticket{quantity > 1 ? "s" : ""}</p></div><p className="font-display text-xl font-bold">{formatPrice(ticket.price * quantity)}</p></div><p className="mt-5 text-sm text-muted-foreground">Delivering {quantity} named ticket{quantity > 1 ? "s" : ""} to <strong className="text-foreground">{email}</strong>.</p><label className="mt-6 block text-sm font-semibold">M-Pesa phone number</label><div className="relative mt-2"><Smartphone className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" /><Input className="h-12 pl-11" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0712 345 678" inputMode="tel" /></div><Button onClick={pay} disabled={status === "processing" || !phone.trim()} className="mt-6 h-12 w-full">{status === "processing" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Waiting for confirmation</> : "Send M-Pesa prompt"}</Button></div></div></Layout>;
}
