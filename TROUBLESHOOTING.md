# Troubleshooting: 500 Error When Creating Event

## The Problem
You're getting a **500 error** when trying to create an event in the admin dashboard.

## Root Cause
The `organization_id` column in the `events` table is still set as `NOT NULL`, but we removed the organizations system.

## Solution: Run Migration 005

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New query**

### Step 2: Run Migration 005
Copy the entire contents of `supabase/migrations/005_fresh_email_auth.sql` and paste into the SQL Editor, then click **RUN**.

**What this migration does:**
- Makes `organization_id` nullable in the `events` table
- Drops the `organizations` and `organization_members` tables
- Removes all org-related policies and constraints
- Sets up simplified email-based auth

### Step 3: Verify Migration Success
After running the migration, run this query to verify:

```sql
-- Check if organization_id is nullable
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'events' AND column_name = 'organization_id';
```

You should see `is_nullable = YES`.

### Step 4: Test Event Creation
1. Go back to your admin page
2. Try creating an event again
3. It should work now ✅

---

## Alternative: If You Already Ran Migrations 001-004

If you previously ran migrations 001-004, migration 005 will handle everything safely. It uses:
- `ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL` (safe even if already nullable)
- `DROP ... IF EXISTS` (safe to run multiple times)
- `CREATE ... IF NOT EXISTS` (safe to run multiple times)

---

## Still Getting 500 Error?

### Check Server Logs
If you're running locally with `npm run dev`, check the terminal for detailed error messages.

The error will show up as:
```
Create event error Error: ...
```

### Check Supabase Service Role Key
Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in your `.env` file:

```bash
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Get it from: Supabase Dashboard → Settings → API → `service_role` (secret)

### Check RLS Policies
Run this query to verify the service role can write to events:

```sql
-- This should return true
SELECT EXISTS (
  SELECT 1 FROM pg_policies 
  WHERE tablename = 'events' 
  AND policyname = 'service role manages events'
);
```

---

## Image Upload Issues

Image uploads require:
1. **Storage bucket** named `event-posters` exists in Supabase
2. **Public access** enabled on the bucket
3. **Service role key** set in `.env`

### Create Storage Bucket (if missing)
1. Go to Supabase Dashboard → Storage
2. Click **New bucket**
3. Name: `event-posters`
4. **Enable "Public bucket"** ✅
5. Click **Save**

### Verify Bucket Exists
```sql
SELECT * FROM storage.buckets WHERE name = 'event-posters';
```

If empty, create it via the dashboard.

---

## Quick Test Checklist

- [ ] Migration 005 ran successfully
- [ ] `organization_id` is nullable in `events` table
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set in `.env`
- [ ] Storage bucket `event-posters` exists and is public
- [ ] Server is restarted after `.env` changes

Once all checked, event creation and image upload should work perfectly.
