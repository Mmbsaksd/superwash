# test_suite_i_randomized_regression.ps1
# SuperWash Stage 5B Phase 2B - Suite I: Repeated & Randomized Regression Sweep

param(
    [string]$ContainerName = "superwash-stage5b-pg15-test",
    [string]$DatabaseName = "superwash_isolated_test",
    [string]$ArtifactsDir = "f:\superwash\docs\review\phase2b_artifacts",
    [int]$Iterations = 20,
    [int]$RandomSeed = 42
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================="
Write-Host "  SuperWash Stage 5B - Suite I: Randomized Property Regression"
Write-Host "  Iterations: $Iterations | Fixed Random Seed: $RandomSeed"
Write-Host "================================================================="

# Set deterministic random seed
$rand = New-Object System.Random($RandomSeed)

function Invoke-PgSql {
    param([string]$Sql)
    $Sql | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1
}

function Invoke-PgSqlScalar {
    param([string]$Sql)
    ($Sql | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -t -A)
}

$passedCount = 0
$failedCount = 0
$propertyResults = @()

for ($iter = 1; $iter -le $Iterations; $iter++) {
    $batchId = "RAND-B$iter"
    $rate1 = $rand.Next(50, 150) * 100       # 5000 to 15000 paise (₹50 to ₹150)
    $rate2 = $rand.Next(100, 250) * 100      # 10000 to 25000 paise (₹100 to ₹250)
    $weight1 = [Math]::Round(($rand.NextDouble() * 8.0 + 1.0), 2)  # 1.00 to 9.00 kg
    $weight2 = [Math]::Round(($rand.NextDouble() * 8.0 + 1.0), 2)  # 1.00 to 9.00 kg
    $discPerc = $rand.Next(10, 30)           # 10% to 30%
    $minOrder = $rand.Next(150, 300) * 100   # 15000 to 30000 paise
    $maxCap = $rand.Next(50, 100) * 100      # 5000 to 10000 paise
    $doCancelS2 = ($rand.Next(0, 2) -eq 1)

    # Reference independent calculation:
    $subtotal1 = [Math]::Round($weight1 * $rate1)
    $subtotal2 = [Math]::Round($weight2 * $rate2)
    
    if (-not $doCancelS2) {
        $combinedSubtotal = $subtotal1 + $subtotal2
        if ($combinedSubtotal -ge $minOrder) {
            $rawDisc = [Math]::Round($combinedSubtotal * ($discPerc / 100.0))
            $calcDisc = [Math]::Min($rawDisc, $maxCap)
            $calcDisc = [Math]::Min($calcDisc, $subtotal1)
        } else {
            $calcDisc = 0
        }
        $expectedTotal1 = $subtotal1 - $calcDisc
        $expectedTotal2 = $subtotal2
    } else {
        # S2 cancelled: only S1 contributes
        $combinedSubtotal = $subtotal1
        if ($combinedSubtotal -ge $minOrder) {
            $rawDisc = [Math]::Round($combinedSubtotal * ($discPerc / 100.0))
            $calcDisc = [Math]::Min($rawDisc, $maxCap)
            $calcDisc = [Math]::Min($calcDisc, $subtotal1)
        } else {
            $calcDisc = 0
        }
        $expectedTotal1 = $subtotal1 - $calcDisc
        $expectedTotal2 = 0
    }

    # Execute test in PostgreSQL
    $couponCode = "RANDCPN_$iter"
    $ord1Id = "90000000-0000-0000-0000-" + $iter.ToString("D12")
    $ord2Id = "90000000-0000-0001-0000-" + $iter.ToString("D12")

    $tag = '$$'
    $testSql = @"
DO $tag
DECLARE
    v_cust_id UUID := '11111111-1111-4111-a111-111111111111';
    v_s1_id UUID;
    v_s2_id UUID;
    v_snap JSONB;
BEGIN
    SELECT id INTO v_s1_id FROM public.services WHERE name = 'Standard Wash' LIMIT 1;
    SELECT id INTO v_s2_id FROM public.services WHERE name = 'Delicate Silk' LIMIT 1;

    v_snap := jsonb_build_object(
        'code', '$couponCode',
        'discount_type', 'percentage',
        'discount_value', $discPerc,
        'min_order_paise', $minOrder,
        'max_discount_paise', $maxCap
    );

    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone, service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        pickup_address, pickup_pincode, pickup_slot, pickup_date,
        order_status, payment_status, discount_paise, total_amount_paise, paid_amount_paise,
        coupon_code, coupon_snapshot, notes, client_submission_id
    ) VALUES (
        '$ord1Id'::uuid, 'ORD-RND1-$iter', v_cust_id, 'Rand Cust', '9876543210', v_s1_id, 'Standard Wash', 'per_kg', $rate1, 1.0,
        'Rand Address', '560038', 'Morning (08:00 AM - 11:00 AM)', CURRENT_DATE + 1,
        'collected', 'pending', 0, NULL, 0,
        '$couponCode', v_snap,
        'Multi-service booking [Linked Batch ${batchId}: S1]', 'sub-rnd1-$iter'
    ), (
        '$ord2Id'::uuid, 'ORD-RND2-$iter', v_cust_id, 'Rand Cust', '9876543210', v_s2_id, 'Delicate Silk', 'per_kg', $rate2, 1.0,
        'Rand Address', '560038', 'Morning (08:00 AM - 11:00 AM)', CURRENT_DATE + 1,
        'collected', 'pending', 0, NULL, 0,
        NULL, NULL,
        'Multi-service booking [Linked Batch ${batchId}: S2]', 'sub-rnd2-$iter'
    );

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    -- Weigh S1 and S2
    PERFORM public.record_store_intake_weight('$ord1Id'::uuid, $weight1);
    PERFORM public.record_store_intake_weight('$ord2Id'::uuid, $weight2);
"@

    if ($doCancelS2) {
        $testSql += @"
    PERFORM public.cancel_order_with_batch_sync('$ord2Id'::uuid, 'Randomized test cancellation');
"@
    }

    $testSql += @"
    RESET ROLE;
END;
$tag LANGUAGE plpgsql;
"@

    Invoke-PgSql -Sql $testSql

    # Assert invariant properties
    $checkJson = Invoke-PgSqlScalar -Sql "
SELECT json_build_object(
    's1_disc', (SELECT discount_paise FROM public.orders WHERE id = '$ord1Id'::uuid),
    's1_total', (SELECT total_amount_paise FROM public.orders WHERE id = '$ord1Id'::uuid),
    's2_status', (SELECT order_status FROM public.orders WHERE id = '$ord2Id'::uuid),
    's2_total', (SELECT total_amount_paise FROM public.orders WHERE id = '$ord2Id'::uuid)
)::text;
"
    $checkData = $checkJson | ConvertFrom-Json

    $assertOk = $true
    # Invariant 1: Total and discount non-negative
    if ($checkData.s1_disc -lt 0 -or $checkData.s1_total -lt 0) { $assertOk = $false }
    # Invariant 2: Stored discount matches independent calculation
    if ($checkData.s1_disc -ne $calcDisc) { $assertOk = $false }
    # Invariant 3: S1 total matches calculation
    if ($checkData.s1_total -ne $expectedTotal1) { $assertOk = $false }
    # Invariant 4: S2 cancelled state
    if ($doCancelS2 -and $checkData.s2_status -ne 'cancelled') { $assertOk = $false }

    if ($assertOk) {
        $passedCount++
    } else {
        $failedCount++
        Write-Host "Iteration $iter FAILED property check: Expected disc=$calcDisc, total=$expectedTotal1; Got disc=$($checkData.s1_disc), total=$($checkData.s1_total)" -ForegroundColor Red
    }
}

Write-Host "`nProperty Sweep Complete: $passedCount / $Iterations PASSED ($failedCount Failed)"
$summary = [PSCustomObject]@{
    suite = "Suite I: Randomized Property Regression";
    total_iterations = $Iterations;
    random_seed = $RandomSeed;
    passed = $passedCount;
    failed = $failedCount;
    status = if ($failedCount -eq 0) { "PASS" } else { "FAIL" }
}

$summary | ConvertTo-Json | Set-Content (Join-Path $ArtifactsDir "suite_i_results.json")
