import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthedUser, getServiceClient, isHiliAdmin } from '../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getAuthedUser(req.headers.authorization as string);
    if (!isHiliAdmin(user)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Event ID required' });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const { data, error } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('event_id', id)
      .order('sort_order', { ascending: true })
      .order('price_kes', { ascending: true }); // ticket_types has no created_at column

    if (error) throw error;

    // quantity_sold on the row is never updated by the order flow, so report the
    // real number: quantity on live (not cancelled / refunded) orders.
    const tiers = await Promise.all(
      (data || []).map(async (t: any) => {
        const { data: sold } = await supabase.rpc('ticket_type_sold', { p_type: t.id });
        return { ...t, quantity_sold: typeof sold === 'number' ? sold : 0 };
      }),
    );

    return res.json({ tickets: tiers });
  } catch (error: any) {
    console.error('Tickets API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
