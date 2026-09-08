import express from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json());

// Lazy-load Supabase client (only when needed)
let supabaseClient: any = null;
function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return supabaseClient;
}

// Auth helper
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

function getAuthedUser(authHeader?: string) {
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

// Prestige Stats
app.get('/api/prestige/stats', async (req, res) => {
  try {
    const user = getAuthedUser(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = getSupabase();
    const { data: orders } = await supabase.from('orders').select('status, amount_kes, fulfillment_status');

    const stats = {
      totalOrders: orders?.length || 0,
      pendingOrders: orders?.filter((o: any) => o.status === 'pending' || o.status === 'processing').length || 0,
      confirmedOrders: orders?.filter((o: any) => o.status === 'confirmed' || o.status === 'paid').length || 0,
      sentOrders: orders?.filter((o: any) => o.fulfillment_status === 'sent').length || 0,
      totalRevenue: orders?.reduce((sum: number, o: any) => sum + (o.amount_kes || 0), 0) || 0,
    };

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Prestige Orders (GET list or single, POST actions)
app.all('/api/prestige/orders', async (req, res) => {
  try {
    const user = getAuthedUser(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = getSupabase();

    // POST actions
    if (req.method === 'POST') {
      const { action, orderId, note } = req.body;

      if (action === 'confirm') {
        const { data: order } = await supabase
          .from('orders')
          .select('*, order_items(*, ticket_type:ticket_types(*)), event:events(*)')
          .eq('id', orderId)
          .single();

        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.status === 'confirmed' || order.status === 'paid') {
          return res.json({ success: true, message: 'Already confirmed' });
        }

        const { data: seqData } = await supabase
          .from('ticket_number_seq')
          .select('last_number')
          .eq('event_id', order.event_id)
          .single();

        let nextNumber = (seqData?.last_number || 0) + 1;
        const tickets = [];
        
        for (const item of order.order_items) {
          const attendeeNames = item.attendee_names || [order.purchaser_name];
          for (const name of attendeeNames) {
            tickets.push({
              order_id: order.id,
              ticket_type_id: item.ticket_type_id,
              attendee_name: name,
              ticket_number: `SBTB${String(nextNumber++).padStart(3, '0')}`,
              event_id: order.event_id,
            });
          }
        }

        await supabase.from('tickets').insert(tickets);
        await supabase.from('ticket_number_seq').upsert({ event_id: order.event_id, last_number: nextNumber - 1 });
        await supabase.from('orders').update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: user.uid,
        }).eq('id', orderId);

        return res.json({ success: true, message: 'Payment confirmed' });
      }

      if (action === 'send') {
        const { data: order } = await supabase.from('orders').select('*, tickets(*)').eq('id', orderId).single();
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (!order.tickets?.length) return res.status(400).json({ error: 'No tickets' });
        if (order.fulfillment_status === 'sent') return res.json({ success: true, message: 'Already sent' });

        await supabase.from('orders').update({
          fulfillment_status: 'sent',
          fulfilled_at: new Date().toISOString(),
          fulfilled_by: user.uid,
        }).eq('id', orderId);

        return res.json({ success: true, message: 'Ticket sent' });
      }

      if (action === 'notFound') {
        await supabase.from('orders').update({
          status: 'cancelled',
          cancellation_reason: note || 'Payment not found',
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.uid,
        }).eq('id', orderId);

        return res.json({ success: true, message: 'Marked not found' });
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    // GET single order
    const { orderId } = req.query;
    if (orderId) {
      const { data: order, error } = await supabase
        .from('orders')
        .select('*, order_items(*, ticket_type:ticket_types(*)), event:events(*), tickets(*)')
        .eq('id', orderId)
        .single();

      if (error) return res.status(404).json({ error: 'Not found' });
      return res.json({ order });
    }

    // GET list
    const { status, fulfillment } = req.query;
    let query = supabase.from('orders').select('*, order_items(*), event:events(name)').order('created_at', { ascending: false });

    if (status === 'pending') query = query.in('status', ['pending', 'processing']);
    else if (status === 'confirmed') {
      query = query.in('status', ['confirmed', 'paid']);
      if (fulfillment) query = query.eq('fulfillment_status', fulfillment);
    }
    else if (status === 'sent') query = query.in('status', ['confirmed', 'paid']).eq('fulfillment_status', 'sent');

    const { data: orders } = await query;
    res.json({ orders: orders || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Export for Vercel
export default app;
