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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = getAuthedUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Handle POST actions (confirm, send, notFound)
    if (req.method === 'POST') {
      const { action, orderId, note } = req.body || {};

      if (action === 'confirm') {
        // Get order and items
        const { data: order } = await supabase
          .from('orders')
          .select('*, order_items(*, ticket_type:ticket_types(*)), event:events(*)')
          .eq('id', orderId)
          .single();

        if (!order) return res.status(404).json({ error: 'Order not found' });
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

        // Generate tickets
        const tickets = [];
        for (const item of order.order_items) {
          const attendeeNames = item.attendee_names || [order.purchaser_name];
          for (const attendeeName of attendeeNames) {
            tickets.push({
              order_id: order.id,
              ticket_type_id: item.ticket_type_id,
              attendee_name: attendeeName,
              ticket_number: `SBTB${String(nextNumber++).padStart(3, '0')}`,
              event_id: order.event_id,
            });
          }
        }

        await supabase.from('tickets').insert(tickets);
        await supabase.from('ticket_number_seq').upsert({
          event_id: order.event_id,
          last_number: nextNumber - 1,
        });
        await supabase.from('orders').update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: user.uid,
        }).eq('id', orderId);

        return res.json({ success: true, message: 'Payment confirmed and tickets generated' });
      }

      if (action === 'send') {
        const { data: order } = await supabase
          .from('orders')
          .select('*, tickets(*)')
          .eq('id', orderId)
          .single();

        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (!order.tickets || order.tickets.length === 0) {
          return res.status(400).json({ error: 'No tickets found. Confirm payment first.' });
        }
        if (order.fulfillment_status === 'sent') {
          return res.json({ success: true, message: 'Ticket was already sent' });
        }

        // TODO: Send email with tickets
        await supabase.from('orders').update({
          fulfillment_status: 'sent',
          fulfilled_at: new Date().toISOString(),
          fulfilled_by: user.uid,
        }).eq('id', orderId);

        return res.json({ 
          success: true, 
          message: `Ticket${order.tickets.length > 1 ? 's' : ''} sent successfully` 
        });
      }

      if (action === 'notFound') {
        await supabase.from('orders').update({
          status: 'cancelled',
          cancellation_reason: note || 'Payment not found',
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.uid,
        }).eq('id', orderId);

        return res.json({ success: true, message: 'Order marked as payment not found' });
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    // Handle GET requests
    const { status, fulfillment, orderId } = req.query;

    // If orderId is provided, return single order
    if (orderId) {
      const { data: order, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items!inner (
            *,
            ticket_type:ticket_types (*)
          ),
          event:events (*),
          tickets (*)
        `)
        .eq('id', orderId)
        .single();

      if (error) {
        console.error('[Orders] Single order error:', error);
        return res.status(404).json({ error: 'Order not found', details: error.message });
      }

      return res.json({ order });
    }

    // Otherwise return list of orders
    let query = supabase
      .from('orders')
      .select('*, order_items(*), event:events(name)')
      .order('created_at', { ascending: false });

    // Filter by status
    if (status === 'pending') {
      query = query.in('status', ['pending', 'processing']);
    } else if (status === 'confirmed') {
      query = query.in('status', ['confirmed', 'paid']);
      if (fulfillment) {
        query = query.eq('fulfillment_status', fulfillment);
      }
    } else if (status === 'sent') {
      query = query.in('status', ['confirmed', 'paid']).eq('fulfillment_status', 'sent');
    }

    const { data: orders, error } = await query;

    if (error) throw error;

    return res.json({ orders: orders || [] });
  } catch (error) {
    console.error('List orders error:', error);
    return res.status(500).json({ error: error.message || 'Could not load orders' });
  }
}
