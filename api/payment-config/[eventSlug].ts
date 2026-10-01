import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthedUser, getServiceClient, isHiliAdmin } from '../_lib/auth.js';

// Public: the till / paybill details buyers see at checkout.
//
// This used to read with the public (anon) key, but payment_config has row
// level security switched on and no policy for anon, so it always came back
// empty. It now reads with the service key and returns only this one event's
// config. A signed-in Hili admin also gets the config of unpublished events,
// so the Payment config screen works for drafts.
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
    const { eventSlug } = req.query;
    if (!eventSlug || typeof eventSlug !== 'string') {
      return res.status(400).json({ error: 'Event slug required' });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const admin = isHiliAdmin(await getAuthedUser(req.headers.authorization as string));

    // Get event by slug
    let eventQuery = supabase.from('events').select('id').eq('slug', eventSlug);
    if (!admin) eventQuery = eventQuery.eq('status', 'published');
    const { data: event, error: eventError } = await eventQuery.maybeSingle();

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
