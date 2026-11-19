import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthedUser, getServiceClient, isHiliAdmin, isCompanyAdmin, canManageEvents, ownsCompany, ownsEvent } from '../lib/auth.js';

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
//
// Hili admins manage everything. Company staff (role company_admin) only see
// and change campaigns of their own company; every route below checks that.
//   DELETE /api/admin/campaigns/:id/events/:eventId  detach an event

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user = await getAuthedUser(req.headers.authorization as string);
    if (!canManageEvents(user)) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = getServiceClient();
    if (!supabase) return res.status(500).json({ error: 'Missing Supabase config' });

    const { id, eventId } = req.query as Record<string, string | undefined>;

    // ── List all campaigns with their events (admin sees everything) ───────
    if (req.method === 'GET' && !id) {
      let listQuery = supabase.from('campaigns').select('*, events(*)');
      if (isCompanyAdmin(user)) listQuery = listQuery.in('company_id', user.companyIds || []);
      const { data: campaigns, error } = await listQuery
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

      let companyId: string | null = body.company_id ? String(body.company_id) : null;
      if (isCompanyAdmin(user) && !ownsCompany(user, companyId)) companyId = user.companyIds?.[0] ?? null;
      if (!companyId) return res.status(400).json({ error: 'Pick the company this campaign is for.' });
      if (body.accent && !/^#[0-9a-fA-F]{6}$/.test(String(body.accent))) {
        return res.status(400).json({ error: 'Accent must be a colour like #ff6a13' });
      }

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
          company_id: companyId,
          banner_url: body.banner_url ?? null,
          banner_video_url: body.banner_video_url ?? null,
          accent: body.accent ?? null,
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
      .select('id, company_id')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!ownsCompany(user, campaign.company_id)) {
      return res.status(403).json({ error: 'That campaign belongs to another company.' });
    }

    // ── Update campaign ───────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const body = req.body || {};
      const fields: Record<string, unknown> = {};
      for (const k of ['name', 'short_description', 'description', 'poster_path', 'status', 'sort_order', 'banner_url', 'banner_video_url', 'accent']) {
        if (k in body) fields[k] = body[k];
      }
      if (fields.accent && !/^#[0-9a-fA-F]{6}$/.test(String(fields.accent))) {
        return res.status(400).json({ error: 'Accent must be a colour like #ff6a13' });
      }
      // Only Hili can move a campaign to another company (its events follow).
      if (isHiliAdmin(user) && 'company_id' in body && body.company_id) {
        fields.company_id = String(body.company_id);
      }
      fields.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('campaigns')
        .update(fields)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      if (fields.company_id) {
        await supabase.from('events').update({ company_id: fields.company_id }).eq('campaign_id', id);
      }
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

      if (!(await ownsEvent(supabase, user, evId))) {
        return res.status(403).json({ error: 'That event belongs to another company.' });
      }

      const { error } = await supabase
        .from('events')
        .update({ campaign_id: id })
        .eq('id', evId);
      if (error) throw error;
      return res.json({ success: true });
    }

    // ── Detach event from campaign ───────────────────────────────────────
    if (req.method === 'DELETE' && eventId) {
      if (!(await ownsEvent(supabase, user, eventId))) {
        return res.status(403).json({ error: 'That event belongs to another company.' });
      }
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
