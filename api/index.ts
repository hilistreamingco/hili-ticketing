import { randomUUID } from 'crypto';
import express from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthedUser, getServiceClient, isHiliAdmin, canUsePrestige, isCompanyAdmin, canManageEvents, ownsCompany } from '../backend/lib/auth.js';
import { derivePrefix, uniquePrefix } from '../backend/lib/event-fields.js';
import eventsHandler from '../backend/handlers/events.js';
import eventHandler from '../backend/handlers/event.js';
import eventTicketsHandler from '../backend/handlers/eventTickets.js';
import tiersHandler from '../backend/handlers/tiers.js';
import tierHandler from '../backend/handlers/tier.js';
import meHandler from '../backend/handlers/me.js';
import uploadPosterHandler from '../backend/handlers/uploadPoster.js';
import orderManualHandler from '../backend/handlers/orderManual.js';
import paymentConfigHandler from '../backend/handlers/paymentConfig.js';
import campaignHandler from '../backend/handlers/campaign.js';

// ONE serverless function serves the whole API. Vercel's free plan allows 12 functions in total
// and the API had grown past that, so every route now lives behind this file (vercel.json sends
// /api/* here). The handlers are in /backend. Posters arrive as base64 JSON, hence the larger limit
// (Vercel itself caps a request at 4.5 MB).
const app = express();
app.use(express.json({ limit: '6mb' }));

// ── Security headers ────────────────────────────────────────────────────────
// Applied to every API response so the browser enforces them even on error
// paths. CSP is deliberately permissive enough for Supabase + Google Fonts.
app.use((_req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://resend.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
  );
  next();
});

// ── Simple in-memory rate limiter ───────────────────────────────────────────
// Vercel functions are stateless, so this only protects against bursts within a
// single warm instance. It still raises the cost of hammering the order endpoint
// (the only unauthenticated write endpoint) from one browser/IP.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateHits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(req: any, res: any, next: any) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateHits.get(ip);
  if (!entry || entry.resetAt < now) {
    rateHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }
  entry.count += 1;
  if (entry.count > RATE_MAX) {
    res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many requests. Please slow down and try again.' });
  }
  next();
}

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

// ── Site settings (maintenance mode, etc.) ──────────────────────────────────
// The public site reads site_settings directly via the anon key (RLS allows
// SELECT). This endpoint is for admins to upsert values.
app.put('/api/x/admin/site-settings', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });

    const patch = req.body || {};
    if (typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Send a JSON object of key → value' });
    }
    const keys = Object.keys(patch);
    if (keys.length === 0 || keys.length > 20) {
      return res.status(400).json({ error: 'Send between 1 and 20 settings' });
    }

    const supabase = getSupabase();
    const rows = keys.map((k) => ({
      key: k,
      value: patch[k],
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('site_settings')
      .upsert(rows, { onConflict: 'key' });
    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not save settings' });
  }
});

