import jsPDF from 'jspdf';
import QRCode from 'qrcode';

export interface TicketData {
  ticketNumber: string;
  attendeeName: string;
  eventName: string;
  ticketType: string;
  eventDate?: string;
  eventVenue?: string;
}

export async function generateTicketPDF(tickets: TicketData[]): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  for (let i = 0; i < tickets.length; i++) {
    if (i > 0) doc.addPage();

    const ticket = tickets[i];

    // Background
    doc.setFillColor(17, 17, 17); // #111
    doc.rect(0, 0, 210, 297, 'F');

    // Title bar
    doc.setFillColor(193, 255, 26); // #c1ff1a
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('HILI TICKET', 105, 13, { align: 'center' });

    // Event name
    doc.setTextColor(193, 255, 26);
    doc.setFontSize(24);
    doc.text(ticket.eventName, 105, 40, { align: 'center' });

    // Ticket number (prominent)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont('courier', 'bold');
    doc.text(ticket.ticketNumber, 105, 60, { align: 'center' });

    // Attendee name
    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.text(ticket.attendeeName, 105, 75, { align: 'center' });

    // Ticket type
    doc.setTextColor(193, 255, 26);
    doc.setFontSize(14);
    doc.text(ticket.ticketType, 105, 85, { align: 'center' });

    // QR Code (fake for now)
    try {
      const qrDataUrl = await QRCode.toDataURL(ticket.ticketNumber, {
        width: 200,
        margin: 2,
        color: {
          dark: '#c1ff1a',
          light: '#111111',
        },
      });
      doc.addImage(qrDataUrl, 'PNG', 55, 100, 100, 100);
    } catch (err) {
      console.error('QR generation error:', err);
    }

    // Footer
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('Present this ticket at the entrance', 105, 220, { align: 'center' });
    doc.setTextColor(150, 150, 150);
    doc.text('Powered by HILI', 105, 230, { align: 'center' });

    // Event details (if available)
    if (ticket.eventDate || ticket.eventVenue) {
      doc.setFontSize(10);
      doc.setTextColor(200, 200, 200);
      let yPos = 245;
      if (ticket.eventDate) {
        doc.text(`Date: ${ticket.eventDate}`, 105, yPos, { align: 'center' });
        yPos += 6;
      }
      if (ticket.eventVenue) {
        doc.text(`Venue: ${ticket.eventVenue}`, 105, yPos, { align: 'center' });
      }
    }
  }

  return doc.output('blob');
}

export function openGmailWithTickets(
  recipientEmail: string,
  recipientName: string,
  eventName: string,
  ticketBlob: Blob
) {
  // Create a download link for the ticket PDF
  const url = URL.createObjectURL(ticketBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tickets-${eventName.replace(/\s+/g, '-')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);

  // Gmail compose URL with pre-filled message
  const subject = encodeURIComponent(`Your ${eventName} Tickets`);
  const body = encodeURIComponent(
    `Hey ${recipientName},\n\nThank you for trusting HILI X BEERBIRDS!\n\nYour tickets for ${eventName} are attached to this email.\n\nSee you at the event!\n\n- HILI Team`
  );

  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${recipientEmail}&su=${subject}&body=${body}`;

  // Open Gmail in new tab
  window.open(gmailUrl, '_blank');
}
