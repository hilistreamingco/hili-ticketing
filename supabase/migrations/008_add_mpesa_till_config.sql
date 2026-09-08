-- ============================================================
-- Migration 008: Add M-Pesa Till payment configuration
-- ============================================================

-- Insert M-Pesa Till payment config for all published events
-- This will show Till Number 5451657 on checkout pages
INSERT INTO public.payment_config (event_id, provider, payment_method, payment_type, number, is_active)
SELECT 
  id as event_id,
  'manual' as provider,
  'mpesa' as payment_method,
  'till' as payment_type,
  '5451657' as number,
  true as is_active
FROM public.events
WHERE status = 'published'
ON CONFLICT DO NOTHING;

-- Update existing payment configs to use the correct till number
UPDATE public.payment_config
SET 
  number = '5451657',
  payment_type = 'till',
  payment_method = 'mpesa',
  provider = 'manual',
  is_active = true
WHERE number IS NULL OR number = '';
