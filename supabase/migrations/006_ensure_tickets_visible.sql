-- ============================================================
-- Migration 006: Ensure all ticket types are visible and active
-- ============================================================

-- Set all ticket types to visible and active by default
-- This fixes any tickets that were created with these flags off
UPDATE public.ticket_types
SET 
  is_visible = true,
  is_active = true
WHERE is_visible = false OR is_active = false;

-- Add a comment to document this
COMMENT ON COLUMN public.ticket_types.is_visible IS 'Controls whether ticket type appears on public event page';
COMMENT ON COLUMN public.ticket_types.is_active IS 'Controls whether ticket type is available for purchase';
