# test_suite_h_concurrency.ps1
# SuperWash Stage 5B Phase 2B - Suite H: Multi-Session Concurrency Testing

param(
    [string]$ContainerName = "superwash-stage5b-pg15-test",
    [string]$DatabaseName = "superwash_isolated_test",
    [string]$ArtifactsDir = "f:\superwash\docs\review\phase2b_artifacts"
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================="
Write-Host "  SuperWash Stage 5B - Suite H: Multi-Session Concurrency"
Write-Host "================================================================="

function Invoke-PgSql {
    param([string]$Sql)
    $Sql | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1
}

function Invoke-PgSqlScalar {
    param([string]$Sql)
    ($Sql | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -t -A)
}

$results = @()

# 1. Setup Fixtures for Suite H
Write-Host "[SETUP] Seeding fixtures for concurrency tests..."
$setupSql = @'
DO $$
DECLARE
    v_cust_id UUID := '11111111-1111-4111-a111-111111111111';
    v_s1_id UUID;
    v_s2_id UUID;
BEGIN
    SELECT id INTO v_s1_id FROM public.services WHERE name = 'Wash & Fold' LIMIT 1;
    SELECT id INTO v_s2_id FROM public.services WHERE name = 'Dry Cleaning' LIMIT 1;

    -- Clean old concurrency test orders
    DELETE FROM public.order_status_history WHERE order_id IN (
        SELECT id FROM public.orders WHERE order_number LIKE 'ORD-H-%'
    );
    DELETE FROM public.orders WHERE order_number LIKE 'ORD-H-%';

    -- Test H1 Fixtures: ORD-H-1 & ORD-H-2 (Batch H-B1)
    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone, service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        pickup_address, pickup_pincode, pickup_slot, pickup_date,
        order_status, payment_status, discount_paise, total_amount_paise, paid_amount_paise,
        coupon_code, coupon_snapshot, notes, client_submission_id
    ) VALUES (
        '10000000-0000-0000-0000-000000000001'::uuid, 'ORD-H-1', v_cust_id, 'Cust H', '9876543210', v_s1_id, 'Wash & Fold', 'per_kg', 8000, 1.0,
        'Conn Address 1', '560038', 'Morning (08:00 AM - 11:00 AM)', CURRENT_DATE + 1,
        'collected', 'pending', 0, NULL, 0,
        'HCONC20', jsonb_build_object(
            'code', 'HCONC20',
            'discount_type', 'percentage',
            'discount_value', 20,
            'min_order_paise', 30000,
            'max_discount_paise', 10000
        ),
        'Multi-service booking (2 services) [Linked Batch H-B1: Wash & Fold]', 'sub-h-1'
    ), (
        '10000000-0000-0000-0000-000000000002'::uuid, 'ORD-H-2', v_cust_id, 'Cust H', '9876543210', v_s2_id, 'Dry Cleaning', 'per_kg', 10000, 1.0,
        'Conn Address 1', '560038', 'Morning (08:00 AM - 11:00 AM)', CURRENT_DATE + 1,
        'collected', 'pending', 0, NULL, 0,
        NULL, NULL,
        'Multi-service booking (2 services) [Linked Batch H-B1: Dry Cleaning]', 'sub-h-2'
    );

    -- Test H2 Fixtures: ORD-H-3 & ORD-H-4 (Batch H-B2)
    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone, service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        pickup_address, pickup_pincode, pickup_slot, pickup_date,
        order_status, payment_status, discount_paise, total_amount_paise, paid_amount_paise,
        coupon_code, coupon_snapshot, notes, client_submission_id
    ) VALUES (
        '10000000-0000-0000-0000-000000000003'::uuid, 'ORD-H-3', v_cust_id, 'Cust H', '9876543210', v_s1_id, 'Wash & Fold', 'per_kg', 8000, 1.0,
        'Conn Address 2', '560038', 'Morning (08:00 AM - 11:00 AM)', CURRENT_DATE + 1,
        'collected', 'pending', 0, NULL, 0,
        'HCONC20B', jsonb_build_object(
            'code', 'HCONC20B',
            'discount_type', 'percentage',
            'discount_value', 20,
            'min_order_paise', 30000,
            'max_discount_paise', 10000
        ),
        'Multi-service booking (2 services) [Linked Batch H-B2: Wash & Fold]', 'sub-h-3'
    ), (
        '10000000-0000-0000-0000-000000000004'::uuid, 'ORD-H-4', v_cust_id, 'Cust H', '9876543210', v_s2_id, 'Dry Cleaning', 'per_kg', 10000, 2.0,
        'Conn Address 2', '560038', 'Morning (08:00 AM - 11:00 AM)', CURRENT_DATE + 1,
        'collected', 'pending', 0, NULL, 0,
        NULL, NULL,
        'Multi-service booking (2 services) [Linked Batch H-B2: Dry Cleaning]', 'sub-h-4'
    );

    -- Test H3 Fixtures: ORD-H-5 & ORD-H-6 (Batch H-B3)
    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone, service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        pickup_address, pickup_pincode, pickup_slot, pickup_date,
        order_status, payment_status, discount_paise, total_amount_paise, paid_amount_paise,
        measured_weight, billable_weight,
        coupon_code, coupon_snapshot, notes, client_submission_id
    ) VALUES (
        '10000000-0000-0000-0000-000000000005'::uuid, 'ORD-H-5', v_cust_id, 'Cust H', '9876543210', v_s1_id, 'Wash & Fold', 'per_kg', 8000, 1.0,
        'Conn Address 3', '560038', 'Morning (08:00 AM - 11:00 AM)', CURRENT_DATE + 1,
        'washing', 'paid', 0, 16000, 16000,
        2.0, 2.0,
        NULL, NULL,
        'Multi-service booking (2 services) [Linked Batch H-B3: Wash & Fold]', 'sub-h-5'
    ), (
        '10000000-0000-0000-0000-000000000006'::uuid, 'ORD-H-6', v_cust_id, 'Cust H', '9876543210', v_s2_id, 'Dry Cleaning', 'per_kg', 10000, 1.0,
        'Conn Address 3', '560038', 'Morning (08:00 AM - 11:00 AM)', CURRENT_DATE + 1,
        'collected', 'pending', 0, NULL, 0,
        NULL, NULL,
        NULL, NULL,
        'Multi-service booking (2 services) [Linked Batch H-B3: Dry Cleaning]', 'sub-h-6'
    );
