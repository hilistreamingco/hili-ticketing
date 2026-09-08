import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'crypto';

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

    // Get order with items
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, order_items(*, ticket_type:ticket_types(name)), event:events(id, name, slug)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if already confirmed
    if (order.status === 'confirmed' || order.status === 'paid') {
      return res.json({ success: true, already_confirmed: true });
    }

    // Get next ticket number from sequence
    const { data: seqData } = await supabase.rpc('nextval', { sequence_name: 'ticket_number_seq' });
    const startingNumber = seqData || 1;

    // Generate tickets for each attendee
    const orderItems = order.order_items as any[];
    const tickets = [];
    let ticketIndex = 0;

    for (const item of orderItems) {
      const attendeeNames = item.attendee_names || [];
      for (let i = 0; i < attendeeNames.length; i++) {
        const ticketNumber = `SBTB${String(startingNumber + ticketIndex).padStart(3, '0')}`;
        tickets.push({
          order_id: orderId,
          event_id: (order.event as any).id,
          ticket_type_id: item.ticket_type_id,
          attendee_name: attendeeNames[i] || 'Guest',
          ticket_number: ticketNumber,
          attendee_index: i,
        });
        ticketIndex++;
      }
    }

    // Insert tickets
    const { error: ticketsError } = await supabase
      .from('tickets')
      .insert(tickets);

    if (ticketsError) {
      console.error('Tickets creation error:', ticketsError);
      return res.status(500).json({ error: 'Failed to generate tickets' });
    }

    // Update order status
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.uid,
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Order update error:', updateError);
    }

    // Create audit log
    await supabase
      .from('audit_log')
      .insert({
        order_id: orderId,
        action: 'payment_confirmed',
        actor_id: user.uid,
        actor_email: user.email,
        metadata: { ticket_count: tickets.length },
      });

    return res.json({ 
      success: true, 
      message: `Payment confirmed and ${tickets.length} ticket(s) generated`,
      ticketCount: tickets.length 
    });
  } catch (error: any) {
    console.error('Confirm payment error:', error);
    return res.status(500).json({ error: error.message || 'Could not confirm payment' });
  }
}
