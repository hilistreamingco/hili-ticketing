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
    
    // Only count tickets from confirmed/paid orders
    const { data: tickets } = await supabase
      .from('tickets')
      .select('id, order:orders!inner(status)')
      .in('order.status', ['confirmed', 'paid']);

    const confirmedOrders = orders?.filter((o: any) => o.status === 'confirmed' || o.status === 'paid') || [];

    const stats = {
      totalOrders: orders?.length || 0,
      pendingOrders: orders?.filter((o: any) => o.status === 'pending' || o.status === 'processing').length || 0,
      confirmedOrders: confirmedOrders.length,
      sentOrders: orders?.filter((o: any) => o.fulfillment_status === 'sent').length || 0,
      totalRevenue: confirmedOrders.reduce((sum: number, o: any) => sum + (o.amount_kes || 0), 0),
      totalAttendees: tickets?.length || 0,
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

      console.log('POST /api/prestige/orders', { action, orderId, note, body: req.body });

      if (!action || !orderId) {
        return res.status(400).json({ error: 'Missing action or orderId', received: { action, orderId } });
      }

      if (action === 'confirm') {
        // Just confirm the payment - ticket generation is a separate step
        const { data: order } = await supabase
          .from('orders')
          .select('status')
          .eq('id', orderId)
          .single();

        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.status === 'confirmed' || order.status === 'paid') {
          return res.json({ success: true, message: 'Already confirmed' });
        }

        await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderId);
        return res.json({ success: true, message: 'Payment confirmed' });
      }

      if (action === 'generateTickets') {
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('*, order_items(*), event:events(*)')
          .eq('id', orderId)
          .single();

        if (orderError || !order) return res.status(404).json({ error: 'Order not found' });

        // Check if tickets already exist
        const { data: existingTickets } = await supabase
          .from('tickets')
          .select('id')
          .eq('order_id', orderId);

        if (existingTickets && existingTickets.length > 0) {
          return res.json({ success: true, message: 'Tickets already generated' });
        }

        // Get max ticket number across all tickets
        const { data: allTickets } = await supabase
          .from('tickets')
          .select('ticket_number');

        let nextNumber = 1;
        if (allTickets && allTickets.length > 0) {
          const maxNum = allTickets.reduce((max: number, t: any) => {
            const match = t.ticket_number?.match(/(\d+)$/);
            const num = match ? parseInt(match[1]) : 0;
            return Math.max(max, num);
          }, 0);
          nextNumber = maxNum + 1;
        }

        const items = order.order_items || [];
        const ticketsToInsert: any[] = [];

        if (items.length === 0) {
          ticketsToInsert.push({
            order_id: order.id,
            event_id: order.event_id,
            ticket_type_id: null,
            attendee_name: order.purchaser_name,
            attendee_index: 0,
            ticket_number: `SBTB${String(nextNumber++).padStart(3, '0')}`,
          });
        } else {
          for (const item of items) {
            const qty = item.quantity || 1;
            for (let idx = 0; idx < qty; idx++) {
              ticketsToInsert.push({
                order_id: order.id,
                event_id: order.event_id,
                ticket_type_id: item.ticket_type_id,
                attendee_name: item.attendee_names?.[idx] || order.purchaser_name,
                attendee_index: idx,
                ticket_number: `SBTB${String(nextNumber++).padStart(3, '0')}`,
              });
            }
          }
        }

        const { error: ticketError } = await supabase
          .from('tickets')
          .upsert(ticketsToInsert, { onConflict: 'order_id,ticket_type_id,attendee_index', ignoreDuplicates: true });

        if (ticketError) {
          console.error('Ticket insert error:', ticketError);
          return res.status(500).json({ error: 'Failed to generate tickets', detail: ticketError.message });
        }

        return res.json({ success: true, message: `${ticketsToInsert.length} ticket(s) generated` });
      }

      if (action === 'send') {
        // Just mark as sent - no ticket check needed, PDF was already generated client-side
        const { error: updateError } = await supabase.from('orders').update({
          fulfillment_status: 'sent',
        }).eq('id', orderId);

        if (updateError) {
          console.error('Update error:', updateError);
          return res.status(500).json({ error: 'Failed to update order' });
        }

        return res.json({ success: true, message: 'Marked as sent' });
      }

      if (action === 'notFound') {
        const { error: updateError } = await supabase.from('orders').update({
          status: 'cancelled',
        }).eq('id', orderId);

        if (updateError) {
          console.error('notFound update error:', updateError);
          return res.status(500).json({ error: 'Failed to update order' });
        }

        return res.json({ success: true, message: 'Marked not found' });
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    // GET single order
    const { orderId } = req.query;
    if (orderId) {
      const { data: order, error } = await supabase
        .from('orders')
        .select('*, order_items(*, ticket_type:ticket_types(*)), event:events(*), tickets(*, ticket_type:ticket_types(*))')
        .eq('id', orderId)
        .single();

      if (error) return res.status(404).json({ error: 'Not found' });
      // Map order_items to items for frontend compatibility
      const mapped = { ...order, items: order.order_items || [] };
      return res.json({ order: mapped });
    }

    // GET list
    const { status, fulfillment } = req.query;
    let query = supabase.from('orders').select('*, order_items(*, ticket_type:ticket_types(*)), event:events(name)').order('created_at', { ascending: false });

    if (status === 'pending') query = query.in('status', ['pending', 'processing']);
    else if (status === 'confirmed') {
      query = query.in('status', ['confirmed', 'paid']);
      if (fulfillment) query = query.eq('fulfillment_status', fulfillment);
    }
    else if (status === 'sent') query = query.in('status', ['confirmed', 'paid']).eq('fulfillment_status', 'sent');

    const { data: orders } = await query;
    // Map order_items to items for each order
    const mappedOrders = (orders || []).map((o: any) => ({ ...o, items: o.order_items || [] }));
    res.json({ orders: mappedOrders });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Export for Vercel
export default app;
