import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthedUser, getServiceClient, isHiliAdmin } from '../lib/auth.js';
import { cleanEventFields, derivePrefix, uniquePrefix } from '../lib/event-fields.js';

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
      return res.status(400).json({ error: 'Event ID required' });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return res.status(500).json({ error: 'Missing Supabase config' });
    }

    // GET - fetch single event
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return res.json({ event: data });
    }

    // PUT - Update event (partial: only the keys sent are changed)
    if (req.method === 'PUT') {
      const { data: current, error: currentError } = await supabase
        .from('events')
        .select('id, name, status, event_type, pricing_mode, ticket_prefix, ticket_counter')
        .eq('id', id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) return res.status(404).json({ error: 'Event not found' });

      const { fields, error: invalid } = cleanEventFields(req.body || {});
      if (invalid) return res.status(400).json({ error: invalid });

      const finalType = (fields.event_type as string) ?? current.event_type;
      const finalMode = finalType === 'general'
        ? 'tiers'
        : ((fields.pricing_mode as string) ?? current.pricing_mode);
      const finalStatus = (fields.status as string) ?? current.status;

      // Type and pricing mode decide how orders are built; lock them once sales exist.
      const changingType = fields.event_type !== undefined && fields.event_type !== current.event_type;
      const changingMode = fields.pricing_mode !== undefined && fields.pricing_mode !== current.pricing_mode;
      if (changingType || changingMode) {
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', id);
        if (count) {
          return res.status(409).json({ error: 'Event type and pricing mode cannot change once the event has orders.' });
        }
      }

      if (fields.ticket_prefix !== undefined
          && fields.ticket_prefix !== current.ticket_prefix
          && current.ticket_counter > 0) {
        return res.status(409).json({ error: 'The ticket prefix cannot change after tickets have been issued.' });
      }

      if (finalType === 'general') {
        fields.seat_layout_id = null;
        fields.pricing_mode = 'tiers';
      } else if (current.event_type !== 'cinema') {
        const { data: layout } = await supabase
          .from('seat_layouts')
          .select('id')
          .eq('slug', 'cinema-1')
          .maybeSingle();
        if (!layout) {
          return res.status(400).json({ error: 'The cinema seat layout is missing. Run migration 009 first.' });
        }
        fields.seat_layout_id = layout.id;
      }
      if (finalMode === 'seats_taken' && finalType !== 'cinema') {
        return res.status(400).json({ error: 'Pricing by seats taken is only for cinema events.' });
      }

      // A published event needs a ticket prefix to issue tickets later.
      const prefixAfter = fields.ticket_prefix !== undefined ? fields.ticket_prefix : current.ticket_prefix;
      if (!prefixAfter) {
        const name = (fields.name as string) ?? current.name;
        fields.ticket_prefix = await uniquePrefix(supabase, derivePrefix(name), id);
      }

      if (finalStatus === 'published' && finalMode === 'seats_taken') {
        const { count } = await supabase
          .from('event_price_brackets')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', id);
        if (!count) {
          return res.status(400).json({ error: 'Add at least one price bracket before publishing.' });
        }
      }

      const { data, error } = await supabase
        .from('events')
        .update(fields)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ event: data });
    }

    // DELETE - Delete event (only when nothing was ever ordered)
    if (req.method === 'DELETE') {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id);
      if (count) {
        return res.status(409).json({
          error: 'This event has orders, so it cannot be deleted. Set its status to Archived instead.',
        });
      }

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
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'That ticket prefix is already used by another event.' });
    }
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
