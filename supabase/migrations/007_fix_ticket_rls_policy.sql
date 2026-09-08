-- ============================================================
-- Migration 007: Fix ticket_types RLS policy
-- ============================================================

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "visible ticket types are public" ON public.ticket_types;

-- Create a simpler policy that works correctly
-- Allow anon/authenticated to see tickets where:
-- 1. The ticket is visible and active
-- 2. The parent event is published
CREATE POLICY "public can view active tickets" ON public.ticket_types
  FOR SELECT TO anon, authenticated
  USING (
    is_visible = true 
    AND is_active = true
    AND EXISTS (
      SELECT 1 FROM public.events 
      WHERE events.id = ticket_types.event_id 
      AND events.status = 'published'
    )
  );
