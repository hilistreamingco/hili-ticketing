import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

function parseJWT(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function getAuthedUser(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const payload = parseJWT(authHeader.slice(7));
  if (!payload?.email) return null;
  
  const email = payload.email.toLowerCase();
  const prestigeEmails = (process.env.PRESTIGE_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  
  if (adminEmails.includes(email) || prestigeEmails.includes(email)) {
    return { uid: payload.sub || '', email };
  }
  return null;
}

async function sendTicketEmail(toEmail: string, ticket: any) {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  
  if (!resendKey) {
    console.warn('RESEND_API_KEY not set, skipping email');
    return;
  }

  const resend = new Resend(resendKey);
  
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${ticket.qr_token}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #FFD700; margin: 0; font-size: 32px;">🎟️ Your Ticket</h1>
        <h2 style="color: #fff; margin: 10px 0 0 0; font-size: 24px;">${ticket.eventName}</h2>
      </div>
      
      <div style="background: #1a1a1a; border: 2px solid #FFD700; border-radius: 12px; padding: 30px; margin: 20px 0;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${qrUrl}" alt="QR Code" style="width: 200px; height: 200px; border: 3px solid #FFD700; border-radius: 8px;" />
        </div>
        
        <table style="width: 100%; color: #fff; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #FFD700; font-weight: bold;">Ticket Number:</td><td style="padding: 8px 0; text-align: right; font-family: monospace; font-size: 16px;">${ticket.ticketNumber}</td></tr>
          <tr><td style="padding: 8px 0; color: #FFD700; font-weight: bold;">Attendee:</td><td style="padding: 8px 0; text-align: right;">${ticket.attendeeName}</td></tr>
          <tr><td style="padding: 8px 0; color: #FFD700; font-weight: bold;">Ticket Type:</td><td style="padding: 8px 0; text-align: right;">${ticket.ticketTier || 'General'}</td></tr>
          ${ticket.eventDate ? `<tr><td style="padding: 8px 0; color: #FFD700; font-weight: bold;">Date:</td><td style="padding: 8px 0; text-align: right;">${new Date(ticket.eventDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</td></tr>` : ''}
          ${ticket.venue ? `<tr><td style="padding: 8px 0; color: #FFD700; font-weight: bold;">Venue:</td><td style="padding: 8px 0; text-align: right;">${ticket.venue}</td></tr>` : ''}
        </table>
      </div>
      
      <div style="text-align: center; margin-top: 30px; color: #888; font-size: 12px;">
        <p>Present this QR code at the entrance for check-in</p>
        <p style="margin-top: 20px;">Questions? Contact us at ${fromEmail}</p>
      </div>
    </div>
  `;

  await resend.emails.send({
    from: fromEmail,
    to: toEmail,
    subject: `Your Ticket for ${ticket.eventName} - ${ticket.ticketNumber}`,
    html,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = getAuthedUser(req.headers.authorization as string);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Get order with tickets
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, tickets(*, event:events(name, event_date, venue), ticket_type:ticket_types(name))')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const tickets = order.tickets as any[];
    if (!tickets || tickets.length === 0) {
      return res.status(400).json({ error: 'No tickets found. Confirm payment first.' });
    }

    // Send email for each ticket
    for (const ticket of tickets) {
      const event = ticket.event;
      const ticketType = ticket.ticket_type;
      
      await sendTicketEmail(order.purchaser_email, {
        ticketNumber: ticket.ticket_number,
        attendeeName: ticket.attendee_name,
        eventName: event?.name || 'Hili Event',
        eventDate: event?.event_date,
        ticketTier: ticketType?.name,
        venue: event?.venue,
        qr_token: ticket.qr_token,
      });
    }

    // Update fulfillment status
    await supabase
      .from('orders')
      .update({
        fulfillment_status: 'sent',
        sent_at: new Date().toISOString(),
        sent_by: user.uid,
      })
      .eq('id', orderId);

    // Create audit log
    await supabase
      .from('audit_log')
      .insert({
        order_id: orderId,
        action: 'tickets_sent',
        actor_id: user.uid,
        actor_email: user.email,
        metadata: { ticket_count: tickets.length },
      });

    return res.json({ 
      success: true, 
      message: `${tickets.length} ticket(s) sent successfully` 
    });
  } catch (error: any) {
    console.error('Send ticket error:', error);
    return res.status(500).json({ error: error.message || 'Could not send ticket' });
  }
}
