export interface TicketEmailData {
  ticketNumber: string;
  attendeeName: string;
  eventName: string;
  eventDate: string;
  ticketTier: string;
  posterUrl?: string;
  venue?: string;
  ticketId?: string;
}

export function ticketEmailHtml(ticket: TicketEmailData) {
  // Generate QR code URL for the ticket number
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(ticket.ticketNumber)}`;
  
  const venue = ticket.venue || 'VENUE TBA';
  const ticketId = ticket.ticketId || '';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(ticket.eventName)} - Ticket</title>
</head>
<body style="margin:0;padding:0;background:#0b0b0b;font-family:Arial,sans-serif;">
  <div style="max-width:700px;margin:40px auto;padding:0;">
    <!-- Ticket Container -->
    <div style="background:#0b0b0b;color:#fff;border:2px solid #c6d400;position:relative;">
      
      <!-- Header Bar -->
      <div style="background:#c6d400;padding:8px 24px;">
        <p style="margin:0;color:#0b0b0b;font-size:13px;font-weight:bold;letter-spacing:1px;">HILI × BEERBIRDS</p>
      </div>
      
      <!-- Main Content -->
      <div style="display:flex;border-bottom:2px dashed #555;">
        
        <!-- Left Side: Event Details -->
        <div style="flex:1;padding:40px 24px;border-right:2px dashed #555;">
          <h1 style="margin:0 0 16px;font-size:42px;line-height:1.1;font-weight:bold;text-transform:uppercase;">${escapeHtml(ticket.eventName)}</h1>
          
          <div style="margin:32px 0;">
            <p style="margin:0 0 4px;font-size:11px;color:#c6d400;letter-spacing:1px;">DATE</p>
            <p style="margin:0;font-size:18px;font-weight:bold;">${escapeHtml(ticket.eventDate)}</p>
          </div>
          
          <div style="margin:24px 0;">
            <p style="margin:0 0 4px;font-size:11px;color:#c6d400;letter-spacing:1px;">VENUE</p>
            <p style="margin:0;font-size:18px;font-weight:bold;">${escapeHtml(venue)}</p>
          </div>
          
          <div style="margin:24px 0;">
            <p style="margin:0 0 4px;font-size:11px;color:#c6d400;letter-spacing:1px;">TIER</p>
            <p style="margin:0;font-size:18px;font-weight:bold;text-transform:uppercase;">${escapeHtml(ticket.ticketTier)}</p>
          </div>
          
          <div style="margin:24px 0;">
            <p style="margin:0 0 4px;font-size:11px;color:#c6d400;letter-spacing:1px;">ATTENDEE</p>
            <p style="margin:0;font-size:18px;font-weight:bold;text-transform:uppercase;">${escapeHtml(ticket.attendeeName)}</p>
          </div>
          
          <p style="margin:32px 0 0;font-size:11px;color:#999;">ADMIT ONE • REDEEMABLE AT ${escapeHtml(venue)}</p>
        </div>
        
        <!-- Right Side: QR Code -->
        <div style="width:280px;padding:40px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <div style="background:#c6d400;padding:16px;border-radius:8px;display:inline-block;">
            <img src="${qrCodeUrl}" alt="Ticket QR Code" style="display:block;width:200px;height:200px;" />
          </div>
          <p style="margin:16px 0 4px;font-size:11px;color:#c6d400;letter-spacing:1px;">SCAN AT ENTRY</p>
          <p style="margin:0;font-size:22px;font-weight:bold;color:#c6d400;letter-spacing:2px;">${escapeHtml(ticket.ticketNumber)}</p>
        </div>
        
      </div>
      
      <!-- Footer: Ticket ID -->
      <div style="padding:12px 24px;background:#000;">
        <p style="margin:0;font-size:10px;color:#666;font-family:monospace;">ID ${escapeHtml(ticketId)}</p>
      </div>
      
    </div>
    
    <!-- Instructions -->
    <div style="padding:24px;text-align:center;">
      <p style="margin:0 0 8px;color:#999;font-size:14px;">Please present this ticket (digital or printed) at the venue entrance.</p>
      <p style="margin:0;color:#666;font-size:12px;">For support, contact: support@hilitickets.com</p>
    </div>
    
  </div>
</body>
</html>
  `.trim();
}

export async function sendTicketEmail(recipient: string, ticket: TicketEmailData) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Email delivery is not configured");
  
  // Subject line uses the event name as requested
  const subject = `${ticket.eventName} - Your Ticket`;
  
  const response = await fetch("https://api.resend.com/emails", { 
    method: "POST", 
    headers: { 
      Authorization: `Bearer ${apiKey}`, 
      "Content-Type": "application/json" 
    }, 
    body: JSON.stringify({ 
      from, 
      to: [recipient], 
      subject,
      html: ticketEmailHtml(ticket) 
    }) 
  });
  
  if (!response.ok) throw new Error(`Email delivery failed with status ${response.status}`);
  return response.json() as Promise<{ id: string }>;
}

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character); }
