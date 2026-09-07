/**
 * Hili Admin API — event & ticket CRUD using service role (bypasses RLS).
 * Auth is email-based: set ADMIN_EMAILS in .env.
 */
import type { RequestHandler } from "express";
import { getAuthedUser, getServiceClient, requireHiliAdmin } from "../lib/auth";

// ── GET /api/admin/me ──────────────────────────────────────────────────────
export const handleGetMyRole: RequestHandler = async (req, res) => {
  const user = await getAuthedUser(req.headers.authorization);
  if (!user) {
    res.json({ role: null });
    return;
  }
  res.json({ role: user.role, email: user.email, userId: user.uid });
};

// ── GET /api/admin/events ──────────────────────────────────────────────────
export const handleGetEvents: RequestHandler = async (req, res) => {
  const user = await getAuthedUser(req.headers.authorization);
  if (!requireHiliAdmin(user)) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const { data, error } = await getServiceClient()
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ events: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not load events" });
  }
};

// ── POST /api/admin/events ─────────────────────────────────────────────────
export const handleCreateEvent: RequestHandler = async (req, res) => {
  const user = await getAuthedUser(req.headers.authorization);
  if (!requireHiliAdmin(user)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const body = req.body as Record<string, unknown>;
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    res.status(400).json({ error: "Event name is required" });
    return;
  }

  try {
    const supabase = getServiceClient();

    // Generate a unique slug — append timestamp if slug already exists
    const base = (body.name as string)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "event";

    const { data: existing } = await supabase
      .from("events")
      .select("id")
      .eq("slug", base)
      .maybeSingle();

    const slug = existing ? `${base}-${Date.now()}` : base;

    // organization_id is now optional — use existing org or skip
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("events")
      .insert({
        organization_id: org?.id ?? null,
        slug,
        name: (body.name as string).trim(),
        short_description: (body.short_description as string) || null,
        description: (body.description as string) || null,
        poster_path: (body.poster_path as string) || null,
        venue: (body.venue as string) || null,
        address: (body.address as string) || null,
        city: (body.city as string) || null,
        event_date: (body.event_date as string) || null,
        start_time: (body.start_time as string) || null,
        end_time: (body.end_time as string) || null,
        venue_map_url: (body.venue_map_url as string) || null,
        status: (body.status as string) || "draft",
        is_current: Boolean(body.is_current),
        theme: (body.theme as object) ?? {},
        settings: (body.settings as object) ?? {},
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ event: data });
  } catch (err) {
    console.error("Create event error", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not create event" });
  }
};

// ── PUT /api/admin/events/:id ──────────────────────────────────────────────
export const handleUpdateEvent: RequestHandler = async (req, res) => {
  const user = await getAuthedUser(req.headers.authorization);
  if (!requireHiliAdmin(user)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id } = req.params;
  const body = req.body as Record<string, unknown>;

  try {
    const supabase = getServiceClient();

    // Clear is_current on all others before setting this one
    if (body.is_current === true) {
      await supabase.from("events").update({ is_current: false }).neq("id", id);
    }

    const patch: Record<string, unknown> = {};
    for (const f of [
      "name", "short_description", "description", "poster_path",
      "venue", "address", "city", "event_date", "start_time", "end_time",
      "venue_map_url", "status", "is_current", "theme", "settings",
    ]) {
      if (f in body) patch[f] = body[f] ?? null;
    }

    const { data, error } = await supabase
      .from("events")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    res.json({ event: data });
  } catch (err) {
    console.error("Update event error", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not update event" });
  }
};

// ── GET /api/admin/events/:id/tickets ──────────────────────────────────────
export const handleGetTicketTypes: RequestHandler = async (req, res) => {
  const user = await getAuthedUser(req.headers.authorization);
  if (!requireHiliAdmin(user)) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const { data, error } = await getServiceClient()
      .from("ticket_types")
      .select("*")
      .eq("event_id", req.params.id)
      .order("sort_order");
    if (error) throw error;
    res.json({ tickets: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not load tickets" });
  }
};

// ── POST /api/admin/tickets ────────────────────────────────────────────────
export const handleCreateTicketType: RequestHandler = async (req, res) => {
  const user = await getAuthedUser(req.headers.authorization);
  if (!requireHiliAdmin(user)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const body = req.body as Record<string, unknown>;
  if (!body.event_id || !body.name) {
    res.status(400).json({ error: "event_id and name are required" });
    return;
  }

  try {
    const { data, error } = await getServiceClient()
      .from("ticket_types")
      .insert({
        event_id: body.event_id,
        name: body.name,
        description: (body.description as string) || null,
        price_kes: Number(body.price_kes) || 0,
        quantity_total: Number(body.quantity_total) || 100,
        min_per_order: Number(body.min_per_order) || 1,
        max_per_order: Number(body.max_per_order) || 6,
        sales_start: (body.sales_start as string) || null,
        sales_end: (body.sales_end as string) || null,
        is_visible: body.is_visible !== false,
        is_active: body.is_active !== false,
        sort_order: Number(body.sort_order) || 0,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ ticket: data });
  } catch (err) {
    console.error("Create ticket type error", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not create ticket type" });
  }
};

// ── PUT /api/admin/tickets/:id ─────────────────────────────────────────────
export const handleUpdateTicketType: RequestHandler = async (req, res) => {
  const user = await getAuthedUser(req.headers.authorization);
  if (!requireHiliAdmin(user)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const body = req.body as Record<string, unknown>;
  try {
    const { data, error } = await getServiceClient()
      .from("ticket_types")
      .update({
        name: body.name,
        description: (body.description as string) || null,
        price_kes: Number(body.price_kes) || 0,
        quantity_total: Number(body.quantity_total) || 0,
        min_per_order: Number(body.min_per_order) || 1,
        max_per_order: Number(body.max_per_order) || 1,
        sales_start: (body.sales_start as string) || null,
        sales_end: (body.sales_end as string) || null,
        is_visible: body.is_visible !== false,
        is_active: body.is_active !== false,
        sort_order: Number(body.sort_order) || 0,
      })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ ticket: data });
  } catch (err) {
    console.error("Update ticket type error", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not update ticket type" });
  }
};

// ── DELETE /api/admin/tickets/:id ──────────────────────────────────────────
export const handleDeleteTicketType: RequestHandler = async (req, res) => {
  const user = await getAuthedUser(req.headers.authorization);
  if (!requireHiliAdmin(user)) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const { error } = await getServiceClient()
      .from("ticket_types")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not delete ticket type" });
  }
};

// ── POST /api/admin/upload-poster ──────────────────────────────────────────
export const handleUploadPoster: RequestHandler = async (req, res) => {
  const user = await getAuthedUser(req.headers.authorization);
  if (!requireHiliAdmin(user)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { eventId, base64, mimeType } = req.body as Record<string, string>;
  if (!eventId || !base64 || !mimeType) {
    res.status(400).json({ error: "eventId, base64, and mimeType are required" });
    return;
  }

  try {
    const supabase = getServiceClient();
    const buffer = Buffer.from(base64, "base64");
    const ext = mimeType.split("/")[1] || "jpg";
    const path = `${eventId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from("event-posters")
      .upload(path, buffer, { contentType: mimeType, upsert: true });
    if (error) throw error;

    const { data: urlData } = supabase.storage.from("event-posters").getPublicUrl(path);
    res.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error("Upload poster error", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
};
