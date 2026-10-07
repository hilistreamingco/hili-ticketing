import { randomUUID } from 'crypto';
import express from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthedUser, getServiceClient, isHiliAdmin, canUsePrestige } from '../backend/lib/auth.js';
import eventsHandler from '../backend/handlers/events.js';
import eventHandler from '../backend/handlers/event.js';
import eventTicketsHandler from '../backend/handlers/eventTickets.js';
import tiersHandler from '../backend/handlers/tiers.js';
import tierHandler from '../backend/handlers/tier.js';
import meHandler from '../backend/handlers/me.js';
import uploadPosterHandler from '../backend/handlers/uploadPoster.js';
import orderManualHandler from '../backend/handlers/orderManual.js';
import paymentConfigHandler from '../backend/handlers/paymentConfig.js';

// ONE serverless function serves the whole API. Vercel's free plan allows 12 functions in total
// and the API had grown past that, so every route now lives behind this file (vercel.json sends
// /api/* here). The handlers are in /backend. Posters arrive as base64 JSON, hence the larger limit
// (Vercel itself caps a request at 4.5 MB).
const app = express();
app.use(express.json({ limit: '6mb' }));

// The handlers in /backend were written as separate Vercel functions: they read req.query for both
// ?name=value and the dynamic parts of the path (/events/:id). This gives them the same shape.
function asHandler(handler: (req: any, res: any) => unknown) {
  return async (req: any, res: any) => {
    const shim = { method: req.method, headers: req.headers, body: req.body, query: { ...req.query, ...req.params } };
    try {
      await handler(shim, res);
    } catch (error: any) {
      console.error('Unhandled API error:', req.method, req.path, error);
      if (!res.headersSent) res.status(500).json({ error: error?.message || 'Internal server error' });
    }
  };
}

// Auth is verified (signature checked by Supabase Auth) in backend/lib/auth.ts
function getSupabase() {
  const client = getServiceClient();
  if (!client) throw new Error('Missing Supabase config');
  return client as any;
}

// ── Prestige (BeerBirds / Prestige operations, also open to Hili admins) ────
//
// The flow for a manual M-Pesa order:
//   pending  --confirm-->  confirmed (seats become sold, tickets are numbered and created)
//   pending  --notFound--> cancelled (seats are released by a database trigger)
//   confirmed --send-->    fulfillment_status = sent (PDF is made in the browser and emailed by hand)

const DEAD_ORDER = ['cancelled', 'failed', 'not_found', 'refunded'];

function eventFilter(req: any): string | null {
  return typeof req.query.eventId === 'string' && req.query.eventId ? req.query.eventId : null;
}

async function audit(supabase: any, user: { uid: string; email: string }, orderId: string, action: string, metadata: Record<string, unknown> = {}) {
  const { error } = await supabase.from('audit_log').insert({
    order_id: orderId,
    action,
    actor_id: user.uid,
    actor_email: user.email,
    metadata,
  });
  if (error) console.error('audit_log insert failed:', error.message); // never block the action on the log
}

