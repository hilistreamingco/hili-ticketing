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
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const opsEmail = process.env.OPS_NOTIFICATION_EMAIL || process.env.CONTACT_TO_EMAIL;

    if (resendKey && opsEmail) {
      try {
        const Resend = (await import('resend')).Resend;
        const resend = new Resend(resendKey);
        
        const prestigeDashboardUrl = 'https://hili-ticketing.vercel.app/admin/prestige';
        
        await resend.emails.send({
          from: fromEmail,
          to: opsEmail,
          subject: `🎟️ New Order: ${order.order_number} - KES ${amountKes}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #333;">New Ticket Order Received</h2>
              <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Order Number:</strong> ${order.order_number}</p>
                <p><strong>Customer:</strong> ${purchaserName}</p>
                <p><strong>Email:</strong> ${purchaserEmail}</p>
                <p><strong>Phone:</strong> ${purchaserPhone}</p>
                <p><strong>Event:</strong> ${event.name}</p>
                <p><strong>Ticket Type:</strong> ${ticketType.name}</p>
                <p><strong>Quantity:</strong> ${attendeeNames.length}</p>
                <p><strong>Amount:</strong> KES ${amountKes.toLocaleString()}</p>
                ${mpesaName ? `<p><strong>M-Pesa Name:</strong> ${mpesaName}</p>` : ''}
                ${mpesaTransactionCode ? `<p><strong>Transaction Code:</strong> ${mpesaTransactionCode}</p>` : ''}
              </div>
              <div style="margin: 30px 0;">
                <a href="${prestigeDashboardUrl}" style="display: inline-block; background: #c1ff1a; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  View in Prestige Dashboard →
                </a>
              </div>
              <p style="color: #666; font-size: 12px; margin-top: 30px;">
                Log in to the Prestige Dashboard to verify the payment and send tickets.
              </p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Failed to send ops notification:', emailError);
        // Don't fail the request if email fails
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
