import jsPDF from 'jspdf';
import QRCode from 'qrcode';

export interface TicketData {
  ticketNumber: string;
  attendeeName: string;
  eventName: string;
  ticketType: string;
  eventDate?: string;
  eventVenue?: string;
  orderId?: string;
}

export async function generateTicketPDF(tickets: TicketData[]): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [297, 105], // Ticket-like dimensions
  });

  for (let i = 0; i < tickets.length; i++) {
    if (i > 0) doc.addPage();

    const ticket = tickets[i];

    // Background - Black
    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, 297, 105, 'F');

    // Top yellow strip
    doc.setFillColor(238, 236, 45); // #EEE22D (yellow)
    doc.rect(0, 0, 297, 8, 'F');

    // Small HILI x BEERBIRDS text on yellow strip
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('HILI x BEERBIRDS', 5, 5);

    // Vertical dashed line
    doc.setLineDash([2, 2]);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(195, 0, 195, 105);
    doc.setLineDash([]);

    // === LEFT SECTION ===
    
    // Event name - Large white text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    const eventLines = doc.splitTextToSize(ticket.eventName.toUpperCase(), 180);
    doc.text(eventLines, 10, 25);

    // Event subtitle - use ticket type description or default
    const subtitleY = eventLines.length > 1 ? 45 : 38;
    doc.setFontSize(16);
    // Remove hardcoded subtitle
    // doc.text('FINAL WATCH PARTY', 10, subtitleY);

    // Date section
    doc.setTextColor(238, 236, 45);
    doc.setFontSize(8);
    doc.text('DATE', 10, subtitleY + 14);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(ticket.eventDate || '19 JULY 2026', 10, subtitleY + 20);

    // Venue section
    doc.setTextColor(238, 236, 45);
    doc.setFontSize(8);
    doc.text('VENUE', 70, subtitleY + 14);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(ticket.eventVenue?.toUpperCase() || 'BEERBIRDS, PRESTIGE', 70, subtitleY + 20);

    // Tier section
    doc.setTextColor(238, 236, 45);
    doc.setFontSize(8);
    doc.text('TIER', 10, subtitleY + 30);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(ticket.ticketType.toUpperCase(), 10, subtitleY + 36);

    // Attendee section
    doc.setTextColor(238, 236, 45);
    doc.setFontSize(8);
    doc.text('ATTENDEE', 70, subtitleY + 30);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(ticket.attendeeName.toUpperCase(), 70, subtitleY + 36);

    // Bottom note
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(7);
    doc.text('ADMIT ONE • REDEEMABLE AT BEERBIRDS, PRESTIGE', 10, 95);

    // ID at bottom
    if (ticket.orderId) {
      doc.setFontSize(6);
      doc.setTextColor(80, 80, 80);
      doc.text(`ID ${ticket.orderId}`, 10, 101);
    }

    // === RIGHT SECTION - QR CODE ===
    
    // QR Code with yellow background
    doc.setFillColor(238, 236, 45);
    doc.rect(205, 18, 80, 80, 'F');

    try {
      const qrDataUrl = await QRCode.toDataURL(ticket.ticketNumber, {
        width: 300,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#EEE22D',
        },
      });
      doc.addImage(qrDataUrl, 'PNG', 210, 23, 70, 70);
    } catch (err) {
      console.error('QR generation error:', err);
    }

    // "SCAN AT ENTRY" text
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('SCAN AT ENTRY', 245, 96, { align: 'center' });

    // Ticket number below QR - make it more prominent
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(ticket.ticketNumber || 'SBTB001', 245, 101, { align: 'center' });

    // Bottom yellow strip
    doc.setFillColor(238, 236, 45);
    doc.rect(0, 97, 297, 8, 'F');
  }

  return doc.output('blob');
}

export function openGmailWithTickets(
  recipientEmail: string,
  recipientName: string,
  eventName: string,
  ticketBlob: Blob,
  tickets: TicketData[]
) {
  // Create filename: "PersonName-SBTB001.pdf" or "PersonName-SBTB001-SBTB002.pdf"
  const ticketNumbers = tickets.map(t => t.ticketNumber).join('-');
  const sanitizedName = recipientName.replace(/[^a-zA-Z0-9]/g, '');
  const filename = `${sanitizedName}-${ticketNumbers}.pdf`;
  
  // Create a download link for the ticket PDF
  const url = URL.createObjectURL(ticketBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  // Gmail compose URL with pre-filled message
  const subject = encodeURIComponent(`Your "${eventName}" Tickets`);
  const body = encodeURIComponent(
    `Hey ${recipientName},\n\nThank you for trusting HILI X BEERBIRDS!\n\nYour tickets for ${eventName} are attached to this email.\n\nSee you at the event!\n\n- HILI Team`
  );

  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${recipientEmail}&su=${subject}&body=${body}`;

  // Open Gmail in new tab
  window.open(gmailUrl, '_blank');
}
