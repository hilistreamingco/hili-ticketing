// Validation for ticket tier create / update, shared by api/admin/tickets.ts
// and api/admin/tickets/[id].ts. Dates arrive as ISO strings (the admin screen
// converts Nairobi wall-clock time); empty strings become null instead of
// failing in Postgres.

type Body = Record<string, any>;
export type CleanedTier = { fields: Record<string, unknown>; error?: string };

export function cleanTierFields(body: Body, isCreate: boolean): CleanedTier {
  const f: Record<string, unknown> = {};
  const fail = (error: string): CleanedTier => ({ fields: f, error });

  if (isCreate || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) return fail('Tier name is required');
    f.name = name;
  }
  if (body.description !== undefined) {
    f.description = body.description === null || body.description === '' ? null : String(body.description);
  }

  const int = (key: string, min: number, label: string): string | null => {
    if (body[key] === undefined) return null;
    const n = Math.floor(Number(body[key]));
    if (!Number.isFinite(n) || n < min) return `${label} must be ${min} or more`;
    f[key] = n;
    return null;
  };
  const problems = [
    int('price_kes', 0, 'Price'),
    int('quantity_total', 0, 'Quantity'),
    int('min_per_order', 1, 'Minimum per order'),
    int('max_per_order', 1, 'Maximum per order'),
    int('sort_order', 0, 'Sort order'),
  ].filter(Boolean) as string[];
  if (problems.length) return fail(problems[0]);

  if (typeof f.min_per_order === 'number' && typeof f.max_per_order === 'number'
      && f.min_per_order > f.max_per_order) {
    return fail('Minimum per order cannot be more than the maximum');
  }

  for (const key of ['sales_start', 'sales_end'] as const) {
    if (body[key] === undefined) continue;
    if (body[key] === null || body[key] === '') { f[key] = null; continue; }
    const d = new Date(body[key]);
    if (Number.isNaN(d.getTime())) return fail(`${key === 'sales_start' ? 'Sales start' : 'Sales end'} is not a valid date`);
    f[key] = d.toISOString();
  }
  if (typeof f.sales_start === 'string' && typeof f.sales_end === 'string'
      && new Date(f.sales_end as string) <= new Date(f.sales_start as string)) {
    return fail('Sales end must be after sales start');
  }

  if (body.is_visible !== undefined) f.is_visible = Boolean(body.is_visible);
  if (body.is_active !== undefined) f.is_active = Boolean(body.is_active);

  return { fields: f };
}
