import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Info,
  Loader2,
  Phone,
  Receipt,
  TriangleAlert,
  User,
} from "lucide-react";
import Layout from "@/components/layout/Layout";
import PlaceholderPage from "@/components/PlaceholderPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice, getEventBySlug } from "@/lib/events";
import type { PaymentConfig } from "@shared/api";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return digits;
}

// ─── Payment Instructions ────────────────────────────────────────────────────

function PaymentInstructions({
  config,
  amount,
}: {
  config: PaymentConfig | null;
  amount: number;
}) {
  // Fallback to environment variable till number if config not available
  const number = config?.till_number ?? config?.number ?? "5451657";
  const isTill = !config || config.payment_type === "till";
  const accountRef = config?.account_number;

  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Phone className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold">Pay via M-Pesa</p>
          <p className="text-xs text-muted-foreground">
            {isTill ? "Buy Goods & Services" : "Paybill"}
          </p>
        </div>
      </div>

      {config?.instructions ? (
        <div
          className="mt-4 text-sm leading-7 text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: config.instructions }}
        />
      ) : (
        <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">1</span>
            Open M-Pesa on your phone
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">2</span>
            Select <strong className="text-foreground">Lipa na M-Pesa</strong>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">3</span>
            {isTill
              ? <>Select <strong className="text-foreground">Buy Goods and Services</strong></>
              : <>Select <strong className="text-foreground">Pay Bill</strong></>}
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">4</span>
            {isTill ? (
              <>Enter Till Number: <strong className="font-mono text-foreground">{number}</strong></>
            ) : (
              <>Enter Business Number: <strong className="font-mono text-foreground">{number}</strong></>
            )}
          </li>
          {!isTill && accountRef && (
            <li className="flex gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">5</span>
              Enter Account Number: <strong className="font-mono text-foreground">{accountRef}</strong>
            </li>
          )}
          <li className="flex gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{!isTill && accountRef ? "6" : "5"}</span>
            Enter the exact amount:{" "}
            <strong className="text-foreground">{formatPrice(amount)}</strong>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{!isTill && accountRef ? "7" : "6"}</span>
            Enter your M-Pesa PIN and complete payment
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{!isTill && accountRef ? "8" : "7"}</span>
            Return here and click{" "}
            <strong className="text-foreground">I've Completed Payment</strong>
          </li>
        </ol>
      )}

      <div className="mt-5 rounded-2xl bg-muted p-4 text-xs leading-6 text-muted-foreground">
        <Info className="mb-1 inline h-3.5 w-3.5" />{" "}
        <strong className="text-foreground">Important:</strong> Please enter your full name exactly as
        it appears on your M-Pesa account when purchasing your ticket. This helps us match your
        payment to your order.
      </div>
    </div>
  );
}

// ─── Confirmation screen ─────────────────────────────────────────────────────

function ConfirmationScreen({
  orderNumber,
  email,
}: {
  orderNumber: string;
  email: string;
}) {
  return (
    <Layout>
      <div className="container flex min-h-[80vh] max-w-xl flex-col items-center justify-center py-20 text-center">
        <CheckCircle2 className="h-16 w-16 text-primary" />
        <p className="mt-7 text-[10px] font-semibold uppercase tracking-[.3em] text-primary">
          Order received
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold">
          Thank You for Trusting Hili × BeerBirds!
        </h1>
        <p className="mt-5 leading-7 text-muted-foreground">
          We've received your ticket order and are currently verifying your payment. Once your
          payment is confirmed, your ticket will be sent to{" "}
          <strong className="text-foreground">{email}</strong>.
        </p>

        <div className="mt-8 w-full rounded-3xl border border-border bg-card p-6 text-left">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Order Number</p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-wider text-foreground">
            {orderNumber}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Keep this number for your records. You can use it to follow up on your order.
          </p>
        </div>

        <div className="mt-6 w-full rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
          <ClipboardList className="mb-1 inline h-4 w-4" />{" "}
          <strong>What happens next?</strong>
          <p className="mt-1">
            Our team will verify your M-Pesa payment and send your ticket to your email. This
            usually takes a few minutes during business hours.
          </p>
        </div>

        <Button asChild className="mt-8 w-full">
          <Link to="/">Return to Home</Link>
        </Button>
      </div>
    </Layout>
  );
}

// ─── Main CheckoutPage ───────────────────────────────────────────────────────

