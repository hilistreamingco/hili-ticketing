-- ============================================================================
-- Sequential ticket numbers starting with SBTB001
-- ============================================================================

-- Create a sequence for ticket numbers
create sequence if not exists public.ticket_number_seq start with 1;

-- Replace the random ticket number function with sequential numbering
create or replace function public.create_ticket_number() 
returns text 
language plpgsql 
volatile 
as $$
declare
  ticket_num bigint;
begin
  ticket_num := nextval('public.ticket_number_seq');
  return 'SBTB' || lpad(ticket_num::text, 3, '0');
end;
$$;

-- Note: Existing tickets keep their old numbers. New tickets will use SBTB001, SBTB002, etc.
