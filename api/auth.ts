// Validation for event create / update, shared by api/admin/events.ts and
// api/admin/events/[id].ts. Only keys present in the body are returned, so a
// partial PUT (for example just poster_path) leaves everything else alone.

type Body = Record<string, any>;
export type Cleaned = { fields: Record<string, unknown>; error?: string };

const STATUSES = ['draft', 'published', 'archived'];
const TYPES = ['general', 'cinema', 'gate'];
const MODES = ['tiers', 'seats_taken'];
const OVERRIDES = ['auto', 'open', 'closed'];
export const PREFIX_RE = /^[A-Z0-9]{2,8}$/;

export function cleanEventFields(body: Body): Cleaned {
  const f: Record<string, unknown> = {};
  const fail = (error: string): Cleaned => ({ fields: f, error });

  const text = (k: string) => {
    if (body[k] === undefined) return;
    f[k] = body[k] === null || body[k] === '' ? null : String(body[k]);
  };
  ['short_description', 'description', 'poster_path', 'venue', 'address', 'city',
    'venue_map_url', 'event_date', 'start_time', 'end_time'].forEach(text);

  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) return fail('Event name is required');
    f.name = name;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return fail('Invalid status');
    f.status = body.status;
  }
  if (body.event_type !== undefined) {
    if (!TYPES.includes(body.event_type)) return fail('Invalid event type');
    f.event_type = body.event_type;
  }
  if (body.pricing_mode !== undefined) {
    if (!MODES.includes(body.pricing_mode)) return fail('Invalid pricing mode');
    f.pricing_mode = body.pricing_mode;
  }
  if (body.sales_override !== undefined) {
    if (!OVERRIDES.includes(body.sales_override)) return fail('Invalid sales setting');
    f.sales_override = body.sales_override;
  }
  if (body.sales_close_at !== undefined) {
    if (body.sales_close_at === null || body.sales_close_at === '') {
      f.sales_close_at = null;
    } else {
      const d = new Date(body.sales_close_at);
      if (Number.isNaN(d.getTime())) return fail('Sales closing date is not valid');
      f.sales_close_at = d.toISOString();
    }
  }
  if (body.max_seats_per_order !== undefined) {
    const n = Math.floor(Number(body.max_seats_per_order));
    if (!(n >= 1 && n <= 20)) return fail('Seats per order must be between 1 and 20');
    f.max_seats_per_order = n;
  }
  if (body.ticket_prefix !== undefined) {
    const p = body.ticket_prefix === null || body.ticket_prefix === ''
      ? null
      : String(body.ticket_prefix).trim().toUpperCase();
    if (p !== null && !PREFIX_RE.test(p)) return fail('Ticket prefix must be 2 to 8 letters or digits');
    f.ticket_prefix = p;
  }
  if (body.theme !== undefined) f.theme = body.theme;
  if (body.settings !== undefined) f.settings = body.settings;

  return { fields: f };
}

/** "HILI x Beerbirds Live" -> "HXBL". Falls back to EVT. */
export function derivePrefix(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  let base = words.map((w) => w[0]).join('').slice(0, 4);
  if (base.length < 2) base = words.join('').slice(0, 4);
  return base.length >= 2 ? base : 'EVT';
}

/** First unused prefix: base, base2, base3, ... (never longer than 8). */
export async function uniquePrefix(supabase: any, base: string, excludeEventId?: string): Promise<string> {
  for (let i = 1; i < 100; i++) {
    const suffix = i === 1 ? '' : String(i);
    const candidate = base.slice(0, 8 - suffix.length) + suffix;
    let q = supabase.from('events').select('id').eq('ticket_prefix', candidate);
    if (excludeEventId) q = q.neq('id', excludeEventId);
    const { data } = await q.limit(1);
    if (!data || data.length === 0) return candidate;
  }
  throw new Error('Could not find a free ticket prefix, please set one manually');
}
