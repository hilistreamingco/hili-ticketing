import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { eventSlug } = req.query;
    if (!eventSlug || typeof eventSlug !== 'string') {
      return res.status(400).json({ error: 'Event slug required' });
    }

    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const supabase = createClient(url, key);

    // Get event by slug
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id')
      .eq('slug', eventSlug)
      .eq('status', 'published')
      .maybeSingle();

    if (eventError || !event) {
      return res.json({ config: null });
    }

    // Get payment config for this event
    const { data: config, error: configError } = await supabase
      .from('payment_config')
      .select('*')
      .eq('event_id', event.id)
      .eq('is_active', true)
      .maybeSingle();

    if (configError) {
      console.error('Payment config error:', configError);
      return res.json({ config: null });
    }

    return res.json({ config: config || null });
  } catch (error: any) {
    console.error('Payment config API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