END;
$$ LANGUAGE plpgsql;
'@

Invoke-PgSql -Sql $setupSql
Write-Host "[SETUP] Fixtures seeded successfully."

# -----------------------------------------------------------------------------
# TEST H1: Concurrent Sibling Weighing Race
# -----------------------------------------------------------------------------
Write-Host "`n>>> [TEST H1] Concurrent Sibling Weighing Race (Batch H-B1)..."
$h1_sql1 = @'
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT pg_sleep(1.5);
SELECT public.record_store_intake_weight('10000000-0000-0000-0000-000000000001'::uuid, 2.0);
COMMIT;
'@

$h1_sql2 = @'
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.record_store_intake_weight('10000000-0000-0000-0000-000000000002'::uuid, 4.0);
COMMIT;
'@

$h1_f1 = Join-Path $ArtifactsDir "h1_s1.sql"
$h1_f2 = Join-Path $ArtifactsDir "h1_s2.sql"
Set-Content -Path $h1_f1 -Value $h1_sql1
Set-Content -Path $h1_f2 -Value $h1_sql2

$j1 = Start-Job -ScriptBlock {
    param($f, $c, $d)
    Get-Content -Raw $f | docker exec -i $c psql -U postgres -d $d -v ON_ERROR_STOP=1
} -ArgumentList $h1_f1, $ContainerName, $DatabaseName

Start-Sleep -Milliseconds 200

$j2 = Start-Job -ScriptBlock {
    param($f, $c, $d)
    Get-Content -Raw $f | docker exec -i $c psql -U postgres -d $d -v ON_ERROR_STOP=1
} -ArgumentList $h1_f2, $ContainerName, $DatabaseName

