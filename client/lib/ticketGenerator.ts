import jsPDF from 'jspdf';
import QRCode from 'qrcode';

/**
 * Ticket PDF: one landscape ticket per page, one page per person.
 *
 * A cinema ticket carries the seat (e.g. A07) and the name of the person who sits there, so an
 * order of four seats makes four tickets with four names, even though one buyer paid for them.
 * The QR code holds the ticket's private token (not the printable number), and is drawn locally,
 * so no ticket data is sent to a third-party QR service.
 */
export interface TicketData {
  ticketNumber: string;
  attendeeName: string;
  eventName: string;
  /** Tier name (Early bird, Advance...). Leave empty for seats priced by seats taken. */
  ticketType?: string;
  /** YYYY-MM-DD */
  eventDate?: string;
  /** HH:MM or HH:MM:SS */
  startTime?: string;
  venue?: string;
  city?: string;
  /** e.g. "A07". Present on cinema tickets. */
  seatLabel?: string | null;
  /** Private token encoded in the QR code. Falls back to the ticket number. */
  qrToken?: string;
  orderNumber?: string;
  /** The person who paid, shown when they are not the person on the ticket. */
  purchaserName?: string;
}

const PAGE_W = 210;
const PAGE_H = 95;
const LEFT = 10;
const PANEL_W = 130;
const SEP_X = 147;
const STUB_CX = 176;
const TOP_BAND = 10;
const BOTTOM_BAND = 6.5;

const BG: [number, number, number] = [11, 11, 11];
const LIME: [number, number, number] = [193, 255, 26];
const WHITE: [number, number, number] = [255, 255, 255];
const GREY: [number, number, number] = [150, 150, 150];
const SUPPORT_EMAIL = 'hilistreaming.co@gmail.com';

