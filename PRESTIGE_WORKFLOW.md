# Prestige Dashboard Workflow

## Complete Ticket Order Flow

### 1. Customer Checkout (Public)
- Customer visits event page → Clicks "Buy Tickets"
- Selects ticket type → Enters attendee names + email
- Goes to checkout page → Sees M-Pesa payment instructions
- **Till Number: 5451657** (Buy Goods & Services)
- Pays via M-Pesa → Returns to site
- Enters M-Pesa name, phone, transaction code
- Clicks "I have completed payment" button
- **Order created with status: `pending`**
- **Email sent to ops team:** `hilistreaming.co@gmail.com`

### 2. Prestige Dashboard - Pending Tab
**URL:** https://hili-ticketing.vercel.app/admin/prestige

**Login with:**
- social@prestigeplaza.co.ke
- hilistreaming.co@gmail.com  
- mutaruronald@gmail.com

**View:**
- All orders with status `pending` or `processing`
- Shows: Order number, customer name, amount, M-Pesa details

**Actions:**
- **Verify Button** → Confirms payment was received
  - Creates tickets with numbers: **SBTB001, SBTB002, SBTB003**, etc.
  - Changes order status to `confirmed`
  - Moves order to "Confirmed" tab

- **Mark Not Found** → Payment not found in M-Pesa
  - Changes status to `not_found`
  - Adds note for customer follow-up

### 3. Prestige Dashboard - Confirmed Tab
**View:**
- All orders with status `confirmed` or `paid`
- Shows fulfillment status: "Not Sent" or "Ticket Sent"

**Actions:**
- **Send Ticket Button** → Emails tickets to customer
  - Subject: "Your Ticket for {Event Name} - SBTB001"
  - Body: 
    ```
    Hey {Name},
    
    Thank you for trusting HILI X BEERBIRDS!
    
    [Event Details]
    - Event: {Event Name}
    - Date: {Event Date}
    - Venue: {Venue}
    - Ticket: SBTB001 - {Tier Name}
    
    [QR Code for check-in]
    ```
  - If multiple tickets, sends separate email for each
  - Changes fulfillment_status to `sent`
  - Moves order to "Sent" tab

### 4. Prestige Dashboard - Sent Tab
**View:**
- All orders with fulfillment_status `sent`
- Final state - tickets delivered

## Ticket Number Format
- Sequential: **SBTB001, SBTB002, SBTB003**, etc.
- Uses Postgres sequence: `ticket_number_seq`
- Never resets, always increments

## Database Tables

### orders
```sql
order_number        TEXT     -- ORD-12345678-9876
purchaser_name      TEXT
purchaser_email     TEXT
purchaser_phone     TEXT
amount_kes          INTEGER
status              TEXT     -- pending, confirmed, paid, not_found
fulfillment_status  TEXT     -- not_sent, sent
mpesa_name          TEXT
mpesa_transaction_code TEXT
created_at          TIMESTAMP
```

### tickets
```sql
ticket_number       TEXT     -- SBTB001, SBTB002, etc.
attendee_name       TEXT
order_id            UUID
event_id            UUID
ticket_type_id      UUID
qr_token            TEXT     -- Unique QR code
checked_in_at       TIMESTAMP (null until scanned at venue)
```

## Email Notifications

### 1. Ops Team (on order creation)
**To:** hilistreaming.co@gmail.com  
**Subject:** 🎟️ New Order: ORD-XXXXX - KES 1500  
**Contains:** Link to Prestige Dashboard

### 2. Customer (on ticket send)
**To:** {customer email}  
**Subject:** Your Ticket for {Event Name} - SBTB001  
**Contains:** QR code, ticket details, event info

## API Endpoints (All Serverless)

### Checkout
- `POST /api/orders/manual` - Create order
- `GET /api/payment-config/:eventSlug` - Get till number

### Prestige Dashboard
- `GET /api/prestige/stats` - Dashboard stats
- `GET /api/prestige/orders?status=pending` - List pending orders
- `GET /api/prestige/orders?status=confirmed` - List confirmed orders
- `GET /api/prestige/orders?status=sent` - List sent orders
- `GET /api/prestige/orders/:orderId` - Get single order
- `POST /api/prestige/orders/confirm` - Verify payment + generate tickets
- `POST /api/prestige/orders/send-ticket` - Send ticket emails
- `POST /api/prestige/orders/not-found` - Mark payment not found

## Troubleshooting

### Orders not showing in Prestige Dashboard?
1. Check Supabase: `SELECT * FROM orders ORDER BY created_at DESC;`
2. Check Vercel logs for 504 errors
3. Verify `PRESTIGE_EMAILS` env var in Vercel

### Till number not showing on checkout?
1. Run migration: `supabase/migrations/008_add_mpesa_till_config.sql`
2. Or manually insert: 
   ```sql
   INSERT INTO payment_config (event_id, provider, payment_method, payment_type, number, is_active)
   SELECT id, 'manual', 'mpesa', 'till', '5451657', true FROM events WHERE status = 'published';
   ```

### Ticket numbers not sequential?
1. Check sequence exists: `SELECT * FROM ticket_number_seq;`
2. Run migration: `supabase/migrations/004_sequential_ticket_numbers.sql`