export default function CheckoutPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const quantity = Number(params.get("quantity")) || 1;
  const email = params.get("email") || "";
  const names = (() => {
    try {
      const v = JSON.parse(params.get("names") || "[]");
      return Array.isArray(v) ? v.filter((n): n is string => typeof n === "string") : [];
    } catch {
      return [];
    }
  })();

  const [mpesaName, setMpesaName] = useState(names[0] || "");
  const [phone, setPhone] = useState("");
  const [txCode, setTxCode] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [orderNumber, setOrderNumber] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);

  // Load event
  useEffect(() => {
    if (!slug) return;
    let active = true;
    const load = async () => {
      const ev = await getEventBySlug(slug);
      if (active) {
        setEvent(ev);
        setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [slug]);

  // Load payment config for this event
  useEffect(() => {
    if (!event?.slug) return;
    console.log('Loading payment config for:', event.slug);
    fetch(`/api/payment-config/${event.slug}`)
      .then((r) => r.json())
      .then((data: { config: PaymentConfig | null }) => {
        console.log('Payment config loaded:', data.config);
        if (data.config) setPaymentConfig(data.config);
      })
      .catch((err) => {
        console.error('Failed to load payment config:', err);
      });
  }, [event?.slug]);

  // Restore form state from localStorage - only once on mount
  const hasRestored = useRef(false);
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;
    const savedState = localStorage.getItem(`checkout-${slug}`);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed.mpesaName) setMpesaName(parsed.mpesaName);
        if (parsed.phone) setPhone(parsed.phone);
        if (parsed.txCode) setTxCode(parsed.txCode);
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save form state to localStorage (debounced)
  useEffect(() => {
    if (!slug) return;
    const timer = setTimeout(() => {
      localStorage.setItem(`checkout-${slug}`, JSON.stringify({ mpesaName, phone, txCode }));
    }, 500);
    return () => clearTimeout(timer);
  }, [slug, mpesaName, phone, txCode]);

  const ticket = event?.ticketTypes.find((t: any) => t.id === params.get("ticket")) || event?.ticketTypes[0];

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-black/30" />
        </div>
      </Layout>
    );
  }

  if (!event || !ticket) {
    return (
      <PlaceholderPage
        title="Checkout unavailable"
        description="Please return to the event and try again."
      />
    );
  }

  if (!email || names.length !== quantity) {
    return (
      <PlaceholderPage
        title="Missing order details"
        description="Please start from the ticket selection page."
      />
    );
  }

  const total = ticket.price * quantity;

  const submit = async () => {
    if (!phone.trim() || !mpesaName.trim()) return;
    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/orders/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventSlug: event.slug,
          ticketTypeName: ticket.name,
          purchaserName: names[0],
          purchaserEmail: email,
          purchaserPhone: formatPhone(phone),
          mpesaName: mpesaName.trim(),
          mpesaTransactionCode: txCode.trim().toUpperCase() || undefined,
          attendeeNames: names,
          amountKes: total,
        }),
      });

      const data = (await res.json()) as { orderId?: string; orderNumber?: string; error?: string };

      if (!res.ok) {
        setErrorMsg(data.error || "Could not submit your order. Please try again.");
        setStatus("error");
        return;
      }

      // Clear saved checkout state
      localStorage.removeItem(`checkout-${slug}`);
      
      setOrderNumber(data.orderNumber || "");
      setStatus("done");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  };

  if (status === "done") {
    return <ConfirmationScreen orderNumber={orderNumber} email={email} />;
  }

  return (
    <Layout>
      <div className="container max-w-2xl py-12 md:py-20">
        <Link
          to={`/attendee/${event.slug}?ticket=${ticket.id}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to attendee details
        </Link>

        <p className="mt-10 text-[10px] font-semibold uppercase tracking-[.3em] text-primary">
          Step 3 / Payment
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
          Complete your payment
        </h1>
        <p className="mt-3 text-muted-foreground">
          Follow the steps below, then click the button to submit your order.
        </p>

        {/* Order summary */}
        <div className="mt-8 flex items-center justify-between rounded-2xl border border-border bg-card px-6 py-4">
          <div>
            <p className="font-display font-semibold">{ticket.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {event.title} · {quantity} ticket{quantity > 1 ? "s" : ""}
            </p>
          </div>
          <p className="font-display text-xl font-bold">{formatPrice(total)}</p>
        </div>

        {/* Payment instructions */}
        <div className="mt-6">
          <PaymentInstructions config={paymentConfig} amount={total} />
        </div>

        {/* Customer fields */}
        <div className="mt-8 space-y-4 rounded-3xl border border-border bg-card p-6">
          <p className="font-semibold">Your payment details</p>
          <p className="text-sm text-muted-foreground">
            Delivering {quantity} ticket{quantity > 1 ? "s" : ""} to{" "}
            <strong className="text-foreground">{email}</strong>.
          </p>

          {/* M-Pesa name */}
          <div>
            <label className="block text-sm font-semibold">
              M-Pesa Registered Name <span className="text-destructive">*</span>
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Enter your name exactly as it appears in your M-Pesa account.
            </p>
            <div className="relative mt-2">
              <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                className="h-12 pl-11"
                value={mpesaName}
                onChange={(e) => setMpesaName(e.target.value)}
                placeholder="Full name on M-Pesa"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-semibold">
              M-Pesa Phone Number <span className="text-destructive">*</span>
            </label>
            <div className="relative mt-2">
              <Phone className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                className="h-12 pl-11"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XX XXX XXX"
                inputMode="tel"
              />
            </div>
          </div>

          {/* Transaction code */}
          <div>
            <label className="block text-sm font-semibold">
              M-Pesa Transaction Code{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              You can find this code in your M-Pesa confirmation message. Providing it helps us
              verify your payment faster.
            </p>
            <div className="relative mt-2">
              <Receipt className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                className="h-12 pl-11 font-mono uppercase"
                value={txCode}
                onChange={(e) => setTxCode(e.target.value.toUpperCase())}
                placeholder="e.g. QK1234ABCD"
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {status === "error" && (
          <div className="mt-6 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <TriangleAlert className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Order could not be submitted</p>
              <p className="mt-1">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={submit}
          disabled={status === "submitting" || !phone.trim() || !mpesaName.trim()}
          className="mt-6 h-14 w-full text-base font-semibold"
        >
          {status === "submitting" ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Submitting your order…
            </>
          ) : (
            "I've Completed Payment"
          )}
        </Button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Clicking this button does not charge you. Your order will be reviewed after we verify your
          M-Pesa payment.
        </p>
      </div>
    </Layout>
  );
}
