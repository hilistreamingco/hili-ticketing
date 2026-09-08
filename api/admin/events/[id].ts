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
  res.setHeader('Access-Control-Allow-Methods', 'PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const user = getAuthedUser(req.headers.authorization as string);
    if (!user || user.role !== 'hili_admin') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Event ID required' });
    }

    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // PUT - Update event
    if (req.method === 'PUT') {
      const body = req.body;
      const { data, error } = await supabase
        .from('events')
        .update({
          name: body.name,
          short_description: body.short_description,
          description: body.description,
          poster_path: body.poster_path,
          venue: body.venue,
          address: body.address,
          city: body.city,
          event_date: body.event_date,
          start_time: body.start_time,
          end_time: body.end_time,
          venue_map_url: body.venue_map_url,
          status: body.status,
          is_current: body.is_current,
          theme: body.theme,
          settings: body.settings,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ event: data });
    }

    // DELETE - Delete event
    if (req.method === 'DELETE') {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Event API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
