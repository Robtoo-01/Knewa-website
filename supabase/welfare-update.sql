-- =====================================================================
-- KENEWA welfare update (October 2026, recommendations 3, 4 and 8)
--   Support requests can now carry the details of the Welfare Fund
--   application (form W1): who the support is for, the amount asked
--   for, and any insurance or other help that may pay.
--
-- ALREADY using the members system? Run this file once:
--   Supabase > SQL Editor > New query > paste everything > Run
-- It is safe to run more than once.
-- (New installs get it automatically as part of setup.sql.)
-- =====================================================================

alter table public.support_requests
  add column if not exists person_affected   text,
  add column if not exists amount_requested  numeric(10,2),
  add column if not exists insurance_details text;

alter table public.support_requests drop constraint if exists support_amount_ok;
alter table public.support_requests add constraint support_amount_ok
  check (amount_requested is null or (amount_requested >= 0 and amount_requested <= 20000));

-- The existing rules still apply: members add their own requests and see only their own;
-- the committee sees and updates them (see setup.sql, "support requests").