/** jsPDF's built-in fonts only cover Latin-1; anything else would print as garbage. */
export function pdfSafe(text: string | undefined | null): string {
  return (text ?? '')
    .normalize('NFC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, (ch) => {
      const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return /^[\u0020-\u007E]+$/.test(base) ? base : '?';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatTicketDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .replace(',', '');
}

export function formatTicketTime(time?: string): string {
  if (!time) return '';
  const [h, min] = time.split(':');
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return '';
  return `${hour % 12 || 12}:${(min || '00').slice(0, 2)} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/** "A07" -> { row: "A", seat: "07", label: "A07" }. The padding matches the numbers on the cinema blueprint. */
export function splitSeat(label?: string | null): { row: string; seat: string; label: string } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(label || '');
  return m ? { row: m[1].toUpperCase(), seat: m[2], label: `${m[1].toUpperCase()}${m[2]}` } : null;
}

// Shrinks the font until the text fits; as a last resort cuts it with "...".
function fitText(doc: jsPDF, text: string, maxWidth: number, start: number, min: number): string {
  let size = start;
  doc.setFontSize(size);
  while (size > min && doc.getTextWidth(text) > maxWidth) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  let out = text;
  while (out.length > 1 && doc.getTextWidth(out) > maxWidth) out = out.slice(0, -1);
  return out === text ? text : `${out.trimEnd()}...`;
}

function label(doc: jsPDF, text: string, x: number, y: number, align: 'left' | 'center' | 'right' = 'left') {
  doc.setTextColor(...LIME);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text(text, x, y, { align });
}

function value(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, size = 11, color = WHITE) {
  doc.setTextColor(...color);
  doc.setFont('helvetica', 'bold');
  doc.text(fitText(doc, text, maxWidth, size, 7), x, y);
}

export async function generateTicketPDF(tickets: TicketData[]): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PAGE_W, PAGE_H] });

  for (let i = 0; i < tickets.length; i++) {
    if (i > 0) doc.addPage([PAGE_W, PAGE_H], 'landscape');
    const t = tickets[i];

    const eventName = pdfSafe(t.eventName).toUpperCase() || 'EVENT';
    const attendee = pdfSafe(t.attendeeName).toUpperCase();
    const venue = pdfSafe(t.venue).toUpperCase();
    const city = pdfSafe(t.city);
    const tier = pdfSafe(t.ticketType);
    const seat = splitSeat(t.seatLabel);
    const dateText = formatTicketDate(t.eventDate).toUpperCase();
    const timeText = formatTicketTime(t.startTime);

    // Background and top / bottom bands
    doc.setFillColor(...BG);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
    doc.setFillColor(...LIME);
    doc.rect(0, 0, PAGE_W, TOP_BAND, 'F');
    doc.rect(0, PAGE_H - BOTTOM_BAND, PAGE_W, BOTTOM_BAND, 'F');

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('HILI', LEFT, 6.7);
    doc.setFontSize(7);
    doc.text(seat ? 'CINEMA TICKET  |  ADMIT ONE' : 'ADMIT ONE', PAGE_W - LEFT, 6.7, { align: 'right' });

    // Tear line with notches
    doc.setDrawColor(...GREY);
    doc.setLineWidth(0.3);
    doc.setLineDash([1.6, 1.6]);
    doc.line(SEP_X, TOP_BAND + 3, SEP_X, PAGE_H - BOTTOM_BAND - 3);
    doc.setLineDash([]);
    doc.setFillColor(...BG);
    doc.circle(SEP_X, TOP_BAND, 3, 'F');
    doc.circle(SEP_X, PAGE_H - BOTTOM_BAND, 3, 'F');

    // ── Left panel ───────────────────────────────────────────────────────
    label(doc, 'EVENT', LEFT, 18);

    // Event name: biggest size that fits on at most two lines
    let titleSize = 26;
    let titleLines: string[] = [];
    doc.setFont('helvetica', 'bold');
    for (const size of [26, 24, 22, 20, 18, 16]) {
      doc.setFontSize(size);
      titleSize = size;
      titleLines = doc.splitTextToSize(eventName, PANEL_W) as string[];
      // one line can be big; two lines stay compact so everything below still fits
      if (titleLines.length === 1 || (titleLines.length === 2 && size <= 20)) break;
    }
    if (titleLines.length > 2) {
      titleLines = [titleLines[0], `${titleLines[1].slice(0, -3).trimEnd()}...`];
    }
    const lineH = titleSize * 0.3528 * 1.15;
    doc.setFontSize(titleSize);
    doc.setTextColor(...WHITE);
    titleLines.forEach((line, n) => doc.text(line, LEFT, 22 + titleSize * 0.3528 * 0.85 + n * lineH));
    const infoTop = 22 + titleLines.length * lineH + 5;

    const col2 = LEFT + 68;
    const colW = 62;

    // Date and time
    label(doc, 'DATE', LEFT, infoTop);
    value(doc, dateText || 'TO BE ANNOUNCED', LEFT, infoTop + 5.4, colW);
    label(doc, 'TIME', col2, infoTop);
    value(doc, timeText || '-', col2, infoTop + 5.4, colW);

    // Venue (with city)
    const row2 = infoTop + 13;
    label(doc, 'VENUE', LEFT, row2);
    value(doc, [venue, city.toUpperCase()].filter(Boolean).join(', ') || '-', LEFT, row2 + 5.4, PANEL_W);

    // Who and where they sit
    const row3 = row2 + 13;
    label(doc, 'ATTENDEE', LEFT, row3);
    value(doc, attendee || '-', LEFT, row3 + 6, 64, 13);

    if (seat) {
      label(doc, 'SEAT', col2, row3);
      doc.setTextColor(...LIME);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.text(seat.label, col2, row3 + 9);
      doc.setTextColor(...GREY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`ROW ${seat.row}  |  SEAT ${seat.seat}`, col2 + 24, row3 + 8.6);
    } else {
      label(doc, 'TICKET', col2, row3);
      value(doc, (tier || 'General admission').toUpperCase(), col2, row3 + 6, colW, 13);
    }

    // Small print
    const bookedBy = pdfSafe(t.purchaserName);
    const small: string[] = [];
    if (bookedBy && bookedBy.toLowerCase() !== pdfSafe(t.attendeeName).toLowerCase()) small.push(`Booked by ${bookedBy}`);
    if (t.orderNumber) small.push(`Order ${pdfSafe(t.orderNumber)}`);
    if (small.length) {
      doc.setTextColor(...GREY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(small.join('   |   '), LEFT, PAGE_H - BOTTOM_BAND - 3.2);
    }

    // ── Stub: QR code ─────────────────────────────────────────────────────
    doc.setFillColor(...WHITE);
    doc.roundedRect(STUB_CX - 23, 17, 46, 46, 2.5, 2.5, 'F');
    try {
      const qr = await QRCode.toDataURL(t.qrToken || t.ticketNumber, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 480,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      doc.addImage(qr, 'PNG', STUB_CX - 20.5, 19.5, 41, 41);
    } catch (err) {
      console.error('QR generation error:', err);
    }

    doc.setTextColor(...LIME);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('SCAN AT ENTRY', STUB_CX, 68, { align: 'center' });

    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    const numberText = fitText(doc, pdfSafe(t.ticketNumber), 46, 15, 9);
    doc.text(numberText, STUB_CX, 76, { align: 'center' });

    doc.setFontSize(7.5);
    doc.setTextColor(...(seat ? LIME : GREY));
    doc.text(seat ? `SEAT ${seat.label}` : fitText(doc, (tier || '').toUpperCase(), 46, 7.5, 6), STUB_CX, 82, { align: 'center' });

    // ── Bottom band ──────────────────────────────────────────────────────
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text(`Support: ${SUPPORT_EMAIL}   |   Bring this ticket and a valid ID`, LEFT, PAGE_H - 2.4);
    doc.text('One person only  |  Non-transferable', PAGE_W - LEFT, PAGE_H - 2.4, { align: 'right' });
  }

  return doc.output('blob');
}

// ── Email helpers (the Prestige team sends tickets from Gmail by hand) ─────────

export function ticketFilename(eventName: string, orderNumber: string): string {
  const clean = pdfSafe(eventName).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'Event';
  return `${clean}-Tickets-${orderNumber.replace(/[^a-zA-Z0-9-]/g, '')}.pdf`;
}

export function ticketEmailSubject(eventName: string): string {
  return `Your tickets for ${eventName}`;
}

export function ticketEmailBody(opts: {
  purchaserName: string;
  eventName: string;
  eventDate?: string;
  startTime?: string;
  venue?: string;
  tickets: Array<Pick<TicketData, 'ticketNumber' | 'attendeeName' | 'seatLabel'>>;
}): string {
  const when = [formatTicketDate(opts.eventDate), formatTicketTime(opts.startTime)].filter(Boolean).join(' at ');
  const lines = opts.tickets.map((t) =>
    `- ${t.seatLabel ? `Seat ${t.seatLabel}: ` : ''}${t.attendeeName} (ticket ${t.ticketNumber})`,
  );
  return [
    `Hi ${opts.purchaserName},`,
    '',
    `Thank you for booking ${opts.eventName}. Your payment has been confirmed and your ticket${opts.tickets.length > 1 ? 's are' : ' is'} attached to this email as a PDF.`,
    '',
    ...(when || opts.venue ? [[when, opts.venue].filter(Boolean).join(' | '), ''] : []),
    ...lines,
    '',
    'Please bring the ticket (printed or on your phone) and a valid ID. Each ticket is valid for one person only.',
    '',
    `Questions? Reply to this email or write to ${SUPPORT_EMAIL}.`,
    '',
    'See you there,',
    'The Hili team',
  ].join('\n');
}

export function gmailComposeUrl(to: string, subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
