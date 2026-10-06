import { ArrowLeft, AtSign, Mail, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";

// No form on purpose: messages go straight to the team's own email, so the site has nothing to send,
// store or keep running for this page.
const EMAIL = "hilistreaming.co@gmail.com";

export default function ContactPage() {
  return (
    <Layout>
      <div className="container max-w-2xl py-16 md:py-24">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back home
        </Link>
        <p className="mt-10 text-[10px] font-semibold uppercase tracking-[.3em] text-primary">Get in touch</p>
        <h1 className="mt-3 font-display text-5xl font-bold tracking-tight">Talk to Hili.</h1>
        <p className="mt-4 max-w-lg leading-7 text-muted-foreground">
          Questions about an event, ticketing, or working together? Email us and we'll get back to you.
        </p>

        <div className="mt-10 space-y-3">
          <a href={`mailto:${EMAIL}`} className="flex items-center gap-4 rounded-3xl border border-border bg-card p-6 shadow-card transition-colors hover:border-foreground/40">
            <Mail className="h-6 w-6 shrink-0 text-primary" />
            <span>
              <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">Email</span>
              <span className="mt-0.5 block font-display text-lg font-bold">{EMAIL}</span>
            </span>
          </a>
          <a href="tel:0796429978" className="flex items-center gap-4 rounded-3xl border border-border bg-card p-6 shadow-card transition-colors hover:border-foreground/40">
            <Phone className="h-6 w-6 shrink-0 text-primary" />
            <span>
              <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">Phone</span>
              <span className="mt-0.5 block font-display text-lg font-bold">0796 429 978</span>
            </span>
          </a>
          <a href="https://www.instagram.com/madebyhili/?hl=en" target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-3xl border border-border bg-card p-6 shadow-card transition-colors hover:border-foreground/40">
            <AtSign className="h-6 w-6 shrink-0 text-primary" />
            <span>
              <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">Instagram</span>
              <span className="mt-0.5 block font-display text-lg font-bold">@madebyhili</span>
            </span>
          </a>
        </div>

        <div className="mt-8 rounded-3xl bg-muted p-6 text-sm leading-7 text-muted-foreground">
          <p className="font-semibold text-foreground">About a ticket order?</p>
          <p className="mt-1">Include your <strong className="text-foreground">order number</strong> and your <strong className="text-foreground">M-Pesa transaction code</strong> so we can find your payment quickly.</p>
        </div>
      </div>
    </Layout>
  );
}