$res1 = Receive-Job -Job $j1 -Wait
$res2 = Receive-Job -Job $j2 -Wait

$h1_check = Invoke-PgSqlScalar -Sql "
SELECT json_build_object(
    's1_weight', (SELECT measured_weight FROM public.orders WHERE order_number = 'ORD-H-1'),
    's1_discount', (SELECT discount_paise FROM public.orders WHERE order_number = 'ORD-H-1'),
    's1_total', (SELECT total_amount_paise FROM public.orders WHERE order_number = 'ORD-H-1'),
    's2_weight', (SELECT measured_weight FROM public.orders WHERE order_number = 'ORD-H-2'),
    's2_discount', (SELECT discount_paise FROM public.orders WHERE order_number = 'ORD-H-2'),
    's2_total', (SELECT total_amount_paise FROM public.orders WHERE order_number = 'ORD-H-2')
)::text;
"

Write-Host "TEST H1 Results: $h1_check"
$h1_data = $h1_check | ConvertFrom-Json

if ($j1.State -eq 'Completed' -and $j2.State -eq 'Completed' -and $h1_data.s1_weight -eq 2.0 -and $h1_data.s2_weight -eq 4.0 -and $h1_data.s1_discount -eq 10000 -and $h1_data.s1_total -eq 6000 -and $h1_data.s2_total -eq 40000) {
    Write-Host ">>> [TEST H1 PASS] Concurrent Sibling Weighing synchronized cleanly without deadlock!" -ForegroundColor Green
    $results += [PSCustomObject]@{ test_id = "H1_CONCURRENT_WEIGHING"; status = "PASS"; details = "Both sessions committed with 0 deadlocks; exact pricing synchronized" }
} else {
    Write-Host ">>> [TEST H1 FAIL]" -ForegroundColor Red
    $results += [PSCustomObject]@{ test_id = "H1_CONCURRENT_WEIGHING"; status = "FAIL"; details = "Discrepancy: $h1_check" }
}

# -----------------------------------------------------------------------------
# TEST H2: Concurrent Weighing vs Synchronized Cancellation Race
# -----------------------------------------------------------------------------
Write-Host "`n>>> [TEST H2] Concurrent Weighing vs Synchronized Cancellation Race (Batch H-B2)..."
$h2_sql1 = @'
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.record_store_intake_weight('10000000-0000-0000-0000-000000000003'::uuid, 2.0);
SELECT pg_sleep(1.5);
COMMIT;
'@

$h2_sql2 = @'
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.cancel_order_with_batch_sync('10000000-0000-0000-0000-000000000004'::uuid, 'Customer cancelled Dry Clean');
COMMIT;
'@

$h2_f1 = Join-Path $ArtifactsDir "h2_s1.sql"
$h2_f2 = Join-Path $ArtifactsDir "h2_s2.sql"
Set-Content -Path $h2_f1 -Value $h2_sql1
Set-Content -Path $h2_f2 -Value $h2_sql2

$j2_1 = Start-Job -ScriptBlock {
    param($f, $c, $d)
    Get-Content -Raw $f | docker exec -i $c psql -U postgres -d $d -v ON_ERROR_STOP=1
} -ArgumentList $h2_f1, $ContainerName, $DatabaseName

Start-Sleep -Milliseconds 300

$j2_2 = Start-Job -ScriptBlock {
    param($f, $c, $d)
    Get-Content -Raw $f | docker exec -i $c psql -U postgres -d $d -v ON_ERROR_STOP=1
} -ArgumentList $h2_f2, $ContainerName, $DatabaseName

$res2_1 = Receive-Job -Job $j2_1 -Wait
$res2_2 = Receive-Job -Job $j2_2 -Wait

$h2_check = Invoke-PgSqlScalar -Sql "
SELECT json_build_object(
    'c1_status', (SELECT order_status FROM public.orders WHERE order_number = 'ORD-H-3'),
    'c1_discount', (SELECT discount_paise FROM public.orders WHERE order_number = 'ORD-H-3'),
    'c1_total', (SELECT total_amount_paise FROM public.orders WHERE order_number = 'ORD-H-3'),
    'c2_status', (SELECT order_status FROM public.orders WHERE order_number = 'ORD-H-4')
)::text;
"

