/**
 * Hili Admin API — server-side event & ticket management.
 * All routes use the Supabase service role key so they bypass RLS entirely.
 * All routes are gated to hili_admin role.
 */
import type { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";

// ── Service-role client ────────────────────────────────────────────────────
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured. Set SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ── Auth guard ─────────────────────────────────────────────────────────────
async function requireHiliAdmin(authHeader: string | undefined): Promise<{ uid: string } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", data.user.id)
    .single();

  if (member?.role !== "hili_admin") return null;
  return { uid: data.user.id };
}

// ── Ensure org exists (server-side, no RLS problem) ────────────────────────
async function ensureOrg(): Promise<string> {
  const supabase = getAdminClient();
  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from("organizations")
    .insert({ name: "Hili" })
    .select("id")
    .single();
  if (error || !created) throw new Error("Could not bootstrap organization");
  return created.id as string;
}

// ── GET /api/admin/events ──────────────────────────────────────────────────
export const handleGetEvents: RequestHandler = async (req, res) => {
  const actor = await requireHiliAdmin(req.headers.authorization);
  if (!actor) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const { data, error } = await getAdminClient()
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
  const actor = await requireHiliAdmin(req.headers.authorization);
  if (!actor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const body = req.body as Record<string, unknown>;
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    res.status(400).json({ error: "Event name is required" });
    return;
  }

  try {
    const orgId = await ensureOrg();
    const slug = (body.name as string)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `event-${Date.now()}`;

    const { data, error } = await getAdminClient()
      .from("events")
      .insert({
        organization_id: orgId,
        slug,
        name: (body.name as string).trim(),
        short_description: (body.short_description as string | null) ?? null,
        description: (body.description as string | null) ?? null,
        poster_path: (body.poster_path as string | null) ?? null,
        venue: (body.venue as string | null) ?? null,
        address: (body.address as string | null) ?? null,
        city: (body.city as string | null) ?? null,
        event_date: (body.event_date as string | null) ?? null,
        start_time: (body.start_time as string | null) ?? null,
        end_time: (body.end_time as string | null) ?? null,
        venue_map_url: (body.venue_map_url as string | null) ?? null,
        status: (body.status as string) ?? "draft",
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
  const actor = await requireHiliAdmin(req.headers.authorization);
  if (!actor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id } = req.params;
  const body = req.body as Record<string, unknown>;

  try {
    const supabase = getAdminClient();

    // If setting is_current = true, clear it on all other events first
    if (body.is_current === true) {
      await supabase
        .from("events")
        .update({ is_current: false })
        .neq("id", id);
    }

    // Build update payload — only include defined fields
    const patch: Record<string, unknown> = {};
    const fields = [
      "name", "short_description", "description", "poster_path",
      "venue", "address", "city", "event_date", "start_time", "end_time",
      "venue_map_url", "status", "is_current", "theme", "settings",
    ];
    for (const f of fields) {
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
  const actor = await requireHiliAdmin(req.headers.authorization);
  if (!actor) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const { data, error } = await getAdminClient()
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
  const actor = await requireHiliAdmin(req.headers.authorization);
  if (!actor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const body = req.body as Record<string, unknown>;
  if (!body.event_id || !body.name) {
    res.status(400).json({ error: "event_id and name are required" });
    return;
  }

  try {
    const { data, error } = await getAdminClient()
      .from("ticket_types")
      .insert({
        event_id: body.event_id,
        name: body.name,
        description: body.description ?? null,
        price_kes: Number(body.price_kes) || 0,
        quantity_total: Number(body.quantity_total) || 100,
        min_per_order: Number(body.min_per_order) || 1,
        max_per_order: Number(body.max_per_order) || 6,
        sales_start: body.sales_start ?? null,
        sales_end: body.sales_end ?? null,
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
  const actor = await requireHiliAdmin(req.headers.authorization);
  if (!actor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const body = req.body as Record<string, unknown>;
  try {
    const { data, error } = await getAdminClient()
      .from("ticket_types")
      .update({
        name: body.name,
        description: body.description ?? null,
        price_kes: Number(body.price_kes) || 0,
        quantity_total: Number(body.quantity_total) || 0,
        min_per_order: Number(body.min_per_order) || 1,
        max_per_order: Number(body.max_per_order) || 1,
        sales_start: body.sales_start ?? null,
        sales_end: body.sales_end ?? null,
        is_visible: Boolean(body.is_visible),
        is_active: Boolean(body.is_active),
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
  const actor = await requireHiliAdmin(req.headers.authorization);
  if (!actor) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const { error } = await getAdminClient()
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
// Receives a base64-encoded image and uploads it to Supabase Storage
export const handleUploadPoster: RequestHandler = async (req, res) => {
  const actor = await requireHiliAdmin(req.headers.authorization);
  if (!actor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { eventId, base64, mimeType } = req.body as {
    eventId: string;
    base64: string;
    mimeType: string;
  };
  if (!eventId || !base64 || !mimeType) {
    res.status(400).json({ error: "eventId, base64, and mimeType are required" });
    return;
  }

  try {
    const supabase = getAdminClient();
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
