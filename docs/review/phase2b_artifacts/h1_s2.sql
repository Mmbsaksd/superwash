BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.record_store_intake_weight('10000000-0000-0000-0000-000000000002'::uuid, 4.0);
COMMIT;