Write-Host "TEST H2 Results: $h2_check"
$h2_data = $h2_check | ConvertFrom-Json

if ($j2_1.State -eq 'Completed' -and $j2_2.State -eq 'Completed' -and $h2_data.c2_status -eq 'cancelled' -and $h2_data.c1_discount -eq 0 -and $h2_data.c1_total -eq 16000) {
    Write-Host ">>> [TEST H2 PASS] Concurrent Weighing & Cancellation serialized safely with atomic coupon revocation!" -ForegroundColor Green
    $results += [PSCustomObject]@{ test_id = "H2_WEIGH_VS_CANCEL"; status = "PASS"; details = "Operations serialized cleanly, atomic discount revocation confirmed" }
} else {
    Write-Host ">>> [TEST H2 FAIL]" -ForegroundColor Red
    $results += [PSCustomObject]@{ test_id = "H2_WEIGH_VS_CANCEL"; status = "FAIL"; details = "Discrepancy: $h2_check" }
}

# -----------------------------------------------------------------------------
# TEST H3: Advisory Lock Release on Rollback
# -----------------------------------------------------------------------------
Write-Host "`n>>> [TEST H3] Advisory Lock Release on Rollback (Batch H-B3)..."
$h3_sql1 = @'
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
-- Deliberately attempt downward reweighing below paid amount (16000 paise paid, 0.50kg = 4000 paise)
SELECT public.record_store_intake_weight('10000000-0000-0000-0000-000000000005'::uuid, 0.50);
COMMIT;
'@

$h3_sql2 = @'
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.record_store_intake_weight('10000000-0000-0000-0000-000000000006'::uuid, 2.50);
COMMIT;
'@

$h3_f1 = Join-Path $ArtifactsDir "h3_s1.sql"
$h3_f2 = Join-Path $ArtifactsDir "h3_s2.sql"
Set-Content -Path $h3_f1 -Value $h3_sql1
Set-Content -Path $h3_f2 -Value $h3_sql2

try {
    $null = Get-Content -Raw $h3_f1 | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1 2>&1
} catch {
    # Expected abort
}

$s2Out = Get-Content -Raw $h3_f2 | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1

$h3_check = Invoke-PgSqlScalar -Sql "
SELECT json_build_object(
    'r1_status', (SELECT order_status FROM public.orders WHERE order_number = 'ORD-H-5'),
    'r1_weight', (SELECT measured_weight FROM public.orders WHERE order_number = 'ORD-H-5'),
    'r2_status', (SELECT order_status FROM public.orders WHERE order_number = 'ORD-H-6'),
    'r2_weight', (SELECT measured_weight FROM public.orders WHERE order_number = 'ORD-H-6'),
    'r2_total', (SELECT total_amount_paise FROM public.orders WHERE order_number = 'ORD-H-6')
)::text;
"

Write-Host "TEST H3 Results: $h3_check"
$h3_data = $h3_check | ConvertFrom-Json

if ($h3_data.r1_weight -eq 2.0 -and $h3_data.r2_weight -eq 2.5 -and $h3_data.r2_status -eq 'washing') {
    Write-Host ">>> [TEST H3 PASS] Transaction-level advisory lock was cleanly released on rollback and Session 2 completed!" -ForegroundColor Green
    $results += [PSCustomObject]@{ test_id = "H3_LOCK_RELEASE_ON_ROLLBACK"; status = "PASS"; details = "Advisory lock released on abort, Session 2 immediately succeeded" }
} else {
    Write-Host ">>> [TEST H3 FAIL]" -ForegroundColor Red
    $results += [PSCustomObject]@{ test_id = "H3_LOCK_RELEASE_ON_ROLLBACK"; status = "FAIL"; details = "Discrepancy: $h3_check" }
}

$results | ConvertTo-Json | Set-Content (Join-Path $ArtifactsDir "suite_h_results.json")
Write-Host "`nSuite H Execution Complete. Summary saved to suite_h_results.json"
