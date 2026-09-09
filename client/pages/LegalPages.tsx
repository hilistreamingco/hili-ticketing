import type { ReactNode } from "react";
import Layout from "@/components/layout/Layout";

export function TermsPage() {
  return <Legal title="Terms & conditions" eyebrow="Good to know">
    <p>These terms describe how Hili events and ticket purchases work. By purchasing a ticket, you agree to follow the event policies shown on the event page.</p>
    <h2>Tickets and payment</h2>
    <p>Tickets are issued after successful M-Pesa payment confirmation by our team. Ticket availability and pricing are controlled by Hili and may change before an event sells out. Your ticket is only valid after our team has verified your payment and sent your ticket to your email.</p>
    <h2>No refunds policy</h2>
    <p>All ticket sales are final. We do not offer refunds or exchanges once a ticket has been purchased. By completing your purchase, you acknowledge and agree to this no-refund policy. In the unlikely event that an event is cancelled, Hili will communicate directly with ticket holders regarding next steps.</p>
    <h2>Ticket validity</h2>
    <p>Each ticket is valid for one person only and is non-transferable. Bring your digital ticket to the venue. A valid ID may be required for entry. Hili reserves the right to refuse entry when event policies are not followed.</p>
    <h2>Contact</h2>
    <p>For questions about a payment or ticket, email hilistreaming.co@gmail.com with your order number.</p>
  </Legal>;
}

export function PrivacyPage() {
  return <Legal title="Privacy policy" eyebrow="Your privacy matters">
    <p>Hili collects the information needed to process ticket purchases and help you attend our events.</p>
    <h2>Information we collect</h2>
    <p>When you purchase a ticket, we collect attendee names and the purchaser's email address and phone number. M-Pesa payment details are used solely for payment verification purposes.</p>
    <h2>How we use it</h2>
    <p>We use this information to issue tickets, verify payments, confirm entry, and provide support. We do not sell your personal information to third parties.</p>
    <h2>Questions</h2>
    <p>Contact hilistreaming.co@gmail.com if you have questions about your information or your ticket.</p>
  </Legal>;
}

function Legal({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) { return <Layout><article className="container max-w-2xl py-16 md:py-24"><p className="text-[10px] font-semibold uppercase tracking-[.3em] text-primary">{eyebrow}</p><h1 className="mt-4 font-display text-4xl font-bold tracking-tight md:text-5xl">{title}</h1><div className="mt-10 space-y-5 text-base leading-8 text-muted-foreground [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground">{children}</div></article></Layout>; }
