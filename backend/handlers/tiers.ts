import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthedUser, getServiceClient, isHiliAdmin } from '../lib/auth.js';
import { cleanTierFields } from '../lib/tier-fields.js';

// POST - create a ticket tier (early bird, advance, special offer, ...) for any event.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getAuthedUser(req.headers.authorization as string);
    if (!isHiliAdmin(user)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    const body = req.body || {};
    if (!body.event_id || typeof body.event_id !== 'string') {
      return res.status(400).json({ error: 'event_id is required' });
    }

    const { fields, error: invalid } = cleanTierFields(body, true);
    if (invalid) return res.status(400).json({ error: invalid });

    const { data, error } = await supabase
      .from('ticket_types')
      .insert({
        event_id: body.event_id,
        description: null,
        price_kes: 0,
        quantity_total: 0,
        min_per_order: 1,
        max_per_order: 6,
        sales_start: null,
        sales_end: null,
        is_visible: true,
        is_active: true,
        sort_order: 0,
        ...fields,
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
