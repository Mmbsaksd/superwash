BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.cancel_order_with_batch_sync('10000000-0000-0000-0000-000000000004'::uuid, 'Customer cancelled Dry Clean');
COMMIT;
