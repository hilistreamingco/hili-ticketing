import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthedUser, getServiceClient, isHiliAdmin } from '../_lib/auth.js';
import { cleanEventFields, derivePrefix, uniquePrefix } from '../_lib/event-fields.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

    if (req.method === 'GET') {
      // Soonest first; undated drafts last. Every event is listed, none is "special".
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true, nullsFirst: false })
        .order('start_time', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.json({ events: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { fields, error: invalid } = cleanEventFields(body);
      if (invalid) return res.status(400).json({ error: invalid });
      if (!fields.name) return res.status(400).json({ error: 'Event name is required' });

      const name = fields.name as string;
      const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'event';

      const { data: existing } = await supabase
        .from('events')
        .select('id')
        .eq('slug', base)
        .maybeSingle();
      const slug = existing ? `${base}-${Date.now()}` : base;

      const eventType = (fields.event_type as string) || 'general';
      let seatLayoutId: string | null = null;
      if (eventType === 'cinema') {
        const { data: layout } = await supabase
          .from('seat_layouts')
          .select('id')
          .eq('slug', 'cinema-1')
          .maybeSingle();
        if (!layout) {
          return res.status(400).json({ error: 'The cinema seat layout is missing. Run migration 009 first.' });
        }
        seatLayoutId = layout.id;
      }
      const pricingMode = eventType === 'cinema' && fields.pricing_mode === 'seats_taken' ? 'seats_taken' : 'tiers';

      const ticketPrefix = (fields.ticket_prefix as string | null) || (await uniquePrefix(supabase, derivePrefix(name)));

      const { data, error } = await supabase
        .from('events')
        .insert({
          slug,
          name,
          short_description: fields.short_description ?? null,
          description: fields.description ?? null,
          poster_path: fields.poster_path ?? null,
          venue: fields.venue ?? null,
          address: fields.address ?? null,
          city: fields.city ?? null,
          event_date: fields.event_date ?? null,
          start_time: fields.start_time ?? null,
          end_time: fields.end_time ?? null,
          venue_map_url: fields.venue_map_url ?? null,
          status: fields.status ?? 'draft',
          theme: fields.theme ?? {},
          settings: fields.settings ?? {},
          event_type: eventType,
          seat_layout_id: seatLayoutId,
          pricing_mode: pricingMode,
          ticket_prefix: ticketPrefix,
          max_seats_per_order: fields.max_seats_per_order ?? 6,
          sales_close_at: fields.sales_close_at ?? null,
          sales_override: fields.sales_override ?? 'auto',
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ event: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Events API error:', error);
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'That ticket prefix is already used by another event.' });
    }
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
