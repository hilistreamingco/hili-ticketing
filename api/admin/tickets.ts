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
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  
  if (admins.includes(email)) {
    return { uid: payload.sub || '', email, role: 'hili_admin' };
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const user = getAuthedUser(req.headers.authorization as string);
    if (!user || user.role !== 'hili_admin') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const body = req.body;

    const { data, error } = await supabase
      .from('ticket_types')
      .insert({
        event_id: body.event_id,
        name: body.name,
        description: body.description,
        price_kes: body.price_kes,
        quantity_total: body.quantity_total,
        quantity_sold: body.quantity_sold || 0,
        min_per_order: body.min_per_order || 1,
        max_per_order: body.max_per_order,
        sales_start: body.sales_start,
        sales_end: body.sales_end,
        is_visible: body.is_visible !== false,
        is_active: body.is_active !== false,
        sort_order: body.sort_order || 0,
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ ticket: data });
  } catch (error: any) {
    console.error('Create ticket API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
