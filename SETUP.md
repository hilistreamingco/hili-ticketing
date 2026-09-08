# Hili Ticketing — Final Setup Steps

All code is complete. Follow these steps to finish deployment:

## 1. Run Database Migration

Go to your Supabase project → SQL Editor and run migration 005:

### Migration 005 (all-in-one setup)
Copy the entire content of `supabase/migrations/005_fresh_email_auth.sql` and paste it into the SQL Editor, then click Run.

**What it does:**
- Makes `organization_id` nullable in events table
- Drops `organizations` and `organization_members` tables entirely
- Creates `audit_log` and `payment_config` tables (if missing)
- Sets up email-based auth (ADMIN_EMAILS / PRESTIGE_EMAILS)
- Configures RLS policies for service role writes + authenticated reads

**Note:** This migration is safe to run even if you've partially run other migrations. It uses `IF NOT EXISTS` and `IF EXISTS` throughout.

---

## 2. Set Environment Variables

### Local development (`.env`)
Already set. Just add your `SUPABASE_SERVICE_ROLE_KEY`:

```bash
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Get it from: Supabase Dashboard → Settings → API → `service_role` key (secret).

### Production (Vercel)
Set these in Vercel → Project Settings → Environment Variables:

```
ADMIN_EMAILS=hilistreaming.co@gmail.com
PRESTIGE_EMAILS=social@prestigeplaza.co.ke,hilistreaming.co@gmail.com
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
MPESA_TILL_NUMBER=5451657
RESEND_API_KEY=<your_resend_key>
OPS_NOTIFICATION_EMAIL=hilistreaming.co@gmail.com
```

All other env vars (Supabase URLs, M-Pesa mock config) are already in `.env` and will be copied automatically.

---

## 3. Test the Flow

1. **Start dev server**: `npm run dev`
2. **Admin login**: Go to http://localhost:8080/admin
   - Sign in with `hilistreaming.co@gmail.com` (must exist in Supabase Auth)
   - If login fails with "Access denied", the email check is working — add your email to `ADMIN_EMAILS` in `.env`
3. **Create an event**:
   - Fill in event name, date, venue
   - Click Save → event is created
   - Upload a poster
   - Add ticket tiers (name, price, quantity)
   - Set status to "published"
4. **Check frontend**: Go to http://localhost:8080
   - You should see your event on the homepage (real-time from DB)
5. **Prestige login**: http://localhost:8080/admin/prestige
   - Sign in with `social@prestigeplaza.co.ke`
   - View orders, confirm payments, send tickets

---

## 4. Deploy to Production

```bash
git push origin main  # or your default branch
```

Vercel will auto-deploy. Make sure:
- All env vars are set in Vercel dashboard
- Supabase service role key is correct
- M-Pesa Till number = 5451657

---

## 5. Type Errors in VS Code?

The red squiggles for `express`, `Buffer`, `process` are IDE-only. The code compiles fine.

**To fix**: Reload VS Code's TypeScript server:
1. Open any `.ts` file in `server/`
2. Press `Ctrl+Shift+P` (Windows) or `Cmd+Shift+P` (Mac)
3. Type "TypeScript: Restart TS Server"
4. Hit Enter

The errors will disappear.

---

## What Changed

### Email-Based Auth
- **Before**: Auth checked `organization_members` table (required a row per user)
- **After**: Auth checks if user email is in `ADMIN_EMAILS` or `PRESTIGE_EMAILS` env var
- **Result**: No database setup needed for new admin users — just add their email to the env var

### Real-Time Data
- **Before**: Homepage showed mock/stock events hardcoded in `events.ts`
- **After**: Homepage fetches from Supabase `events` table, subscribes to changes via Realtime
- **Result**: Any event created in Admin dashboard appears on the homepage instantly

### Till Number
- Set to `5451657` in `.env` as `MPESA_TILL_NUMBER`
- Checkout page shows this number in payment instructions
- Can be overridden per-event via Admin → Payment config

### Organizations Removed
- The `organizations` and `organization_members` tables are dropped entirely in migration 004
- Events no longer require an `organization_id` (nullable in schema)
- RLS policies simplified: service role handles writes, authenticated users can read ops data
- Access control is purely email-based at the API layer

---

## Troubleshooting

### "Access denied" on admin login
→ Your email is not in `ADMIN_EMAILS` or `PRESTIGE_EMAILS`. Add it to `.env` and restart the server.

### "SUPABASE_SERVICE_ROLE_KEY is not set"
→ Get the key from Supabase Dashboard → Settings → API → `service_role` (secret).  
→ Add it to `.env` (local) and Vercel env vars (production).

### "relation public.audit_log does not exist"
→ Run migration 005 instead — it creates audit_log if missing (migrations 003/004 assumed you'd run 001 first)

### "drop index events_slug_key" fails
→ Migration 005 handles this correctly — run it instead of 003/004

### Vercel build fails with "node:path" error
→ Fixed in latest commit — re-deploy from the updated branch
→ Check that event `status = 'published'` in Supabase Dashboard → Table Editor → events  
→ Check browser console for Supabase errors (wrong anon key, wrong URL, etc.)

### Real-time not working
→ Go to Supabase Dashboard → Database → Replication  
→ Make sure `events`, `ticket_types`, and `orders` are enabled for Realtime

---

## Next Steps

1. Run migrations 003 + 004 in Supabase SQL Editor
2. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env`
3. Test locally (create event, publish, check homepage)
4. Deploy to Vercel
5. Set all production env vars in Vercel dashboard
6. Create your first live event!

---

**Support**: hilistreaming.co@gmail.com
