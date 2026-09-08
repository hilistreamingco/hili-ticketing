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
  
  if (adminEmails.includes(email)) {
    return { uid: payload.sub || '', email, role: 'hili_admin' };
  }
  if (prestigeEmails.includes(email)) {
    return { uid: payload.sub || '', email, role: 'prestige_user' };
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

  if (req.method !== 'GET') {
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

    // Get order stats
    const { data: orders } = await supabase
      .from('orders')
      .select('status, amount_kes, fulfillment_status, order_items(quantity)');

    const allOrders = orders || [];
    const pending = allOrders.filter(o => o.status === 'pending' || o.status === 'processing');
    const confirmed = allOrders.filter(o => o.status === 'confirmed' || o.status === 'paid');
    const notSent = confirmed.filter(o => o.fulfillment_status !== 'sent');
    const sent = confirmed.filter(o => o.fulfillment_status === 'sent');

    const totalRevenue = confirmed.reduce((sum, o) => sum + (o.amount_kes || 0), 0);
    const totalTickets = confirmed.reduce((sum, o) => {
      const items = o.order_items || [];
      return sum + (items.reduce((s, i) => s + (i.quantity || 0), 0) || 0);
    }, 0);

    return res.json({
      totalOrders: allOrders.length,
      pendingOrders: pending.length,
      confirmedOrders: confirmed.length,
      notSentCount: notSent.length,
      sentCount: sent.length,
      totalRevenue,
      totalTickets,
      ticketsByType: [],
    });
  } catch (error) {
    console.error('Prestige stats error:', error);
    return res.status(500).json({ error: error.message || 'Could not load stats' });
  }
}
