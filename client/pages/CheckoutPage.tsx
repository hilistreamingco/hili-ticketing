import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Smartphone, TriangleAlert } from "lucide-react";
import Layout from "@/components/layout/Layout";
import PlaceholderPage from "@/components/PlaceholderPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { events, formatPrice, getEventBySlug } from "@/lib/events";

export default function CheckoutPage() {
  const { slug } = useParams(); const [params] = useSearchParams(); const event = getEventBySlug(slug || events[0].slug); const ticket = event?.ticketTypes.find((item) => item.id === params.get("ticket")) || event?.ticketTypes[0]; const quantity = Number(params.get("quantity")) || 1; const [phone, setPhone] = useState(""); const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  if (!event || !ticket) return <PlaceholderPage title="Checkout unavailable" description="Please return to the event and try again." />;
  const pay = async () => {
    if (!phone.trim()) return;
    setStatus("processing");
    try {
      const response = await fetch("/api/payments/mpesa/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, amount: ticket.price * quantity, accountReference: event.slug, transactionDescription: event.title }),
      });
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
    } catch {
      setStatus("error");
    }
  };
  if (status === "success") return <Layout><div className="container flex min-h-[70vh] max-w-xl flex-col items-center justify-center py-20 text-center"><CheckCircle2 className="h-16 w-16 text-primary" /><p className="mt-7 text-[10px] font-semibold uppercase tracking-[.3em] text-primary">Payment received</p><h1 className="mt-3 font-display text-4xl font-bold">You're going to {event.title}.</h1><p className="mt-4 leading-7 text-muted-foreground">Your payment was received. We are creating your tickets and sending them to the email address you provided.</p><Button asChild className="mt-8"><Link to="/">Back to home</Link></Button></div></Layout>;
  return <Layout><div className="container max-w-xl py-12 md:py-20"><Link to={`/attendee/${event.slug}?ticket=${ticket.id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Back to details</Link><p className="mt-10 text-[10px] font-semibold uppercase tracking-[.3em] text-primary">Step 3 / Payment</p><h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Pay with M-Pesa</h1><p className="mt-3 text-muted-foreground">We'll send a payment prompt to your phone. Enter your M-Pesa number to continue.</p>{status === "error" && <div className="mt-7 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><TriangleAlert className="h-5 w-5 shrink-0" /><div><p className="font-semibold">Payment could not be completed</p><p className="mt-1">Please try again. If money was deducted, contact hello@hili.co.ke with a screenshot of your M-Pesa message.</p></div></div>}<div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-card"><div className="flex items-center justify-between border-b border-border pb-5"><div><p className="font-display font-semibold">{ticket.name}</p><p className="mt-1 text-sm text-muted-foreground">{event.title} · {quantity} ticket{quantity > 1 ? "s" : ""}</p></div><p className="font-display text-xl font-bold">{formatPrice(ticket.price * quantity)}</p></div><label className="mt-6 block text-sm font-semibold">M-Pesa phone number</label><div className="relative mt-2"><Smartphone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" className="h-12 pl-11" /></div><Button onClick={pay} disabled={!phone.trim() || status === "processing"} className="mt-6 h-12 w-full">{status === "processing" ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending prompt...</> : "Pay with M-Pesa"}</Button><p className="mt-4 text-center text-xs text-muted-foreground">By paying, you agree to Hili's terms and ticket policies.</p></div></div></Layout>;
}
