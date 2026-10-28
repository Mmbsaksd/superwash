BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
-- Deliberately attempt downward reweighing below paid amount (16000 paise paid, 0.50kg = 4000 paise)
SELECT public.record_store_intake_weight('10000000-0000-0000-0000-000000000005'::uuid, 0.50);
COMMIT;
