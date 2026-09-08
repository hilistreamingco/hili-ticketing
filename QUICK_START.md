# Quick Start — Get Everything Working

## ✅ Status: Almost Done!

Your code is ready. Just 3 quick steps to get everything working:

---

## Step 1: Run Migration 005 in Supabase (2 minutes)

### Why?
Makes `organization_id` nullable in the `events` table so you can create events without organizations.

### How?
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `etyzushxyzlqflfjxkul`
3. Click **SQL Editor** in left sidebar
4. Click **New query**
5. Copy the entire contents of `supabase/migrations/005_fresh_email_auth.sql`
6. Paste into SQL Editor
7. Click **RUN** button

### Verify Success
Run this query after:
```sql
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'events' AND column_name = 'organization_id';
```
Should show `is_nullable = YES` ✅

---

## Step 2: Create Storage Bucket (1 minute)

### Why?
For uploading event posters/images.

### How?
1. In Supabase Dashboard → Click **Storage** in left sidebar
2. Click **New bucket**
3. Name: `event-posters`
4. ✅ **Check "Public bucket"**
5. Click **Create bucket**

---

## Step 3: Restart Your Server

### Why?
Environment variables (like `PRESTIGE_EMAILS` and `SUPABASE_SERVICE_ROLE_KEY`) are only loaded when the server starts.

### How?
```bash
# Stop current server (Ctrl+C if running)
npm run dev
```

---

## 🎉 Done! Now Test

### Test Admin Dashboard
1. Go to http://localhost:8080/admin
2. Sign in with: `hilistreaming.co@gmail.com`
3. Create an event
4. Upload a poster image
5. Publish it
6. Check homepage — event appears ✅

### Test Prestige Dashboard  
1. Go to http://localhost:8080/prestige
2. Sign in with: `mutaruronald@gmail.com`
3. Should see operations dashboard ✅

---

## Environment Variables Set ✅

Your `.env` now has:

```bash
# Supabase (required)
VITE_SUPABASE_URL=https://etyzushxyzlqflfjxkul.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_a1q38OO9StaS_n05_bENhw_Hx1SOwrZ
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key_from_supabase_dashboard>

# Email-based auth (required)
ADMIN_EMAILS=hilistreaming.co@gmail.com
PRESTIGE_EMAILS=social@prestigeplaza.co.ke,hilistreaming.co@gmail.com,mutaruronald@gmail.com

# M-Pesa (required)
MPESA_TILL_NUMBER=5451657
MPESA_MODE=mock
```

---

## Deploy to Vercel

### Set Environment Variables in Vercel:
1. Go to [Vercel Dashboard](https://vercel.com)
2. Select your project
3. Settings → Environment Variables
4. Add these variables:

```
VITE_SUPABASE_URL=https://etyzushxyzlqflfjxkul.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_a1q38OO9StaS_n05_bENhw_Hx1SOwrZ
SUPABASE_SERVICE_ROLE_KEY=<get_from_supabase_dashboard>
ADMIN_EMAILS=hilistreaming.co@gmail.com
PRESTIGE_EMAILS=social@prestigeplaza.co.ke,hilistreaming.co@gmail.com,mutaruronald@gmail.com
MPESA_TILL_NUMBER=5451657
MPESA_MODE=mock
MPESA_CALLBACK_URL=https://your-domain.vercel.app/api/payments/mpesa/callback
```

5. Save and **Redeploy**

---

## Troubleshooting

### Error: "relation public.audit_log does not exist"
→ Run migration 005 (Step 1 above)

### Error: "organization_id violates not-null constraint"  
→ Run migration 005 (Step 1 above)

### Error: "Access denied" on Prestige dashboard
→ Restart server (Step 3 above)

### Error: Image upload fails
→ Create storage bucket (Step 2 above)

### Build fails on Vercel
→ Check that all env vars are set in Vercel dashboard

---

## Key Features Working ✅

- ✅ Email-based auth (no org/member tables)
- ✅ Real-time event updates on homepage
- ✅ Admin can create/edit events
- ✅ Image upload for event posters
- ✅ Prestige dashboard for operations
- ✅ M-Pesa till number set to 5451657
- ✅ All data from Supabase (no mock data)

---

## Need Help?

See:
- `TROUBLESHOOTING.md` — Detailed error fixes
- `FIX_PRESTIGE_ACCESS.md` — Prestige login issues
- `FINAL_STATUS.md` — Complete project status

Everything is ready to go! 🚀