// Background videos are too big to pass through a Vercel function (4.5 MB body
// limit). This hands the browser a one-time signed slot so it uploads straight
// to storage. Admin only; no new function, it lives in this same file.
app.post('/api/x/admin/video-upload-url', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!canManageEvents(user)) return res.status(401).json({ error: 'Unauthorized' });

    const ext = String(req.body?.ext ?? 'mp4').toLowerCase();
    const isVideo = ['mp4', 'webm', 'mov'].includes(ext);
    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
    if (!isVideo && !isImage) {
      return res.status(400).json({ error: 'File must be .mp4, .webm, .mov, .jpg, .png or .webp' });
    }
    const supabase = getSupabase();
    const path = `${isVideo ? 'videos' : 'creatives'}/${randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage.from('event-posters').createSignedUploadUrl(path);
    if (error) throw error;
    const { data: pub } = supabase.storage.from('event-posters').getPublicUrl(path);
    res.json({ path, token: data.token, publicUrl: pub.publicUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not prepare the upload' });
  }
});

// ── Movies and showtimes ────────────────────────────────────────────────────
// A movie is one film. A showtime is a cinema event linked to it, so seats,
// holds, orders, tickets and codes all work exactly as they do for any event.
const isStaff = (user: any) => isHiliAdmin(user) || canUsePrestige(user);
const LOOKS = ['desert', 'heroic', 'noir', 'midnight', 'ember'];

function cleanMovie(body: any, creating: boolean): { fields?: Record<string, unknown>; error?: string } {
  const f: Record<string, unknown> = {};
  const text = (k: string, max = 2000) => {
    if (body[k] === undefined) return;
    f[k] = body[k] === null || body[k] === '' ? null : String(body[k]).trim().slice(0, max);
  };
  ['tagline', 'poster_url', 'backdrop_url', 'backdrop_video_url', 'trailer_url', 'rating', 'genres'].forEach((k) => text(k, 400));
  text('synopsis', 4000);
  if (creating || body.title !== undefined) {
    const t = String(body.title ?? '').trim().slice(0, 120);
    if (!t) return { error: 'The movie needs a title' };
    f.title = t;
  }
  if (body.runtime_min !== undefined) {
    if (body.runtime_min === null || body.runtime_min === '') f.runtime_min = null;
    else {
      const n = Math.floor(Number(body.runtime_min));
      if (!(n >= 1 && n <= 600)) return { error: 'Runtime must be between 1 and 600 minutes' };
      f.runtime_min = n;
    }
  }
  if (body.look !== undefined) {
    if (!LOOKS.includes(body.look)) return { error: 'Unknown look' };
    f.look = body.look;
  }
  if (body.accent !== undefined) {
    if (body.accent === null || body.accent === '') f.accent = null;
    else if (/^#[0-9a-fA-F]{6}$/.test(String(body.accent))) f.accent = String(body.accent);
    else return { error: 'Accent must be a colour like #d9a05b' };
  }
  if (body.is_published !== undefined) f.is_published = Boolean(body.is_published);
  return { fields: f };
}

app.get('/api/x/admin/movies', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isStaff(user)) return res.status(401).json({ error: 'Unauthorized' });
    const supabase = getSupabase();
    const { data: movies, error } = await supabase.from('movies').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const { data: shows } = await supabase
      .from('events')
      .select('id, movie_id, slug, event_date, start_time, status, ticket_prefix')
      .not('movie_id', 'is', null)
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true });
    const { data: templates } = await supabase
      .from('events')
      .select('id, name, event_date, start_time, status, movie_id')
      .eq('event_type', 'cinema')
      .order('created_at', { ascending: false });
    res.json({ movies: movies || [], showtimes: shows || [], templates: templates || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not load movies' });
  }
});

app.post('/api/x/admin/movies', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isStaff(user)) return res.status(401).json({ error: 'Unauthorized' });
    const { fields, error: invalid } = cleanMovie(req.body || {}, true);
    if (invalid || !fields) return res.status(400).json({ error: invalid });
    const base = String(fields.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'movie';
    const supabase = getSupabase();
    const { data: clash } = await supabase.from('movies').select('id').eq('slug', base).maybeSingle();
    const { data, error } = await supabase.from('movies').insert({ ...fields, slug: clash ? `${base}-${Date.now()}` : base }).select().single();
    if (error) throw error;
    res.status(201).json({ movie: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not add the movie' });
  }
});

app.put('/api/x/admin/movies/:id', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isStaff(user)) return res.status(401).json({ error: 'Unauthorized' });
    const { fields, error: invalid } = cleanMovie(req.body || {}, false);
    if (invalid || !fields) return res.status(400).json({ error: invalid });
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Nothing to change' });
    const { data, error } = await getSupabase().from('movies').update(fields).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ movie: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not save the movie' });
  }
});

app.delete('/api/x/admin/movies/:id', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isStaff(user)) return res.status(401).json({ error: 'Unauthorized' });
    const supabase = getSupabase();
    const { count } = await supabase.from('events').select('id', { count: 'exact', head: true }).eq('movie_id', req.params.id);
    if ((count ?? 0) > 0) return res.status(409).json({ error: 'This movie has showtimes. Unpublish it instead of deleting it.' });
    const { error } = await supabase.from('movies').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not delete the movie' });
  }
});

// Add showtimes: each new showtime copies a template showtime (hall, seat map,
// prices, sales rules) with a new date and time and its own ticket prefix.
app.post('/api/x/admin/showtimes', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isStaff(user)) return res.status(401).json({ error: 'Unauthorized' });
    const { movieId, templateEventId, shows } = req.body || {};
    if (!movieId || !templateEventId || !Array.isArray(shows) || shows.length === 0) {
      return res.status(400).json({ error: 'Choose a movie, a showtime to copy and at least one date and time' });
    }
    if (shows.length > 40) return res.status(400).json({ error: 'Add up to 40 showtimes at a time' });
    const supabase = getSupabase();
    const { data: movie } = await supabase.from('movies').select('id, title, poster_url, synopsis, tagline').eq('id', movieId).maybeSingle();
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    const { data: tpl } = await supabase.from('events').select('*').eq('id', templateEventId).maybeSingle();
    if (!tpl || tpl.event_type !== 'cinema') return res.status(400).json({ error: 'The showtime to copy must be a cinema event' });
    const { data: brackets } = await supabase.from('event_price_brackets').select('from_seat, price_kes').eq('event_id', tpl.id);
    const { data: tiers } = await supabase.from('ticket_types').select('*').eq('event_id', tpl.id);

    const created: any[] = [];
    for (const show of shows) {
      const date = String(show?.date ?? '');
      const start = String(show?.start_time ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(start)) {
        return res.status(400).json({ error: 'Every showtime needs a date and a time', created });
      }
      const { id: _id, created_at: _c, updated_at: _u, ticket_counter: _t, ...rest } = tpl as any;
      const slug = `${String(movie.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'movie'}-${date}-${start.slice(0, 5).replace(':', '')}`;
      const { data: clash } = await supabase.from('events').select('id').eq('slug', slug).maybeSingle();
      if (clash) continue; // that showtime already exists
      const prefix = await uniquePrefix(supabase, derivePrefix(String(movie.title)));
      const { data: ev, error } = await supabase
        .from('events')
        .insert({
          ...rest,
          slug,
          name: movie.title,
          movie_id: movie.id,
          event_date: date,
          start_time: start.length === 5 ? `${start}:00` : start,
          end_time: null,
          ticket_prefix: prefix,
          ticket_counter: 0,
          sales_close_at: null,
          ...(movie.poster_url ? { poster_path: movie.poster_url } : {}),
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message, created });
      if (brackets?.length) {
        await supabase.from('event_price_brackets').insert(brackets.map((b: any) => ({ event_id: ev.id, from_seat: b.from_seat, price_kes: b.price_kes })));
      }
      if (tiers?.length) {
        await supabase.from('ticket_types').insert(
          tiers.map((t: any) => {
            const { id: _tid, created_at: _tc, updated_at: _tu, ...tr } = t;
            return { ...tr, event_id: ev.id, quantity_sold: 0 };
          }),
        );
      }
      created.push({ id: ev.id, slug: ev.slug, event_date: ev.event_date, start_time: ev.start_time });
    }
    res.status(201).json({ created });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not add showtimes' });
  }
});

// ── Discount / creator codes ────────────────────────────────────────────────
// Public check (used by the checkout page for the "code applied" message).
// Returns only valid + amount, never who the creator is.
const DISCOUNT_REASONS: Record<string, string> = {
  NOT_FOUND: 'That code is not valid.',
  INACTIVE: 'This code is no longer active.',
  WRONG_EVENT: 'This code does not work for this event.',
  NOT_STARTED: 'This code is not active yet.',
  EXPIRED: 'This code has expired.',
  USED_UP: 'This code has been fully used.',
};

app.post('/api/discount-check', rateLimited, async (req, res) => {
  try {
    const slug = String(req.body?.eventSlug ?? '');
    const code = String(req.body?.code ?? '').trim().slice(0, 40);
    if (!slug || !code) return res.status(400).json({ valid: false, error: 'Enter a code.' });
    const supabase = getSupabase();
    const { data: event } = await supabase.from('events').select('id').eq('slug', slug).eq('status', 'published').maybeSingle();
    if (!event) return res.status(404).json({ valid: false, error: 'Event not found.' });
    const { data, error } = await supabase.rpc('check_discount', { p_code: code, p_event: event.id });
    if (error) throw error;
    if (!data?.valid) return res.json({ valid: false, error: DISCOUNT_REASONS[data?.reason] || DISCOUNT_REASONS.NOT_FOUND });
    res.json({ valid: true, code: data.code, amountKes: data.amount_kes });
  } catch (error: any) {
    res.status(500).json({ valid: false, error: 'Could not check the code. Please try again.' });
  }
});

// Admin: report (every code with orders, tickets and money), optionally for one event.
app.get('/api/x/admin/discount-report', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isStaff(user)) return res.status(401).json({ error: 'Unauthorized' });
    const eventId = typeof req.query.eventId === 'string' && req.query.eventId ? req.query.eventId : null;
    const { data, error } = await getSupabase().rpc('discount_report', { p_event: eventId });
    if (error) throw error;
    res.json({ codes: data || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not load codes' });
  }
});

function cleanDiscountFields(body: any, creating: boolean): { fields?: Record<string, unknown>; error?: string } {
  const f: Record<string, unknown> = {};
  if (creating || body.code !== undefined) {
    const code = String(body.code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { error: 'Code must be 3 to 30 letters, digits, - or _' };
    f.code = code;
  }
  if (creating || body.creator_name !== undefined) {
    const name = String(body.creator_name ?? '').trim().slice(0, 80);
    if (!name) return { error: 'Creator name is required' };
    f.creator_name = name;
  }
  if (creating || body.amount_kes !== undefined) {
    const n = Math.floor(Number(body.amount_kes));
    if (!(n >= 1 && n <= 1000000)) return { error: 'Discount amount must be between 1 and 1,000,000' };
    f.amount_kes = n;
  }
  if (body.usage_limit !== undefined) {
    if (body.usage_limit === null || body.usage_limit === '') f.usage_limit = null;
    else {
      const n = Math.floor(Number(body.usage_limit));
      if (!(n >= 1 && n <= 1000000)) return { error: 'Usage limit must be 1 or more, or empty for unlimited' };
      f.usage_limit = n;
    }
  }
  for (const k of ['starts_at', 'ends_at'] as const) {
    if (body[k] === undefined) continue;
    if (body[k] === null || body[k] === '') f[k] = null;
    else {
      const d = new Date(body[k]);
      if (Number.isNaN(d.getTime())) return { error: 'A date is not valid' };
      f[k] = d.toISOString();
    }
  }
  if (f.starts_at && f.ends_at && new Date(f.ends_at as string) <= new Date(f.starts_at as string)) {
    return { error: 'The end date must be after the start date' };
  }
  if (creating && body.event_id !== undefined) {
    f.event_id = body.event_id === null || body.event_id === '' ? null : String(body.event_id);
  }
  if (body.is_active !== undefined) f.is_active = Boolean(body.is_active);
  return { fields: f };
}

app.post('/api/x/admin/discount-codes', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isStaff(user)) return res.status(401).json({ error: 'Unauthorized' });
    const { fields, error: invalid } = cleanDiscountFields(req.body || {}, true);
    if (invalid || !fields) return res.status(400).json({ error: invalid });
    const { data, error } = await getSupabase().from('discount_codes').insert(fields).select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'That code already exists. Pick another.' });
      throw error;
    }
    res.status(201).json({ code: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not create the code' });
  }
});

app.put('/api/x/admin/discount-codes/:id', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isStaff(user)) return res.status(401).json({ error: 'Unauthorized' });
    const body = { ...(req.body || {}) };
    delete body.code; // a code's text never changes once created
    const { fields, error: invalid } = cleanDiscountFields(body, false);
    if (invalid || !fields) return res.status(400).json({ error: invalid });
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Nothing to change' });
    const { data, error } = await getSupabase().from('discount_codes').update(fields).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ code: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not update the code' });
  }
});

app.delete('/api/x/admin/discount-codes/:id', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isStaff(user)) return res.status(401).json({ error: 'Unauthorized' });
    const supabase = getSupabase();
    const { data: row } = await supabase.from('discount_codes').select('uses_count').eq('id', req.params.id).maybeSingle();
    if (!row) return res.status(404).json({ error: 'Code not found' });
    if (row.uses_count > 0) return res.status(409).json({ error: 'This code has been used. Switch it off instead of deleting it, so the report stays correct.' });
    const { error } = await supabase.from('discount_codes').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not delete the code' });
  }
});

// Admin: check a code against an event. For gate events, also redeem it at the door.
app.post('/api/x/admin/discount-check', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isStaff(user)) return res.status(401).json({ error: 'Unauthorized' });
    const { code, eventId } = req.body || {};
    if (!code || !eventId) return res.status(400).json({ error: 'Enter a code and choose an event' });
    const { data, error } = await getSupabase().rpc('check_discount', { p_code: String(code), p_event: String(eventId) });
    if (error) throw error;
    if (!data?.valid) return res.json({ valid: false, message: DISCOUNT_REASONS[data?.reason] || DISCOUNT_REASONS.NOT_FOUND });
    res.json({ valid: true, creator: data.creator, amountKes: data.amount_kes, code: data.code, usesLeft: data.uses_left });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not check the code' });
  }
});

app.post('/api/x/admin/discount-redeem', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isStaff(user)) return res.status(401).json({ error: 'Unauthorized' });
    const { code, eventId } = req.body || {};
    if (!code || !eventId) return res.status(400).json({ error: 'Enter a code and choose an event' });
    const { data, error } = await getSupabase().rpc('redeem_discount_gate', { p_code: String(code), p_event: String(eventId) });
    if (error) {
      const m = /DISCOUNT_INVALID:([A-Z_]+)/.exec(error.message || '');
      if (m) return res.json({ valid: false, message: DISCOUNT_REASONS[m[1]] || DISCOUNT_REASONS.NOT_FOUND });
      throw error;
    }
    res.json({ valid: true, creator: data.creator, amountKes: data.amount_kes, code: data.code });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Could not redeem the code' });
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

// ── Companies, creatives and the contact inbox (migration 020) ──────────────
// Companies are who sells on the platform. Company staff log in with the same
// Supabase sign-in as everyone else; their email must be on that company's staff list.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slugify = (t: string, fallback: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || fallback;
async function uniqueSlug(supabase: any, table: string, base: string): Promise<string> {
  const { data } = await supabase.from(table).select('id').eq('slug', base).maybeSingle();
  return data ? `${base}-${Date.now().toString(36)}` : base;
}
function cleanStaff(input: unknown): { emails?: string[]; error?: string } {
  if (input === undefined) return {};
  const list = Array.isArray(input) ? input : String(input).split(/[\s,;]+/);
  const emails = Array.from(new Set(list.map((e: any) => String(e).trim().toLowerCase()).filter(Boolean)));
  const bad = emails.find((e) => !EMAIL_RE.test(e));
  if (bad) return { error: `"${bad}" is not a valid email address` };
  return { emails };
}
async function setStaff(supabase: any, companyId: string, emails: string[]) {
  const { error: delErr } = await supabase.from('company_staff').delete().eq('company_id', companyId);
  if (delErr) throw delErr;
  if (emails.length) {
    const { error } = await supabase.from('company_staff').insert(emails.map((email) => ({ company_id: companyId, email })));
    if (error) throw error;
  }
}

app.get('/api/x/admin/companies', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!canManageEvents(user)) return res.status(401).json({ error: 'Unauthorized' });
    const supabase = getSupabase();
    let q = supabase.from('companies').select('*, company_staff(email)').order('name');
    if (isCompanyAdmin(user)) q = q.in('id', user.companyIds || []);
    const { data, error } = await q;
    if (error) throw error;
    const companies = (data || []).map((c: any) => ({ ...c, staff: (c.company_staff || []).map((r: any) => r.email), company_staff: undefined }));
    res.json({ companies });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/x/admin/companies', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });
    const name = String(req.body?.name ?? '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'The company needs a name' });
    const staff = cleanStaff(req.body?.staff);
    if (staff.error) return res.status(400).json({ error: staff.error });
    const email = req.body?.contact_email ? String(req.body.contact_email).trim() : null;
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Contact email is not valid' });
    const supabase = getSupabase();
    const slug = await uniqueSlug(supabase, 'companies', slugify(name, 'company'));
    const { data, error } = await supabase.from('companies')
      .insert({ slug, name, logo_url: req.body?.logo_url || null, contact_email: email }).select().single();
    if (error) throw error;
    if (staff.emails?.length) await setStaff(supabase, data.id, staff.emails);
    res.status(201).json({ company: { ...data, staff: staff.emails || [] } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/x/admin/companies/:id', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!canManageEvents(user)) return res.status(401).json({ error: 'Unauthorized' });
    const id = req.params.id;
    if (!ownsCompany(user, id)) return res.status(403).json({ error: 'That is another company.' });
    const body = req.body || {};
    const fields: Record<string, unknown> = {};
    if (body.logo_url !== undefined) fields.logo_url = body.logo_url || null;
    if (body.contact_email !== undefined) {
      const e = body.contact_email ? String(body.contact_email).trim() : null;
      if (e && !EMAIL_RE.test(e)) return res.status(400).json({ error: 'Contact email is not valid' });
      fields.contact_email = e;
    }
    // Renaming and the staff list are Hili's call, not the company's.
    if (isHiliAdmin(user) && body.name !== undefined) {
      const n = String(body.name).trim().slice(0, 120);
      if (!n) return res.status(400).json({ error: 'The company needs a name' });
      fields.name = n;
    }
    const staff = isHiliAdmin(user) ? cleanStaff(body.staff) : {};
    if (staff.error) return res.status(400).json({ error: staff.error });
    const supabase = getSupabase();
    if (Object.keys(fields).length) {
      const { error } = await supabase.from('companies').update(fields).eq('id', id);
      if (error) throw error;
    }
    if (staff.emails) await setStaff(supabase, id, staff.emails);
    const { data, error } = await supabase.from('companies').select('*, company_staff(email)').eq('id', id).single();
    if (error) throw error;
    res.json({ company: { ...data, staff: (data.company_staff || []).map((r: any) => r.email), company_staff: undefined } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/x/admin/companies/:id', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });
    const supabase = getSupabase();
    const [{ count: camps }, { count: evs }] = await Promise.all([
      supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('company_id', req.params.id),
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('company_id', req.params.id),
    ]);
    if (camps || evs) return res.status(409).json({ error: 'This company still has campaigns or events. Move or remove them first.' });
    const { error } = await supabase.from('companies').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Creatives page (public read happens in the browser; only Hili edits)
function cleanCreative(body: any, creating: boolean): { fields?: Record<string, unknown>; error?: string } {
  const f: Record<string, unknown> = {};
  if (creating || body.name !== undefined) {
    const n = String(body.name ?? '').trim().slice(0, 100);
    if (!n) return { error: 'The creative needs a name' };
    f.name = n;
  }
  if (body.craft !== undefined) f.craft = String(body.craft).trim().slice(0, 80) || 'Creative';
  if (body.work !== undefined) f.work = body.work ? String(body.work).trim().slice(0, 300) : null;
  if (body.photo_url !== undefined) f.photo_url = body.photo_url || null;
  if (body.color !== undefined) {
    if (!body.color) f.color = null;
    else if (/^#[0-9a-fA-F]{6}$/.test(String(body.color))) f.color = String(body.color);
    else return { error: 'Colour must look like #f26a1b' };
  }
  return { fields: f };
}

app.post('/api/x/admin/creatives', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });
    const { fields, error: invalid } = cleanCreative(req.body || {}, true);
    if (invalid) return res.status(400).json({ error: invalid });
    const supabase = getSupabase();
    const { data: last } = await supabase.from('creatives').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const next = ((last?.[0]?.sort_order as number) ?? -1) + 1;
    const { data, error } = await supabase.from('creatives').insert({ ...fields, sort_order: next }).select().single();
    if (error) throw error;
    res.status(201).json({ creative: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Must come before the :id route. Body: { ids: [id, id, ...] } in the order to show.
app.put('/api/x/admin/creatives/order', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) return res.status(400).json({ error: 'ids is required' });
    const supabase = getSupabase();
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase.from('creatives').update({ sort_order: i }).eq('id', ids[i]);
      if (error) throw error;
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/x/admin/creatives/:id', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });
    const { fields, error: invalid } = cleanCreative(req.body || {}, false);
    if (invalid) return res.status(400).json({ error: invalid });
    const { data, error } = await getSupabase().from('creatives').update(fields).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ creative: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/x/admin/creatives/:id', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });
    const { error } = await getSupabase().from('creatives').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Contact form: saved for the admin inbox and emailed to the Hili team inbox when Resend is set up.
app.post('/api/contact', rateLimited, async (req, res) => {
  try {
    const b = req.body || {};
    if (b.website) return res.json({ success: true }); // honeypot: real people never fill this hidden field
    const name = String(b.name ?? '').trim().slice(0, 100);
    const contact = String(b.contact ?? '').trim().slice(0, 150);
    const company = b.company ? String(b.company).trim().slice(0, 150) : null;
    const message = b.message ? String(b.message).trim().slice(0, 2000) : null;
    if (!name || !contact) return res.status(400).json({ error: 'Add your name and a phone number or email so we can reply.' });
    const supabase = getSupabase();
    const { error } = await supabase.from('contact_messages').insert({ name, company, contact, message });
    if (error) throw error;

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const { Resend } = await import('resend');
        const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
        await new Resend(resendKey).emails.send({
          from: `${process.env.BRAND_NAME || 'Kuja by Hili'} <onboarding@resend.dev>`,
          to: process.env.CONTACT_TO_EMAIL || 'hilistreaming.co@gmail.com',
          subject: `New enquiry from ${name}${company ? ` (${company})` : ''}`,
          html: `<p><b>${esc(name)}</b>${company ? ` from ${esc(company)}` : ''}</p><p>Reach them on: ${esc(contact)}</p><p>${esc(message || '(no message)').replace(/\n/g, '<br>')}</p>`,
        });
      } catch (e: any) {
        console.error('Contact email failed (message is still saved):', e?.message);
      }
    }
    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Could not send that just now. Please WhatsApp us on 0796 429 978.' });
  }
});

app.get('/api/x/admin/contact-messages', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });
    const { data, error } = await getSupabase().from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json({ messages: data || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/x/admin/contact-messages/:id', async (req, res) => {
  try {
    const user = await getAuthedUser(req.headers.authorization);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });
    const { error } = await getSupabase().from('contact_messages').update({ handled: Boolean(req.body?.handled) }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
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
// (idempotent, safe to call repeatedly; a Supabase cron is not required).
// The new `release_expired_seat_holds` RPC (migration 014) also frees:
//   - expired anonymous 20min holds that never turned into orders
//   - seat locks attached to admin-cancelled orders
//   - seat locks for orders pending/processing > 24h
// Fallback: if migration 014 is not deployed yet, run only the legacy cleanup;
// it cannot fail the request.
app.post('/api/x/cleanup-stale-orders', async (_req, res) => {
  try {
    const supabase = getSupabase();
    // 1. Release every kind of stale / cancelled / expired seat hold first.
    // (Do not fail if the new RPC isn't deployed yet.)
    try {
      await supabase.rpc('release_expired_seat_holds', { p_event: null });
    } catch { /* ignore when migration 014 not deployed yet */ }

    // 2. Cancel stale cinema orders (also calls release_expired_seat_holds).
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
app.all('/api/admin/campaigns/:id/events/:eventId', asHandler(campaignHandler));
app.all('/api/admin/campaigns/:id/events', asHandler(campaignHandler));
app.all('/api/admin/campaigns/:id', asHandler(campaignHandler));
app.all('/api/admin/campaigns', asHandler(campaignHandler));
app.all('/api/orders/manual', rateLimited, asHandler(orderManualHandler));
app.all('/api/payment-config/:eventSlug', asHandler(paymentConfigHandler));

// Anything else under /api: a clear 404 instead of a hanging request
app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));

// Export for Vercel
export default app;
