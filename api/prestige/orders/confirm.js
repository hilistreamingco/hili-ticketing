import { createClient } from '@supabase/supabase-js';

function parseJWT(token) {
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

function getAuthedUser(authHeader) {
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

export default async function handler(req, res) {
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
    const user = getAuthedUser(req.headers.authorization);
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

    // Get order and items
    const { data: order } = await supabase
      .from('orders')
      .select('*, order_items(*, ticket_type:ticket_types(*)), event:events(*)')
      .eq('id', orderId)
      .single();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if already confirmed
    if (order.status === 'confirmed' || order.status === 'paid') {
      return res.json({ success: true, message: 'Payment was already confirmed' });
    }

    // Get next ticket number
    const { data: seqData } = await supabase
      .from('ticket_number_seq')
      .select('last_number')
      .eq('event_id', order.event_id)
      .single();

    let nextNumber = (seqData?.last_number || 0) + 1;

    // Generate tickets for each item
    const tickets = [];
    for (const item of order.order_items) {
      const attendeeNames = item.attendee_names || [order.purchaser_name];
      
      for (const attendeeName of attendeeNames) {
        const ticketNumber = `SBTB${String(nextNumber).padStart(3, '0')}`;
        nextNumber++;

        tickets.push({
          order_id: order.id,
          ticket_type_id: item.ticket_type_id,
          attendee_name: attendeeName,
          ticket_number: ticketNumber,
          event_id: order.event_id,
        });
      }
    }

    // Insert tickets
    await supabase.from('tickets').insert(tickets);

    // Update sequence
    await supabase
      .from('ticket_number_seq')
      .upsert({
        event_id: order.event_id,
        last_number: nextNumber - 1,
      });

    // Update order status
    await supabase
      .from('orders')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.uid,
      })
      .eq('id', orderId);

    return res.json({ success: true, message: 'Payment confirmed and tickets generated' });
  } catch (error) {
    console.error('Confirm payment error:', error);
    return res.status(400).json({ error: error.message || 'Could not confirm payment' });
  }
}
