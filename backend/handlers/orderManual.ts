import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Kept free of relative imports on purpose: this is the customer checkout, so it
// must not depend on shared files that could fail to bundle.
function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Creates a manual (M-Pesa till) order. Everything that matters is decided
// here, not in the browser: the price, whether sales are open, tier windows
// and stock, and (for cinema) which seats are free.

// Buyers who started before a closing time and paid by M-Pesa are not turned away
// for a few minutes after it.
const GRACE = '15 minutes';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fail(res: VercelResponse, status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ code, error, ...extra });
}

function generateOrderNumber(): string {
  const stamp = Date.now().toString().slice(-8);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${stamp}-${random}`;
}

// Maps the errors raised by the database functions to something a buyer can read.
function mapDbError(res: VercelResponse, error: { message?: string; code?: string }) {
  const message = error.message || '';
  if (error.code === '23505') {
    return fail(res, 409, 'DUPLICATE_MPESA', 'That M-Pesa transaction code has already been used for another order.');
  }
  const taken = /SEAT_TAKEN:([0-9a-f-]{36})/i.exec(message);
  if (taken) {
    return fail(res, 409, 'SEAT_TAKEN', 'One of your seats was just taken by someone else.', { seatId: taken[1] });
  }
  if (message.includes('SALES_CLOSED')) {
    return fail(res, 409, 'SALES_CLOSED', 'Sales for this event are closed.');
  }
  if (message.includes('TIER_NOT_ON_SALE')) {
    return fail(res, 409, 'TIER_NOT_ON_SALE', 'That ticket type is not on sale right now.');
  }
  if (message.includes('TIER_SOLD_OUT')) {
    return fail(res, 409, 'TIER_SOLD_OUT', 'That ticket type has sold out.');
  }
  if (message.includes('NO_PRICE_CONFIGURED')) {
    return fail(res, 409, 'NO_PRICE_CONFIGURED', 'Ticket prices have not been set up for this event yet.');
  }
  if (/BAD_|DUPLICATE_SEAT|TIER_REQUIRED|TIER_NOT_FOUND|EVENT_NOT_SEATED/.test(message)) {
    return fail(res, 400, 'BAD_REQUEST', 'Your order could not be read. Please start again from the event page.');
  }
  console.error('Order creation error:', error);
  return fail(res, 500, 'ERROR', 'Failed to create order');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Same-origin only: no CORS headers, so other sites cannot post orders from a browser.
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const {
      eventSlug,
      ticketTypeId,
      seatIds,
      holdToken,
      purchaserName,
      purchaserEmail,
      purchaserPhone,
      mpesaName,
      mpesaTransactionCode,
      attendeeNames,
    } = body;

    // ── Validate the basics ────────────────────────────────────────────────
    if (!eventSlug || typeof eventSlug !== 'string') {
      return fail(res, 400, 'BAD_REQUEST', 'Missing required fields');
    }
    if (!Array.isArray(attendeeNames) || attendeeNames.length < 1 || attendeeNames.length > 20) {
      return fail(res, 400, 'BAD_REQUEST', 'Please give a name for each ticket.');
    }
    const names: string[] = attendeeNames.map((n: unknown) => String(n ?? '').trim().slice(0, 120));
    if (names.some((n) => !n)) {
      return fail(res, 400, 'BAD_REQUEST', 'Please give a name for each ticket.');
    }
    if (typeof purchaserEmail !== 'string' || !EMAIL_RE.test(purchaserEmail.trim())) {
      return fail(res, 400, 'BAD_REQUEST', 'Please enter a valid email address.');
    }
    const phone = String(purchaserPhone ?? '').replace(/\D/g, '');
    if (phone.length < 9 || phone.length > 15) {
      return fail(res, 400, 'BAD_REQUEST', 'Please enter a valid phone number.');
    }
    const payerName = String(mpesaName ?? '').trim().slice(0, 120);
    if (!payerName) {
      return fail(res, 400, 'BAD_REQUEST', 'Please enter the name on your M-Pesa account.');
    }
    const buyerName = String(purchaserName || names[0]).trim().slice(0, 120);
    const email = purchaserEmail.trim().toLowerCase();
    const code = String(mpesaTransactionCode ?? '').trim().toUpperCase().slice(0, 20) || null;

    const supabase = getServiceClient();
    if (!supabase) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    // ── Event ──────────────────────────────────────────────────────────────
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name, event_type, pricing_mode')
      .eq('slug', eventSlug)
      .eq('status', 'published')
      .single();

    if (eventError || !event) {
      return fail(res, 404, 'NOT_FOUND', 'Event not found');
    }

    let orderNumber = '';
    let amountKes = 0;
    let tierName: string | null = null;
    let seatLabels: string[] = [];

    if (event.event_type === 'cinema') {
      // ── Cinema: one atomic database function checks seats, price and sales ──
      if (!Array.isArray(seatIds) || seatIds.length !== names.length || typeof holdToken !== 'string') {
        return fail(res, 400, 'BAD_REQUEST', 'Please choose your seats again.');
      }

      const { data, error } = await supabase.rpc('create_cinema_order', {
        p_event: event.id,
        p_token: holdToken,
        p_seat_ids: seatIds,
        p_attendee_names: names,
        p_purchaser_name: buyerName,
        p_purchaser_email: email,
        p_purchaser_phone: phone,
        p_mpesa_name: payerName,
        p_mpesa_code: code,
        p_ticket_type_id: typeof ticketTypeId === 'string' ? ticketTypeId : null,
      });
      if (error) return mapDbError(res, error);

      const result = data as { order_number: string; amount_kes: number; seat_labels: string[] };
      orderNumber = result.order_number;
      amountKes = result.amount_kes;
      seatLabels = result.seat_labels || [];

      if (typeof ticketTypeId === 'string') {
        const { data: tier } = await supabase.from('ticket_types').select('name').eq('id', ticketTypeId).maybeSingle();
        tierName = tier?.name ?? null;
      }
    } else {
      // ── General event: tier by id; price, window and stock checked here ────
      if (!ticketTypeId || typeof ticketTypeId !== 'string') {
        return fail(res, 400, 'BAD_REQUEST', 'Please choose a ticket type.');
      }

      const { data: tier, error: tierError } = await supabase
        .from('ticket_types')
        .select('id, name, price_kes, quantity_total, min_per_order, max_per_order')
        .eq('id', ticketTypeId)
        .eq('event_id', event.id)
        .maybeSingle();
      if (tierError || !tier) {
        return fail(res, 404, 'NOT_FOUND', 'Ticket type not found');
      }

      const quantity = names.length;
      if (quantity < tier.min_per_order || quantity > tier.max_per_order) {
        return fail(res, 400, 'BAD_QUANTITY', `You can buy between ${tier.min_per_order} and ${tier.max_per_order} of this ticket.`);
      }

      const { data: eventState } = await supabase.rpc('event_sales_state', { p_event: event.id, p_grace: GRACE });
      if (eventState !== 'open') {
        return fail(res, 409, 'SALES_CLOSED', 'Sales for this event are closed.', { state: eventState });
      }
      const { data: tierState } = await supabase.rpc('tier_state', { p_tier: tier.id, p_grace: GRACE });
      if (tierState === 'sold_out') {
        return fail(res, 409, 'TIER_SOLD_OUT', 'That ticket type has sold out.');
      }
      if (tierState !== 'on_sale') {
        return fail(res, 409, 'TIER_NOT_ON_SALE', 'That ticket type is not on sale right now.');
      }
      if (tier.quantity_total > 0) {
        const { data: sold } = await supabase.rpc('ticket_type_sold', { p_type: tier.id });
        if (typeof sold === 'number' && sold + quantity > tier.quantity_total) {
          return fail(res, 409, 'TIER_SOLD_OUT', 'There are not enough tickets left of that type.');
        }
      }

      amountKes = tier.price_kes * quantity;
      tierName = tier.name;
      orderNumber = generateOrderNumber();

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          event_id: event.id,
          purchaser_name: buyerName,
          purchaser_email: email,
          purchaser_phone: phone,
          amount_kes: amountKes,
          status: 'pending',
          payment_provider: 'manual',
          mpesa_name: payerName,
          mpesa_transaction_code: code,
        })
        .select('id')
        .single();
      if (orderError || !order) return mapDbError(res, orderError || {});

      const { error: itemsError } = await supabase.from('order_items').insert({
        order_id: order.id,
        ticket_type_id: tier.id,
        quantity,
        unit_price_kes: tier.price_kes,
        attendee_names: names,
      });
      if (itemsError) {
        console.error('Order items error:', itemsError);
        await supabase.from('orders').delete().eq('id', order.id); // never leave an order with no tickets in it
        return fail(res, 500, 'ERROR', 'Failed to create order');
      }
    }

    // ── Notify the ops team ────────────────────────────────────────────────
    const resendKey = process.env.RESEND_API_KEY;
    const opsEmail = process.env.OPS_NOTIFICATION_EMAIL || 'hilistreaming.co@gmail.com';

    if (resendKey) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(resendKey);
        const prestigeDashboardUrl = 'https://hili-ticketing.vercel.app/admin/prestige';
        const row = (label: string, value: string, extra = '') =>
          `<tr><td style="padding: 8px 0; color: #666; width: 140px;">${label}</td><td style="padding: 8px 0; ${extra}">${value}</td></tr>`;

        await resend.emails.send({
          from: 'HILI Tickets <onboarding@resend.dev>',
          to: [opsEmail],
          subject: `🎟️ New Order: ${orderNumber} - ${event.name} - KES ${amountKes}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
              <div style="background: #c1ff1a; padding: 16px 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0; color: #000; font-size: 18px;">🎟️ New Ticket Order</h2>
              </div>
              <div style="background: white; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #eee;">
                <table style="width: 100%; border-collapse: collapse;">
                  ${row('Order Number', esc(orderNumber), 'font-weight: bold;')}
                  ${row('Event', esc(event.name))}
                  ${row('Customer', esc(buyerName))}
                  ${row('Email', esc(email))}
                  ${row('Phone', esc(phone))}
                  ${tierName ? row('Tier', esc(tierName)) : ''}
                  ${seatLabels.length ? row('Seats', esc(seatLabels.join(', ')), 'font-weight: bold;') : ''}
                  ${row('Tickets', String(names.length))}
                  ${row('Amount', `KES ${amountKes.toLocaleString()}`, 'font-weight: bold; color: #2a7a00;')}
                  ${row('M-Pesa Name', esc(payerName))}
                  ${code ? row('Transaction Code', esc(code), 'font-family: monospace; font-weight: bold;') : ''}
                </table>
                <div style="margin-top: 24px;">
                  <a href="${prestigeDashboardUrl}" style="display: inline-block; background: #c1ff1a; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                    Open Prestige Dashboard →
                  </a>
                </div>
              </div>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Failed to send ops notification:', emailError);
      }
    }

    return res.status(201).json({
      success: true,
      orderNumber,
      amountKes,
      seatLabels,
      message: 'Order created. Our team will verify your payment and send tickets to your email.',
    });
  } catch (error: any) {
    console.error('Manual order API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
