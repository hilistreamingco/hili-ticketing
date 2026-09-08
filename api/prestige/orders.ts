import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

function getAuthedUser(authHeader: string | undefined) {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const user = getAuthedUser(req.headers.authorization as string);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const { status, fulfillment } = req.query;

    let query = supabase
      .from('orders')
      .select('*, order_items(*), event:events(name)')
      .order('created_at', { ascending: false });

    // Filter by status
    if (status === 'pending') {
      query = query.in('status', ['pending', 'processing']);
    } else if (status === 'confirmed') {
      query = query.in('status', ['confirmed', 'paid']);
      if (fulfillment) {
        query = query.eq('fulfillment_status', fulfillment);
      }
    } else if (status === 'sent') {
      query = query.in('status', ['confirmed', 'paid']).eq('fulfillment_status', 'sent');
    }

    const { data: orders, error } = await query;

    if (error) throw error;

    return res.json({ orders: orders || [] });
  } catch (error: any) {
    console.error('List orders error:', error);
    return res.status(500).json({ error: error.message || 'Could not load orders' });
  }
}
