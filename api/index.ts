import express from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthedUser, getServiceClient, isHiliAdmin, canUsePrestige } from './_lib/auth.js';

const app = express();
app.use(express.json());

// Auth is verified (signature checked by Supabase Auth) in api/_lib/auth.ts
function getSupabase() {
  const client = getServiceClient();
  if (!client) throw new Error('Missing Supabase config');
  return client as any;
}

// Prestige Stats
app.get('/api/prestige/stats', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!canUsePrestige(user)) return res.status(401).json({ error: 'Unauthorized' });

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
    const user = await getAuthedUser(req.headers.authorization);
    if (!canUsePrestige(user)) return res.status(401).json({ error: 'Unauthorized' });

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

// ── Payment config (Hili admin) ─────────────────────────────────────────────
// The admin screen calls PUT /api/prestige/payment-config. This route did not
// exist on Vercel before, so the till number could only be inserted by SQL.
app.put('/api/prestige/payment-config', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });

    const { eventId, paymentType, number, accountNumber, instructions, tillName } = req.body || {};
    if (!eventId || !paymentType || !number) {
      return res.status(400).json({ error: 'eventId, paymentType, and number are required' });
    }
    if (!['till', 'paybill'].includes(paymentType)) {
      return res.status(400).json({ error: 'paymentType must be till or paybill' });
    }

    const supabase = getSupabase();
    const { error } = await supabase.from('payment_config').upsert({
      event_id: eventId,
      provider: 'manual',
      payment_method: 'mpesa',
      payment_type: paymentType,
      number: String(number).trim(),
      account_number: accountNumber || null,
      instructions: instructions || null,
      till_name: tillName || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'event_id' });
    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not save payment config' });
  }
});

// ── Hili admin data (new endpoints live under /api/x to stay within the
//    Vercel function limit; see vercel.json) ────────────────────────────────

function eventIdParam(req: any): string | null {
  return typeof req.query.eventId === 'string' && req.query.eventId ? req.query.eventId : null;
}

// Overview numbers, optionally for one event. The admin page used to read the
// orders table with the browser key, which row level security blocks, so the
// numbers were always zero.
app.get('/api/x/admin/stats', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = getSupabase();
    const eventId = eventIdParam(req);

    let ordersQuery = supabase.from('orders').select('status, amount_kes, order_items(quantity)');
    let ticketsQuery = supabase
      .from('tickets')
      .select('id, order:orders!inner(status)')
      .in('order.status', ['confirmed', 'paid']);
    if (eventId) {
      ordersQuery = ordersQuery.eq('event_id', eventId);
      ticketsQuery = ticketsQuery.eq('event_id', eventId);
    }

    const [events, orders, tickets] = await Promise.all([
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      ordersQuery,
      ticketsQuery,
    ]);
    if (orders.error) throw orders.error;
    if (tickets.error) throw tickets.error;

    const rows = (orders.data || []) as any[];
    const confirmed = rows.filter((o) => o.status === 'confirmed' || o.status === 'paid');
    res.json({
      events: events.count ?? 0,
      orders: rows.length,
      confirmed: confirmed.length,
      revenue: confirmed.reduce((sum, o) => sum + (o.amount_kes || 0), 0),
      sold: confirmed.reduce((sum, o) => sum + (o.order_items || []).reduce((s: number, i: any) => s + i.quantity, 0), 0),
      attendees: tickets.data?.length ?? 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Attendee list. Same reason as above: tickets are not readable with the browser key.
app.get('/api/x/admin/attendees', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = getSupabase();
    const eventId = eventIdParam(req);
    let query = supabase
      .from('tickets')
      .select('id, ticket_number, attendee_name, checked_in_at, created_at, seat_label, event:events(name), ticket_type:ticket_types(name)')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (eventId) query = query.eq('event_id', eventId);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ tickets: data || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cinema price brackets (pricing_mode = 'seats_taken')
app.get('/api/x/admin/brackets', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });
    const eventId = eventIdParam(req);
    if (!eventId) return res.status(400).json({ error: 'eventId is required' });

    const { data, error } = await getSupabase()
      .from('event_price_brackets')
      .select('from_seat, price_kes')
      .eq('event_id', eventId)
      .order('from_seat', { ascending: true });
    if (error) throw error;
    res.json({ brackets: data || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/x/admin/brackets', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });

    const { eventId, rows } = req.body || {};
    if (!eventId || !Array.isArray(rows) || rows.length === 0 || rows.length > 20) {
      return res.status(400).json({ error: 'Send between 1 and 20 price brackets' });
    }
    const clean = rows.map((r: any) => ({ from_seat: Math.floor(Number(r.from_seat)), price_kes: Math.floor(Number(r.price_kes)) }));
    if (clean.some((r: any) => !Number.isFinite(r.from_seat) || r.from_seat < 1 || !Number.isFinite(r.price_kes) || r.price_kes < 0)) {
      return res.status(400).json({ error: 'Each bracket needs a starting seat of 1 or more and a price of 0 or more' });
    }
    clean.sort((a: any, b: any) => a.from_seat - b.from_seat);
    if (clean[0].from_seat !== 1) {
      return res.status(400).json({ error: 'The first bracket must start at seat 1' });
    }
    for (let i = 1; i < clean.length; i++) {
      if (clean[i].from_seat === clean[i - 1].from_seat) {
        return res.status(400).json({ error: 'Two brackets start at the same seat number' });
      }
    }

    const supabase = getSupabase();
    // Upsert first, then remove the rest, so a failure never leaves the event with no prices.
    const { error: upsertError } = await supabase
      .from('event_price_brackets')
      .upsert(clean.map((r: any) => ({ event_id: eventId, ...r })), { onConflict: 'event_id,from_seat' });
    if (upsertError) throw upsertError;

    const keep = clean.map((r: any) => r.from_seat).join(',');
    const { error: deleteError } = await supabase
      .from('event_price_brackets')
      .delete()
      .eq('event_id', eventId)
      .not('from_seat', 'in', `(${keep})`);
    if (deleteError) throw deleteError;

    res.json({ brackets: clean });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Export for Vercel
export default app;
