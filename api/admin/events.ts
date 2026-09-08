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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return res.json({ events: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body;
      if (!body.name || typeof body.name !== 'string') {
        return res.status(400).json({ error: 'Event name is required' });
      }

      const base = body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'event';

      const { data: existing } = await supabase
        .from('events')
        .select('id')
        .eq('slug', base)
        .maybeSingle();

      const slug = existing ? `${base}-${Date.now()}` : base;

      const { data, error } = await supabase
        .from('events')
        .insert({
          organization_id: null,
          slug,
          name: body.name.trim(),
          short_description: body.short_description || null,
          description: body.description || null,
          poster_path: body.poster_path || null,
          venue: body.venue || null,
          address: body.address || null,
          city: body.city || null,
          event_date: body.event_date || null,
          start_time: body.start_time || null,
          end_time: body.end_time || null,
          venue_map_url: body.venue_map_url || null,
          status: body.status || 'draft',
          is_current: Boolean(body.is_current),
          theme: body.theme || {},
          settings: body.settings || {},
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ event: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Events API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
