# Fix: Prestige Dashboard Access Denied

## The Problem
Getting "Access denied. mutaruronald@gmail.com is not in the Prestige access list."

## Solution (2 steps)

### Step 1: Email Added to .env ✅
I've already added `mutaruronald@gmail.com` to the `PRESTIGE_EMAILS` list in your `.env` file:

```bash
PRESTIGE_EMAILS=social@prestigeplaza.co.ke,hilistreaming.co@gmail.com,mutaruronald@gmail.com
```

### Step 2: Restart Your Server
**Environment variables are only loaded when the server starts.** You must restart:

#### If Running Locally:
1. Stop the server (Ctrl+C in terminal)
2. Run `npm run dev` again
3. Try logging in to `/prestige` with `mutaruronald@gmail.com`

#### If Deployed on Vercel:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Find `PRESTIGE_EMAILS`
3. Update it to: `social@prestigeplaza.co.ke,hilistreaming.co@gmail.com,mutaruronald@gmail.com`
4. Click **Save**
5. Go to Deployments → Click the 3 dots on latest deployment → **Redeploy**

---

## How It Works

1. User signs in with email/password via Supabase Auth
2. Frontend calls `/api/admin/me` with the JWT token
3. Server checks if email is in `ADMIN_EMAILS` or `PRESTIGE_EMAILS`
4. Returns role: `hili_admin` or `prestige_admin` or `null`
5. If role is `null`, frontend shows "Access denied"

---

## Adding More Users

To add more Prestige users in the future:

**Local (.env file):**
```bash
PRESTIGE_EMAILS=email1@example.com,email2@example.com,email3@example.com
```

**Vercel (Environment Variables):**
1. Go to Settings → Environment Variables
2. Update `PRESTIGE_EMAILS`
3. Redeploy

**Important:** Always restart/redeploy after changing env vars!

---

## Roles Summary

| Email List | Role | Access |
|------------|------|--------|
| `ADMIN_EMAILS` | `hili_admin` | Everything (Admin + Prestige) |
| `PRESTIGE_EMAILS` | `prestige_admin` | Prestige dashboard only |

Users in `ADMIN_EMAILS` automatically get Prestige access too — no need to add them to both lists.

---

## Testing

After restarting:
1. Go to http://localhost:8080/prestige
2. Sign in with `mutaruronald@gmail.com`
3. Should work now ✅
