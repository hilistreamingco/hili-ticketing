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

    // Get order with tickets
    const { data: order } = await supabase
      .from('orders')
      .select('*, tickets(*, event:events(*), ticket_type:ticket_types(*))')
      .eq('id', orderId)
      .single();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.tickets || order.tickets.length === 0) {
      return res.status(400).json({ error: 'No tickets found. Confirm payment first.' });
    }

    // Check if already sent
    if (order.fulfillment_status === 'sent') {
      return res.json({ success: true, message: 'Ticket was already sent' });
    }

    // TODO: Send email with tickets
    // For now, just mark as sent
    await supabase
      .from('orders')
      .update({
        fulfillment_status: 'sent',
        fulfilled_at: new Date().toISOString(),
        fulfilled_by: user.uid,
      })
      .eq('id', orderId);

    return res.json({ 
      success: true, 
      message: `Ticket${order.tickets.length > 1 ? 's' : ''} sent successfully` 
    });
  } catch (error) {
    console.error('Send ticket error:', error);
    return res.status(500).json({ error: 'Could not send ticket. Please try again.' });
  }
}