// Prestige Stats (optionally for one event). Returns exactly the PrestigeStats shape the
// dashboard reads (shared/api.ts); the old version returned different field names, so the
// "Tickets Sold" card was blank and the Finances tab crashed.
app.get('/api/prestige/stats', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!canUsePrestige(user)) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = getSupabase();
    const eventId = eventFilter(req);

    let ordersQuery = supabase
      .from('orders')
      .select('status, amount_kes, fulfillment_status, order_items(quantity, unit_price_kes, ticket_type:ticket_types(name))');
    if (eventId) ordersQuery = ordersQuery.eq('event_id', eventId);

    const { data: orders, error } = await ordersQuery;
    if (error) throw error;

    const rows = (orders || []) as any[];
    const confirmed = rows.filter((o) => o.status === 'confirmed' || o.status === 'paid');

    // Tickets and revenue by ticket type (seat bookings priced by seats taken have no tier)
    const byType = new Map<string, { name: string; quantity: number; revenue: number }>();
    let totalTicketsSold = 0;
    for (const order of confirmed) {
      for (const item of order.order_items || []) {
        const name = item.ticket_type?.name || 'Seat booking';
        const entry = byType.get(name) || { name, quantity: 0, revenue: 0 };
        entry.quantity += item.quantity;
        entry.revenue += item.quantity * item.unit_price_kes;
        byType.set(name, entry);
        totalTicketsSold += item.quantity;
      }
    }

    res.json({
      totalTicketsSold,
      totalRevenue: confirmed.reduce((sum: number, o: any) => sum + (o.amount_kes || 0), 0),
      pendingOrders: rows.filter((o) => o.status === 'pending' || o.status === 'processing').length,
      confirmedOrders: confirmed.length,
      sentOrders: confirmed.filter((o: any) => o.fulfillment_status === 'sent').length,
      notFoundOrders: rows.filter((o) => o.status === 'cancelled' || o.status === 'not_found').length,
      ticketsByType: [...byType.values()].sort((a, b) => b.revenue - a.revenue),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Events for the dashboard's event filter (the Prestige team cannot call the Hili admin API).
app.get('/api/prestige/events', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!canUsePrestige(user)) return res.status(401).json({ error: 'Unauthorized' });

    const { data, error } = await getSupabase()
      .from('events')
      .select('id, name, slug, event_type, event_date, start_time, status, ticket_prefix')
      .neq('status', 'draft')
      .order('event_date', { ascending: false, nullsFirst: false });
    if (error) throw error;
    res.json({ events: data || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Creates the tickets for a confirmed order (numbering, seats and names all handled in one
// database transaction). Safe to call twice: returns 0 the second time.
async function createTicketsFor(supabase: any, orderId: string): Promise<number> {
  const { data, error } = await supabase.rpc('generate_tickets_for_order', { p_order: orderId });
  if (error) throw new Error(error.message);
  return typeof data === 'number' ? data : 0;
}

// Cinema orders store seat ids; the dashboard needs the printable labels (A07) before tickets exist.
async function withSeatLabels(supabase: any, orders: any[]): Promise<any[]> {
  const ids = new Set<string>();
  for (const o of orders) for (const item of o.order_items || []) for (const id of item.seat_ids || []) ids.add(id);
  if (ids.size === 0) return orders;
  const { data, error } = await supabase.from('seats').select('id, label').in('id', [...ids]);
  if (error) throw error;
  const labels = new Map((data || []).map((s: any) => [s.id, s.label]));
  return orders.map((o) => ({
    ...o,
    order_items: (o.order_items || []).map((item: any) => ({
      ...item,
      seat_labels: (item.seat_ids || []).map((id: string) => labels.get(id) || ''),
    })),
  }));
}

// Prestige Orders (GET list or single, POST actions)
app.all('/api/prestige/orders', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!canUsePrestige(user)) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = getSupabase();

    // POST actions
    if (req.method === 'POST') {
      const { action, orderId, note } = req.body || {};

      if (!action || !orderId || typeof orderId !== 'string') {
        return res.status(400).json({ error: 'Missing action or orderId' });
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, status, fulfillment_status')
        .eq('id', orderId)
        .maybeSingle();
      if (orderError) throw orderError;
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const isPending = order.status === 'pending' || order.status === 'processing';
      const isConfirmed = order.status === 'confirmed' || order.status === 'paid';

      if (action === 'confirm') {
        if (isConfirmed) {
          return res.json({ success: true, message: 'Already confirmed' });
        }
        // A cancelled order has already given its seats back, so it can never be confirmed again.
        if (!isPending) {
          return res.status(409).json({ error: `This order is ${String(order.status).replace('_', ' ')} and cannot be confirmed. Ask the customer to place a new order.` });
        }

        const { error: updateError } = await supabase
          .from('orders')
          .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: user.uid })
          .eq('id', orderId)
          .in('status', ['pending', 'processing']);
        if (updateError) throw updateError;
        await audit(supabase, user, orderId, 'payment_confirmed');

        // Number and create the tickets straight away. If this fails the order stays confirmed
        // and the "Generate ticket(s)" button is still available.
        try {
          const created = await createTicketsFor(supabase, orderId);
          await audit(supabase, user, orderId, 'tickets_generated', { created });
          return res.json({ success: true, message: `Payment confirmed, ${created} ticket(s) created` });
        } catch (ticketError: any) {
          console.error('Ticket generation failed after confirm:', ticketError);
          return res.json({ success: true, message: 'Payment confirmed, but tickets could not be created yet', ticketError: ticketError.message });
        }
      }

      if (action === 'generateTickets') {
        if (!isConfirmed) {
          return res.status(409).json({ error: 'Confirm the payment before creating tickets.' });
        }
        try {
          const created = await createTicketsFor(supabase, orderId);
          if (created > 0) await audit(supabase, user, orderId, 'tickets_generated', { created });
          return res.json({ success: true, message: created ? `${created} ticket(s) generated` : 'Tickets already generated' });
        } catch (ticketError: any) {
          console.error('Ticket insert error:', ticketError);
          return res.status(500).json({ error: 'Failed to generate tickets', detail: ticketError.message });
        }
      }

      if (action === 'send') {
        // The PDF was already made in the browser; this records that it went out.
        if (!isConfirmed) {
          return res.status(409).json({ error: 'Only confirmed orders can be marked as sent.' });
        }
        const { error: updateError } = await supabase
          .from('orders')
          .update({ fulfillment_status: 'sent', sent_at: new Date().toISOString(), sent_by: user.uid })
          .eq('id', orderId);
        if (updateError) {
          console.error('Update error:', updateError);
          return res.status(500).json({ error: 'Failed to update order' });
        }
        await audit(supabase, user, orderId, 'tickets_sent');
        return res.json({ success: true, message: 'Marked as sent' });
      }

      if (action === 'notFound') {
        if (!isPending) {
          return res.status(409).json({ error: 'Only orders waiting for payment verification can be cancelled here.' });
        }
        const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null;
        // Cancelling frees the seats (database trigger) so someone else can buy them.
        const { error: updateError } = await supabase
          .from('orders')
          .update({ status: 'cancelled', payment_note: cleanNote })
          .eq('id', orderId)
          .in('status', ['pending', 'processing']);
        if (updateError) {
          console.error('notFound update error:', updateError);
          return res.status(500).json({ error: 'Failed to update order' });
        }
        await audit(supabase, user, orderId, 'payment_not_found', { note: cleanNote });
        return res.json({ success: true, message: 'Order cancelled and seats released' });
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
      // Map order_items to items for frontend compatibility; tickets in seat / number order
      const tickets = (order.tickets || []).slice().sort((a: any, b: any) =>
        String(a.ticket_number).localeCompare(String(b.ticket_number), undefined, { numeric: true }));
      const [labelled] = await withSeatLabels(supabase, [order]);
      const mapped = { ...labelled, tickets, items: labelled.order_items || [] };
      return res.json({ order: mapped });
    }

    // GET list
    const { status, fulfillment } = req.query;
    const eventId = eventFilter(req);
    let query = supabase
      .from('orders')
      .select('*, order_items(*, ticket_type:ticket_types(*)), event:events(name, event_type)')
      .order('created_at', { ascending: false });

    if (eventId) query = query.eq('event_id', eventId);
    if (status === 'pending') query = query.in('status', ['pending', 'processing']);
    else if (status === 'confirmed') {
      query = query.in('status', ['confirmed', 'paid']);
      if (fulfillment) query = query.eq('fulfillment_status', fulfillment);
    }
    else if (status === 'sent') query = query.in('status', ['confirmed', 'paid']).eq('fulfillment_status', 'sent');
    else query = query.not('status', 'in', `(${DEAD_ORDER.join(',')})`); // "all" hides cancelled orders

    const { data: orders, error: listError } = await query;
    if (listError) throw listError;
    // Map order_items to items for each order
    const mappedOrders = (await withSeatLabels(supabase, orders || [])).map((o: any) => ({ ...o, items: o.order_items || [] }));
    res.json({ orders: mappedOrders });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Attendees: one row per ticket (name, seat, ticket number) for confirmed orders.
app.get('/api/prestige/attendees', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!canUsePrestige(user)) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = getSupabase();
    const eventId = eventFilter(req);
    let query = supabase
      .from('tickets')
      .select('id, ticket_number, attendee_name, seat_label, checked_in_at, created_at, event:events(name, event_type), ticket_type:ticket_types(name), order:orders!inner(id, order_number, status, purchaser_name, purchaser_phone, purchaser_email, fulfillment_status)')
      .in('order.status', ['confirmed', 'paid'])
      .order('created_at', { ascending: true })
      .limit(3000);
    if (eventId) query = query.eq('event_id', eventId);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ tickets: data || [] });
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

// ── Routes that used to be separate functions ───────────────────────────────
app.get('/api/ping', (_req, res) => res.json({ message: process.env.PING_MESSAGE ?? 'ping' }));

// Second poster upload (events.poster2_path) — mirrors the original poster upload exactly
app.post('/api/admin/upload-poster2', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization as string);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });

    const { eventId, base64, mimeType } = req.body as Record<string, string>;
    if (!eventId || !base64 || !mimeType) return res.status(400).json({ error: 'eventId, base64, and mimeType are required' });

    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(mimeType)) return res.status(400).json({ error: 'Posters must be PNG, JPEG or WebP images' });

    const supabase = getSupabase();
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'Poster is larger than 5 MB' });

    const ext = mimeType.split('/')[1] || 'jpg';
    const path = `${eventId}/poster2-${randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from('event-posters')
      .upload(path, buffer, { contentType: mimeType, upsert: true });
    if (error) throw error;

    const { data: urlData } = supabase.storage.from('event-posters').getPublicUrl(path);
    res.json({ url: urlData.publicUrl });
  } catch (error: any) {
    console.error('Upload poster2 error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

// Best-effort: cancel stale cinema orders and release seats on seat page access
// (idempotent, safe to call repeatedly; a Supabase cron is not required)
app.post('/api/x/cleanup-stale-orders', async (_req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('cleanup_stale_cinema_orders', { p_hours: 24 });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ cancelled: data ?? 0 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.all('/api/admin/me', asHandler(meHandler));
app.all('/api/admin/events/:id/tickets', asHandler(eventTicketsHandler));
app.all('/api/admin/events/:id', asHandler(eventHandler));
app.all('/api/admin/events', asHandler(eventsHandler));
app.all('/api/admin/tickets/:id', asHandler(tierHandler));
app.all('/api/admin/tickets', asHandler(tiersHandler));
app.all('/api/admin/upload-poster', asHandler(uploadPosterHandler));
app.all('/api/orders/manual', asHandler(orderManualHandler));
app.all('/api/payment-config/:eventSlug', asHandler(paymentConfigHandler));

// Anything else under /api: a clear 404 instead of a hanging request
app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));

// Export for Vercel
export default app;
