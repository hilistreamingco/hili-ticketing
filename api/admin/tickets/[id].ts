import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthedUser, getServiceClient, isHiliAdmin } from '../../_lib/auth.js';
import { cleanTierFields } from '../../_lib/tier-fields.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const user = await getAuthedUser(req.headers.authorization as string);
    if (!isHiliAdmin(user)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Ticket ID required' });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    // PUT - Update ticket type
    if (req.method === 'PUT') {
      const { fields, error: invalid } = cleanTierFields(req.body || {}, false);
      if (invalid) return res.status(400).json({ error: invalid });

      const { data, error } = await supabase
        .from('ticket_types')
        .update(fields)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ ticket: data });
    }

    // DELETE - Delete ticket type (not allowed once orders reference it)
    if (req.method === 'DELETE') {
      const { count } = await supabase
        .from('order_items')
        .select('id', { count: 'exact', head: true })
        .eq('ticket_type_id', id);
      if (count) {
        return res.status(409).json({
          error: 'This tier already has orders, so it cannot be deleted. Turn off "Sales active" instead.',
        });
      }

      const { error } = await supabase
        .from('ticket_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Ticket API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
