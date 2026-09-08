import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'crypto';

function generateOrderNumber(): string {
  const prefix = 'ORD';
  const timestamp = Date.now().toString().slice(-8);
  const random = randomInt(1000, 9999);
  return `${prefix}-${timestamp}-${random}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      eventSlug,
      ticketTypeName,
      purchaserName,
      purchaserEmail,
      purchaserPhone,
      mpesaName,
      mpesaTransactionCode,
      attendeeNames,
      amountKes,
    } = req.body;

    if (!eventSlug || !ticketTypeName || !purchaserEmail || !purchaserPhone || !attendeeNames?.length) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Get event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name')
      .eq('slug', eventSlug)
      .eq('status', 'published')
      .single();

    if (eventError || !event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get ticket type
    const { data: ticketType, error: ticketError } = await supabase
      .from('ticket_types')
      .select('id, name, price_kes')
      .eq('event_id', event.id)
      .eq('name', ticketTypeName)
      .single();

    if (ticketError || !ticketType) {
      return res.status(404).json({ error: 'Ticket type not found' });
    }

    const orderNumber = generateOrderNumber();

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        event_id: event.id,
        purchaser_name: purchaserName || attendeeNames[0],
        purchaser_email: purchaserEmail,
        purchaser_phone: purchaserPhone,
        amount_kes: amountKes || ticketType.price_kes * attendeeNames.length,
        status: 'pending',
        payment_provider: 'manual',
        mpesa_name: mpesaName,
        mpesa_transaction_code: mpesaTransactionCode,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error('Order creation error:', orderError);
      return res.status(500).json({ error: 'Failed to create order' });
    }

    // Create order items
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert({
        order_id: order.id,
        ticket_type_id: ticketType.id,
        quantity: attendeeNames.length,
        unit_price_kes: ticketType.price_kes,
        attendee_names: attendeeNames,
      });

    if (itemsError) {
      console.error('Order items error:', itemsError);
    }

    // Send notification email to ops team
    const resendKey = process.env.RESEND_API_KEY;
    // Primary notification email - must match Resend account email when using onboarding@resend.dev sender
    const opsEmail = process.env.OPS_NOTIFICATION_EMAIL || 'hilistreaming.co@gmail.com';

    if (resendKey) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(resendKey);
        
        const prestigeDashboardUrl = 'https://hili-ticketing.vercel.app/admin/prestige';
        
        // Use onboarding@resend.dev as from - delivers to verified Resend account email only
        // For production: verify hili.co domain in Resend dashboard
        await resend.emails.send({
          from: 'HILI Tickets <onboarding@resend.dev>',
          to: [opsEmail],
          subject: `🎟️ New Order: ${order.order_number} - KES ${amountKes}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
              <div style="background: #c1ff1a; padding: 16px 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0; color: #000; font-size: 18px;">🎟️ New Ticket Order</h2>
              </div>
              <div style="background: white; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #eee;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 8px 0; color: #666; width: 140px;">Order Number</td><td style="padding: 8px 0; font-weight: bold;">${order.order_number}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Customer</td><td style="padding: 8px 0;">${purchaserName}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Email</td><td style="padding: 8px 0;">${purchaserEmail}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Phone</td><td style="padding: 8px 0;">${purchaserPhone}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Event</td><td style="padding: 8px 0;">${event.name}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Tier</td><td style="padding: 8px 0;">${ticketType.name}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Tickets</td><td style="padding: 8px 0;">${attendeeNames.length}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Amount</td><td style="padding: 8px 0; font-weight: bold; color: #2a7a00;">KES ${Number(amountKes).toLocaleString()}</td></tr>
                  ${mpesaName ? `<tr><td style="padding: 8px 0; color: #666;">M-Pesa Name</td><td style="padding: 8px 0;">${mpesaName}</td></tr>` : ''}
                  ${mpesaTransactionCode ? `<tr><td style="padding: 8px 0; color: #666;">Transaction Code</td><td style="padding: 8px 0; font-family: monospace; font-weight: bold;">${mpesaTransactionCode}</td></tr>` : ''}
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
        console.log('Ops notification sent to:', opsEmail);
      } catch (emailError) {
        console.error('Failed to send ops notification:', emailError);
      }
    }

    return res.status(201).json({ 
      success: true,
      orderNumber: order.order_number,
      message: 'Order created. Our team will verify your payment and send tickets to your email.'
    });
  } catch (error: any) {
    console.error('Manual order API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
