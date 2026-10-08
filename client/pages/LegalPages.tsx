
import { useEffect, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";

const UPDATED = "4 October 2026";
const EMAIL = "hilistreaming.co@gmail.com";

export function TermsPage() {
  return (
    <Legal title="Terms & conditions" eyebrow="Good to know" updated={UPDATED}>
      <p>
        These terms explain how ticket sales for Hili events work. By buying a ticket you agree to them, and to
        any event-specific rules shown on that event's page. If a rule on an event page differs from these terms,
        the event page applies to that event.
      </p>

      <h2>Who we are</h2>
      <p>
        Hili sells tickets for events it organises or promotes, often together with a venue partner such as
        Prestige or BeerBirds. The event page tells you what the event is, when and where it takes place, and
        who runs the venue. Questions go to <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
      </p>

      <h2>How buying a ticket works</h2>
      <p>Payment is done by hand through M-Pesa, so a purchase happens in steps:</p>
      <ol>
        <li>You choose your tickets, or your seats for a cinema event, and enter a name for each ticket.</li>
        <li>You pay the exact amount shown to the M-Pesa Till number on the checkout page, using your own M-Pesa account.</li>
        <li>You return to the site and press <strong>I've Completed Payment</strong>, giving the name on your M-Pesa account and, if you can, the M-Pesa transaction code.</li>
        <li>Our team checks the payment against the Till. Only then is your order confirmed and your ticket created and emailed to you as a PDF.</li>
      </ol>
      <p>
        Submitting an order is not a ticket. <strong>Your ticket is valid only once we have confirmed your payment and
        sent it to you.</strong> Please pay the exact amount, from an account in the name you enter, so we can match
        your payment quickly. If we cannot find your payment, the order is cancelled and any seats held for you
        are released. If you believe that is a mistake, email us with your order number and M-Pesa code.
      </p>

      <h2>Prices, ticket types and when sales close</h2>
      <p>
        Prices are shown in Kenya shillings. An event may offer several ticket types, such as early bird, advance
        or special offers, each with its own price, quantity and sales dates. A ticket type can be bought only
        while it is on sale and while stock lasts. The price on your checkout page is the price you pay.
      </p>
      <p>
        Some cinema events set the seat price by how many seats have already been taken, so the price may rise
        as the room fills. The price you see when you continue to payment is locked for you while your seats are held.
      </p>
      <p>
        Every event has a sales closing time, and sales also stop when tickets or seats sell out. Once sales are
        closed the event page says so and you cannot buy. We may reopen or extend sales, or close them early, at our
        discretion. If you started paying just before a closing time, we will still look at your order.
      </p>

      <h2>Seats at cinema events</h2>
      <p>
        When you pick seats we hold them for you for 20 minutes so you can pay. After you submit your order they stay
        reserved until we confirm or cancel it. Your ticket shows the seat and the name of the person who will sit
        there. If you book several seats, each ticket carries its own seat and name, and you are responsible for
        giving those tickets to the right people. We may move a seat only where we must, for example because of a
        technical or safety problem at the venue, and we will tell you if we do.
      </p>

      <h2>Your ticket</h2>
      <ul>
        <li>Each ticket admits one person and is not transferable to another person without our agreement.</li>
        <li>Each ticket has a unique QR code. Keep it private: whoever presents it first may be let in, and a copy will not be admitted a second time.</li>
        <li>Bring the ticket, printed or on your phone, and a valid ID. We or the venue may check that the ID matches the name on the ticket.</li>
        <li>Age limits and venue rules shown on the event page apply. We and the venue may refuse entry, or ask someone to leave, if rules are not followed or for safety reasons, without a refund.</li>
        <li>If you lose your ticket, or did not receive it, email us with your order number and we will resend it.</li>
      </ul>

      <h2>No refunds</h2>
      <p>
        All ticket sales are final. We do not give refunds or exchanges once a ticket has been bought, including if you
        cannot attend or if you chose the wrong tickets or seats. This does not limit any right you have under
        Kenyan law.
      </p>

      <h2>If an event changes</h2>
      <p>
        Dates, times, line-ups, venues and seating plans can change. If an event is postponed, moved or cancelled,
        we will contact ticket holders at the email address on the order and explain what happens next. Please keep
        that address up to date, and check your spam folder for our emails.
      </p>

      <h2>Mistakes</h2>
      <p>
        If a price, quantity or seat was clearly shown by mistake, or a payment was made twice or for the wrong
        amount, contact us. We will put it right, which may mean correcting the order or returning a duplicate
        payment.
      </p>

      <h2>Our responsibility</h2>
      <p>
        We take care to run ticketing properly, but we cannot promise the site will always be available or free of
        errors. To the extent the law allows, we are not responsible for losses that were not reasonably foreseeable,
        or for events outside our control. Nothing in these terms limits liability that cannot lawfully be limited.
      </p>

      <h2>Changes and governing law</h2>
      <p>
        We may update these terms. The version published when you order is the one that applies to that order. These
        terms are governed by the laws of Kenya, and the Kenyan courts have jurisdiction over any dispute.
      </p>

      <h2>Contact</h2>
      <p>
        For anything about a payment or ticket, email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> with your order number.
        Our <Link to="/privacy?view=full">privacy policy</Link> explains how we handle your information.
      </p>
    </Legal>
  );
}

// ── Privacy ─────────────────────────────────────────────────────────────────────
// /privacy             the short "Privacy & Your Data" summary shown on the website
// /privacy?view=full   the full Privacy Policy (the summary's "Read our full Privacy Policy" link)
// The wording below is the supplied "Hili Privacy Policy" document, unchanged.

// Hili's postal address for section 16. Leave empty to leave the line out; fill it in and it appears.
const ADDRESS = "";

export function PrivacyPage() {
  const [params] = useSearchParams();
  const full = params.get("view") === "full";

  // Switching between the summary and the full policy keeps the same page, so go back to the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [full]);

  return full ? <FullPrivacyPolicy /> : <PrivacySummary />;
}

function PrivacySummary() {
  return (
    <Legal title="Privacy &amp; Your Data" eyebrow="Your privacy matters">
      <p>At Hili, we respect your privacy. We collect only the information needed to process your tickets, verify payments, manage event entry and provide customer support. Your information is not sold or rented to third parties.</p>
      <p>We may share relevant information with event organisers and trusted service providers where necessary to deliver our services, and we take reasonable measures to keep your information secure.</p>
      <p>You have rights over your personal information, including the right to request access, correction or deletion where applicable.</p>
      <p>For questions about your data or to exercise your rights, contact us at <a href="mailto:hilistreaming.co@gmail.com">hilistreaming.co@gmail.com</a>.</p>
      <p>
        <Link
          to="/privacy?view=full"
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold !text-background !no-underline transition-opacity hover:opacity-90"
        >
          Read our full Privacy Policy <ArrowRight className="h-4 w-4" />
        </Link>
      </p>
    </Legal>
  );
}

function FullPrivacyPolicy() {
  return (
    <Legal title="Privacy Policy" eyebrow="Privacy" updated="08/10/2026">
      <p>
        <Link to="/privacy" className="inline-flex items-center gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> Privacy &amp; Your Data
        </Link>
      </p>
      <p>Hili respects your privacy and is committed to handling your personal information responsibly. This Privacy Policy explains how personal information provided through the Hili website and ticketing services is collected, used, stored and protected.</p>
      <p>By using the Hili website or purchasing a ticket through the platform, you acknowledge the practices described in this Privacy Policy.</p>
      <p>This Privacy Policy is intended to be consistent with applicable data protection laws, including the <strong>Data Protection Act, 2019 of Kenya</strong> and applicable regulations.</p>
      <h2>1. Information We Collect</h2>
      <p>Depending on how you use our website and services, we may collect the following information:</p>
      <h3>Information you provide</h3>
      <p>When you purchase a ticket or contact us, we may collect:</p>
      <ul>
        <li>Your name;</li>
        <li>Email address;</li>
        <li>Phone number;</li>
        <li>Ticket and booking information;</li>
        <li>Event and attendance information;</li>
        <li>Information you provide when contacting us for support; and</li>
        <li>Other information you voluntarily provide in connection with our services.</li>
      </ul>
      <h3>Payment information</h3>
      <p>When you purchase a ticket, payment may be made through M-Pesa or another available payment provider.</p>
      <p>We may receive information necessary to verify your payment, including a transaction reference, payment amount, payment status and other relevant transaction details.</p>
      <p><strong>We do not require or store your M-Pesa PIN.</strong></p>
      <p>Payment information may also be processed by the relevant payment provider in accordance with its own terms and privacy practices.</p>
      <h3>Technical information</h3>
      <p>When you visit or use our website, certain technical information may be collected automatically, such as your IP address, browser type, device information and information about how you interact with the website.</p>
      <p>This information may be used where necessary to maintain website functionality, security, performance and improve our services.</p>
      <h2>2. How We Use Your Information</h2>
      <p>We may use personal information to:</p>
      <ul>
        <li>Process and issue tickets;</li>
        <li>Verify payments;</li>
        <li>Confirm ticket validity and facilitate event entry;</li>
        <li>Communicate with you about your ticket or event;</li>
        <li>Provide customer support;</li>
        <li>Administer and manage events;</li>
        <li>Prevent fraud, misuse or unauthorised transactions;</li>
        <li>Maintain and improve the website and ticketing services;</li>
        <li>Meet applicable legal or regulatory requirements; and</li>
        <li>Protect the rights, safety, property and security of users and the services.</li>
      </ul>
      <p>We will not use your personal information for purposes that are materially incompatible with the purpose for which it was collected without providing appropriate notice or obtaining consent where required by law.</p>
      <h2>3. Legal Basis for Processing</h2>
      <p>Depending on the circumstances, personal information may be processed where:</p>
      <ul>
        <li>It is necessary to provide the ticketing services or fulfil a transaction with you;</li>
        <li>You have provided consent where consent is required;</li>
        <li>Processing is necessary to comply with a legal obligation;</li>
        <li>Processing is necessary to protect legitimate interests, provided those interests do not override your applicable rights; or</li>
        <li>Another lawful basis permitted under applicable data protection law applies.</li>
      </ul>
      <p>Where processing is based on consent, you may withdraw that consent where permitted by applicable law.</p>
      <h2>4. When We Share Your Information</h2>
      <p>We do <strong>not sell or rent your personal information</strong>.</p>
      <p>Information may be shared where reasonably necessary to provide the services, including with:</p>
      <ul>
        <li>Event organisers or hosts, where necessary to administer an event, verify attendance or provide event-related services;</li>
        <li>Payment providers and financial service providers for payment processing and verification;</li>
        <li>Technology, hosting, communications and other service providers supporting the operation of the website or services;</li>
        <li>Professional advisers where reasonably necessary;</li>
        <li>Government, regulatory or law-enforcement authorities where required or permitted by law; and</li>
        <li>Other persons where disclosure is reasonably necessary to protect the rights, safety, property or security of users or the services.</li>
      </ul>
      <p>Where third parties process personal information on our behalf, reasonable steps will be taken to ensure appropriate confidentiality and data protection obligations apply.</p>
      <h2>5. Event Organisers</h2>
      <p>Some events available through Hili may be organised or hosted by independent third-party event organisers.</p>
      <p>Where necessary for the administration of an event, relevant attendee information may be provided to the event organiser. This may include information such as your name, ticket details and contact information, depending on the requirements of the particular event.</p>
      <p>Event organisers may have their own responsibilities regarding personal information they receive and may provide additional privacy information where appropriate.</p>
      <p>Hili is not responsible for an event organiser's independent use of personal information outside the services provided through Hili.</p>
      <h2>6. Event Photography and Recording</h2>
      <p>Events facilitated or ticketed through Hili may be photographed, filmed or otherwise recorded for purposes including event documentation, security, reporting, promotional activities or archival purposes.</p>
      <p>Where required by applicable law, appropriate notice or consent will be provided.</p>
      <p>If personal information, including an individual's image, is specifically selected for promotional use beyond ordinary event documentation, appropriate notice and/or consent will be obtained where required by law.</p>
      <h2>7. Marketing Communications</h2>
      <p>Where permitted by applicable law, we may communicate information about events, ticketing services or other activities.</p>
      <p>Where consent is required for marketing communications, appropriate consent will be obtained.</p>
      <p>You may opt out of marketing communications at any time by following the unsubscribe instructions included in the communication or contacting us using the details provided below.</p>
      <p>Opting out of marketing communications will not prevent us from sending communications necessary to process or administer an existing ticket purchase or transaction.</p>
      <h2>8. Cookies and Similar Technologies</h2>
      <p>The Hili website may use cookies and similar technologies to support essential website functionality, improve website performance and understand how visitors use the website.</p>
      <p>Where applicable, cookies may also be used for analytics or other purposes.</p>
      <p>You may be able to control or disable certain cookies through your browser settings. Where applicable law requires consent for non-essential cookies, appropriate consent will be requested.</p>
      <h2>9. Data Retention</h2>
      <p>Personal information will be retained only for as long as reasonably necessary for the purposes for which it was collected, including where necessary to:</p>
      <ul>
        <li>Provide and administer our services;</li>
        <li>Maintain appropriate transaction and business records;</li>
        <li>Resolve disputes;</li>
        <li>Prevent fraud or misuse;</li>
        <li>Comply with legal, regulatory, accounting or reporting requirements; and</li>
        <li>Establish, exercise or defend legal claims.</li>
      </ul>
      <p>When personal information is no longer reasonably required, appropriate steps will be taken to securely delete, anonymise or otherwise dispose of it, subject to applicable legal requirements.</p>
      <h2>10. Data Security</h2>
      <p>Reasonable technical and organisational measures are taken to protect personal information against unauthorised access, loss, misuse, alteration, disclosure or destruction.</p>
      <p>Access to personal information is limited where reasonably practicable to persons and service providers who require it for legitimate purposes.</p>
      <p>However, no method of transmitting or storing information electronically can be guaranteed to be completely secure. Accordingly, while reasonable measures are taken to protect personal information, absolute security cannot be guaranteed.</p>
      <h2>11. International and Cross-Border Processing</h2>
      <p>Some technology or service providers supporting the website or ticketing services may process information outside Kenya.</p>
      <p>Where personal information is transferred outside Kenya, reasonable steps will be taken to ensure that the transfer and subsequent processing comply with applicable data protection requirements.</p>
      <h2>12. Your Rights</h2>
      <p>Subject to applicable law and any relevant limitations, you may have rights in relation to your personal information, including the right to:</p>
      <ul>
        <li>Request access to personal information held about you;</li>
        <li>Request correction of inaccurate or incomplete information;</li>
        <li>Request deletion or erasure of personal information in appropriate circumstances;</li>
        <li>Object to certain processing of your personal information;</li>
        <li>Request restriction of processing in appropriate circumstances;</li>
        <li>Withdraw consent where processing is based on consent; and</li>
        <li>Exercise other rights available under applicable data protection law.</li>
      </ul>
      <p>Requests concerning your personal information may be made using the contact details provided below.</p>
      <p>We may request reasonable information to verify your identity before processing certain requests.</p>
      <h2>13. Children's Information</h2>
      <p>The Hili services are not intentionally directed at children where doing so would be contrary to applicable law.</p>
      <p>We do not knowingly collect personal information from children in circumstances where appropriate consent or another lawful basis is required and has not been obtained.</p>
      <p>If you believe that a child has provided personal information to us in circumstances where this should not have occurred, please contact us.</p>
      <h2>14. Data Protection Complaints</h2>
      <p>If you have concerns about how your personal information has been handled, we encourage you to contact us first so that we can review and address the concern.</p>
      <h2>15. Changes to This Privacy Policy</h2>
      <p>This Privacy Policy may be updated from time to time to reflect changes to our services, technology, legal requirements or data-processing practices.</p>
      <p>Where material changes are made, appropriate notice may be provided through the website or other suitable communication channels.</p>
      <p>The date shown at the beginning of this Privacy Policy indicates when it was most recently updated.</p>
      <h2>16. Contact Us</h2>
      <p>If you have questions about this Privacy Policy, your personal information or how information is handled through Hili, please contact:</p>
      <p>
        <strong>Hili</strong>
        <br />
        <strong>Email:</strong> <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
        {ADDRESS && (
          <>
            <br />
            <strong>Address:</strong> {ADDRESS}
          </>
        )}
      </p>
      <p>We will endeavour to respond to privacy-related requests within a reasonable period and in accordance with applicable law.</p>
    </Legal>
  );
}

function Legal({ title, eyebrow, updated, children }: { title: string; eyebrow: string; updated?: string; children: ReactNode }) {
  return (
    <Layout>
      <article className="container max-w-2xl py-16 md:py-24">
        <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-primary">{eyebrow}</p>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight md:text-5xl">{title}</h1>
        {updated && <p className="mt-3 text-sm text-muted-foreground">Last updated: {updated}</p>}
        <div className="mt-10 space-y-5 text-base leading-8 text-muted-foreground [&_a]:font-semibold [&_a]:text-foreground [&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-foreground [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
          {children}
        </div>
      </article>
    </Layout>
  );
}
