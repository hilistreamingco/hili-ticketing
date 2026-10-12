import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthedUser, getServiceClient, isHiliAdmin } from '../lib/auth.js';

// Admin CRUD for campaigns. Published campaigns (and their published events)
// are read directly by the public site via Supabase, so this file only handles
// create / update / delete / reorder for admins.
//
// Routes (wired in api/index.ts):
//   GET    /api/admin/campaigns            list all campaigns + their events
//   POST   /api/admin/campaigns            create a campaign
//   PUT    /api/admin/campaigns/:id        update a campaign (name, status, ...)
//   DELETE /api/admin/campaigns/:id        delete (only when no events attached)
//   POST   /api/admin/campaigns/:id/events attach an event: { eventId }
//   DELETE /api/admin/campaigns/:id/events/:eventId  detach an event

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user = await getAuthedUser(req.headers.authorization as string);
    if (!isHiliAdmin(user)) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = getServiceClient();
    if (!supabase) return res.status(500).json({ error: 'Missing Supabase config' });

    const { id, eventId } = req.query as Record<string, string | undefined>;

    // ── List all campaigns with their events (admin sees everything) ───────
    if (req.method === 'GET' && !id) {
      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('*, events(*)')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ campaigns: campaigns || [] });
    }

    // ── Create campaign ───────────────────────────────────────────────────
    if (req.method === 'POST' && !id) {
      const body = req.body || {};
      const name = (body.name as string)?.trim();
      if (!name) return res.status(400).json({ error: 'Campaign name is required' });

      const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'campaign';

      const { data: existing } = await supabase
        .from('campaigns')
        .select('id')
        .eq('slug', base)
        .maybeSingle();
      const slug = existing ? `${base}-${Date.now()}` : base;

      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          slug,
          name,
          short_description: body.short_description ?? null,
          description: body.description ?? null,
          poster_path: body.poster_path ?? null,
          status: body.status ?? 'draft',
          sort_order: body.sort_order ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ campaign: data });
    }

    // Everything below targets a specific campaign.
    if (!id) return res.status(400).json({ error: 'Campaign ID required' });

    const { data: campaign, error: findErr } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // ── Update campaign ───────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const body = req.body || {};
      const fields: Record<string, unknown> = {};
      for (const k of ['name', 'short_description', 'description', 'poster_path', 'status', 'sort_order']) {
        if (k in body) fields[k] = body[k];
      }
      fields.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('campaigns')
        .update(fields)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.json({ campaign: data });
    }

    // ── Delete campaign (only if no events are attached) ──────────────────
    if (req.method === 'DELETE' && !eventId) {
      const { count } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', id);
      if (count) {
        return res.status(409).json({
          error: 'This campaign still has events attached. Remove them before deleting.',
        });
      }
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw error;
      return res.json({ success: true });
    }

    // ── Attach event to campaign ─────────────────────────────────────────
    if (req.method === 'POST' && eventId === undefined && req.body?.eventId) {
      const evId = req.body.eventId as string;
      const { data: ev, error: evErr } = await supabase
        .from('events')
        .select('id, campaign_id')
        .eq('id', evId)
        .maybeSingle();
      if (evErr) throw evErr;
      if (!ev) return res.status(404).json({ error: 'Event not found' });

      // Max-3 rule is enforced by the DB trigger, but give a friendly message.
      const { count } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', id);
      if ((count ?? 0) >= 3) {
        return res.status(409).json({ error: 'A campaign can hold at most 3 events.' });
      }

      const { error } = await supabase
        .from('events')
        .update({ campaign_id: id })
        .eq('id', evId);
      if (error) {
        if (error.code === '23514' || /at most 3/i.test(error.message)) {
          return res.status(409).json({ error: 'A campaign can hold at most 3 events.' });
        }
        throw error;
      }
      return res.json({ success: true });
    }

    // ── Detach event from campaign ───────────────────────────────────────
    if (req.method === 'DELETE' && eventId) {
      const { error } = await supabase
        .from('events')
        .update({ campaign_id: null })
        .eq('id', eventId);
      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Campaign API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
