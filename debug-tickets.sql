-- Run this in Supabase SQL Editor to debug ticket visibility

-- 1. Check all ticket types and their visibility flags
SELECT 
  tt.id,
  tt.name,
  tt.is_visible,
  tt.is_active,
  tt.price_kes,
  tt.quantity_total,
  e.slug as event_slug,
  e.status as event_status,
  e.name as event_name
FROM ticket_types tt
JOIN events e ON e.id = tt.event_id
ORDER BY tt.created_at DESC;

-- 2. Fix any tickets that are hidden (run this if above shows is_visible=false or is_active=false)
UPDATE ticket_types
SET 
  is_visible = true,
  is_active = true
WHERE is_visible = false OR is_active = false;

-- 3. Verify the fix worked
SELECT 
  COUNT(*) as total_tickets,
  COUNT(*) FILTER (WHERE is_visible = true) as visible_tickets,
  COUNT(*) FILTER (WHERE is_active = true) as active_tickets,
  COUNT(*) FILTER (WHERE is_visible = true AND is_active = true) as publicly_available
FROM ticket_types;
