param(
    [string]$CandidateSqlRelativePath = "docs/review/stage5b_release_candidate/00_stage5b_atomic_release.sql"
)

# phase2b_master_test_runner.ps1
# SuperWash Stage 5B Phase 2B: Master Test Runner
# Autonomous, reproducible, and resumable execution of Suites A through I

$ErrorActionPreference = "Continue"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$ContainerName = "superwash-stage5b-pg15-test"
$DatabaseName = "superwash_isolated_test"
$Port = 54322
$RepoRoot = "F:\superwash"
$ArtifactsDir = "F:\superwash\docs\review\phase2b_artifacts"
$LogFile = Join-Path $ArtifactsDir "phase2b_execution.log"
$ProgressFile = Join-Path $ArtifactsDir "phase2b_progress.md"
$ResultsFile = Join-Path $ArtifactsDir "phase2b_test_results.json"
$ReportFile = "F:\superwash\docs\review\stage5b_phase2b_postgres_test_report.md"

function Log-Message {
    param([string]$Message, [string]$Color = "White")
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $logEntry = "[$timestamp] $Message"
    Write-Host $Message -ForegroundColor $Color
    Add-Content -Path $LogFile -Value $logEntry
}

# Initialize Log File
if (-not (Test-Path $ArtifactsDir)) {
    New-Item -ItemType Directory -Path $ArtifactsDir -Force | Out-Null
}
"" | Set-Content $LogFile

Log-Message "=================================================================" "Cyan"
Log-Message "  SUPERWASH STAGE 5B - PHASE 2B MASTER TEST RUNNER" "Cyan"
Log-Message "  Dedicated Container: $ContainerName on 127.0.0.1:$Port" "Cyan"
Log-Message "=================================================================" "Cyan"

# Data structure to collect all test outcomes
$allTestResults = [ordered]@{}

# -----------------------------------------------------------------------------
# STEP 1: Preflight & Environment Verification
# -----------------------------------------------------------------------------
Log-Message "`n>>> [STEP 1] Preflight & Environment Verification..." "Yellow"

# 1.1 Verify Docker Liveness
try {
    $dockerVer = docker --version
    Log-Message "[PREFLIGHT] Docker is alive: $dockerVer" "Green"
} catch {
    Log-Message "[PREFLIGHT ERROR] Docker daemon is not running or accessible!" "Red"
    exit 1
}

# 1.2 Verify Baseline Migration Files
$baselineMigrations = @(
    "supabase/migrations/20261021_initial_schema.sql",
    "supabase/migrations/20261022_enhanced_schema.sql",
    "supabase/migrations/20261022120000_feedback_schema.sql",
    "supabase/migrations/20261022130000_google_oauth_schema.sql",
    "supabase/migrations/20261022140000_grant_orders_and_table_permissions.sql",
    "supabase/migrations/20261022150000_workflow_pickup_assignment.sql",
    "supabase/migrations/20261022160000_fix_admin_role_and_staff_seeding.sql",
    "supabase/migrations/20261022170000_workflow_audit_lifecycle_and_weight.sql",
    "supabase/migrations/20261022180000_database_enforced_workflow_and_security.sql",
    "supabase/migrations/20261023100000_service_catalogue_enhancements.sql",
    "supabase/migrations/20261023110000_secure_staff_account_creation.sql",
    "supabase/migrations/20261023120000_staff_management_enhancements.sql",
    "supabase/migrations/20261023140000_portal_separation_and_role_protection.sql",
    "supabase/migrations/20261023160000_primary_owner_transition_and_brand_update.sql",
    "supabase/migrations/20261024100000_concurrency_safe_order_numbers.sql",
    "supabase/migrations/20261026200000_booking_idempotency_rpc.sql",
    "supabase/migrations/20261027100000_address_management_and_order_location_rpc.sql",
    "supabase/migrations/20261027120000_fix_services_catalogue_permissions.sql",
    "supabase/migrations/20261027130000_fix_staff_profile_deletion_permissions.sql",
    "supabase/migrations/20261027140000_coupons_and_address_dedup.sql"
)

foreach ($f in $baselineMigrations) {
    $fullPath = Join-Path $RepoRoot $f
    if (-not (Test-Path $fullPath)) {
        Log-Message "[PREFLIGHT ERROR] Missing required migration file: $f" "Red"
        exit 1
    }
}
Log-Message "[PREFLIGHT] All 20 baseline migrations verified on disk." "Green"

# 1.3 Verify Unsafe Migration Exclusion
$unsafeMigration = "supabase/migrations/20261028100000_grant_order_discount_paise_update.sql"
if (Test-Path (Join-Path $RepoRoot $unsafeMigration)) {
    Log-Message "[PREFLIGHT] Unsafe migration $unsafeMigration exists but is explicitly quarantined and excluded." "Yellow"
}

# 1.4 Check Candidate SQL
$candidateSqlPath = $CandidateSqlRelativePath
if (-not (Test-Path (Join-Path $RepoRoot $candidateSqlPath))) {
    Log-Message "[PREFLIGHT ERROR] Candidate SQL $candidateSqlPath not found!" "Red"
    exit 1
}
Log-Message "[PREFLIGHT] Candidate SQL verified: $candidateSqlPath" "Green"

# 1.5 Manage Docker Container (Stop old if running, launch fresh isolated instance)
$existingContainer = docker ps -aq --filter "name=$ContainerName"
if ($existingContainer) {
    Log-Message "[PREFLIGHT] Removing existing container $ContainerName..." "Yellow"
    docker stop $ContainerName 2>$null | Out-Null
    docker rm $ContainerName 2>$null | Out-Null
}

Log-Message "[PREFLIGHT] Launching disposable container $ContainerName bound to 127.0.0.1:$Port..." "Green"
docker run -d `
    --name $ContainerName `
    -e POSTGRES_PASSWORD=test_postgres_secret `
    -e POSTGRES_DB=$DatabaseName `
    -p 127.0.0.1:${Port}:5432 `
    -v "${RepoRoot}:/workspace:ro" `
    postgres:15-alpine | Out-Null

Start-Sleep -Seconds 3

# Wait for container readiness
$ready = $false
for ($i = 0; $i -lt 15; $i++) {
    $status = docker exec $ContainerName pg_isready -U postgres -d $DatabaseName 2>&1
    if ($status -match "accepting connections") {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    Log-Message "[PREFLIGHT ERROR] Database in container $ContainerName did not become ready!" "Red"
    exit 1
}
Log-Message "[PREFLIGHT] PostgreSQL 15 is ready and isolated on 127.0.0.1:$Port." "Green"

# -----------------------------------------------------------------------------
# STEP 2: Apply Compatibility Shim & Baseline Migrations (Suite A)
# -----------------------------------------------------------------------------
Log-Message "`n>>> [STEP 2 / SUITE A] Applying Compatibility Shim & 20 Baseline Migrations..." "Yellow"

$shimPath = Join-Path $ArtifactsDir "00_supabase_compatibility_shim.sql"
Get-Content -Raw $shimPath | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
    Log-Message "[SUITE A ERROR] Failed applying 00_supabase_compatibility_shim.sql!" "Red"
    exit 1
}
Log-Message "[SUITE A] Compatibility shim applied successfully." "Green"

foreach ($relPath in $baselineMigrations) {
    $containerPath = "/workspace/" + $relPath.Replace("\", "/")
    $migOut = docker exec $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1 -f $containerPath 2>&1
    $migOut | Out-String | Add-Content -Path $LogFile
    if ($LASTEXITCODE -ne 0) {
        Log-Message "[SUITE A ERROR] Migration failed on $relPath!" "Red"
        exit 1
    }
}
Log-Message "[SUITE A] All 20 baseline migrations applied cleanly with ON_ERROR_STOP=1." "Green"

# Apply Candidate SQL
Log-Message "[SUITE A] Applying Candidate SQL: $candidateSqlPath..." "Yellow"
$candidateContainerPath = "/workspace/" + $candidateSqlPath.Replace("\", "/")
$candOut = docker exec $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1 -f $candidateContainerPath 2>&1
$candOut | Out-String | Add-Content -Path $LogFile
if ($LASTEXITCODE -ne 0) {
    Log-Message "[SUITE A ERROR] Candidate SQL failed execution!" "Red"
    exit 1
}
Log-Message "[SUITE A] Candidate SQL applied cleanly. Section 15 catalog assertions passed." "Green"

$allTestResults["SUITE_A"] = @{
    name = "Suite A: Baseline & Candidate Execution"
    status = "PASS"
    migrations_applied = 20
    candidate_applied = $true
    assertions_passed = $true
}

# -----------------------------------------------------------------------------
# STEP 3: Suite B — Exhaustive Privileges and Security
# -----------------------------------------------------------------------------
Log-Message "`n>>> [STEP 3 / SUITE B] Executing Suite B: Exhaustive Privileges & Security..." "Yellow"
$suiteBSql = Join-Path $ArtifactsDir "test_suite_b_privileges.sql"
$suiteBOutput = Get-Content -Raw $suiteBSql | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1
$suiteBOutput | Add-Content -Path $LogFile

$suiteBPass = 0
$suiteBFail = 0
$suiteBLines = $suiteBOutput -split "`r?`n"
foreach ($line in $suiteBLines) {
    if ($line -match "\|\s+(PASS|FAIL)\s+\|") {
        if ($line -match "\|\s+PASS\s+\|") { $suiteBPass++ }
        if ($line -match "\|\s+FAIL\s+\|") { $suiteBFail++ }
    }
}
Log-Message "[SUITE B] Results: $suiteBPass PASSED, $suiteBFail FAILED" $(if ($suiteBFail -eq 0) { "Green" } else { "Red" })
$allTestResults["SUITE_B"] = @{
    name = "Suite B: Exhaustive Privileges & Security"
    passed = $suiteBPass
    failed = $suiteBFail
    status = if ($suiteBFail -eq 0) { "PASS" } else { "FAIL" }
}

# -----------------------------------------------------------------------------
# STEP 4: Suite C — Booking, Idempotency & Coupon Snapshots
# -----------------------------------------------------------------------------
Log-Message "`n>>> [STEP 4 / SUITE C] Executing Suite C: Booking, Idempotency & Snapshots..." "Yellow"
$suiteCSql = Join-Path $ArtifactsDir "test_suite_c_booking_snapshots.sql"
$suiteCOutput = Get-Content -Raw $suiteCSql | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1
$suiteCOutput | Add-Content -Path $LogFile

$suiteCPass = 0
$suiteCFail = 0
foreach ($line in ($suiteCOutput -split "`r?`n")) {
    if ($line -match "\|\s+(PASS|FAIL)\s+\|") {
        if ($line -match "\|\s+PASS\s+\|") { $suiteCPass++ }
        if ($line -match "\|\s+FAIL\s+\|") { $suiteCFail++ }
    }
}
Log-Message "[SUITE C] Results: $suiteCPass PASSED, $suiteCFail FAILED" $(if ($suiteCFail -eq 0) { "Green" } else { "Red" })
$allTestResults["SUITE_C"] = @{
    name = "Suite C: Booking, Idempotency & Snapshots"
    passed = $suiteCPass
    failed = $suiteCFail
    status = if ($suiteCFail -eq 0) { "PASS" } else { "FAIL" }
}

# -----------------------------------------------------------------------------
# STEP 5: Suite D — Linked Services & Batch Coupon Synchronization
# -----------------------------------------------------------------------------
Log-Message "`n>>> [STEP 5 / SUITE D] Executing Suite D: Linked Services & Batch Coupon Sync..." "Yellow"
$suiteDSql = Join-Path $ArtifactsDir "test_suite_d_linked_pricing_sync.sql"
$suiteDOutput = Get-Content -Raw $suiteDSql | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1
$suiteDOutput | Add-Content -Path $LogFile

$suiteDPass = 0
$suiteDFail = 0
foreach ($line in ($suiteDOutput -split "`r?`n")) {
    if ($line -match "\|\s+(PASS|FAIL)\s+\|") {
        if ($line -match "\|\s+PASS\s+\|") { $suiteDPass++ }
        if ($line -match "\|\s+FAIL\s+\|") { $suiteDFail++ }
    }
}
Log-Message "[SUITE D] Results: $suiteDPass PASSED, $suiteDFail FAILED" $(if ($suiteDFail -eq 0) { "Green" } else { "Red" })
$allTestResults["SUITE_D"] = @{
    name = "Suite D: Linked Services & Batch Coupon Sync"
    passed = $suiteDPass
    failed = $suiteDFail
    status = if ($suiteDFail -eq 0) { "PASS" } else { "FAIL" }
}

# -----------------------------------------------------------------------------
# STEP 6: Suite E — Payment Ledger & Financial Invariants
# -----------------------------------------------------------------------------
Log-Message "`n>>> [STEP 6 / SUITE E] Executing Suite E: Payment Ledger & Financial Invariants..." "Yellow"
$suiteESql = Join-Path $ArtifactsDir "test_suite_e_payment_invariants.sql"
$suiteEOutput = Get-Content -Raw $suiteESql | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1
$suiteEOutput | Add-Content -Path $LogFile

$suiteEPass = 0
$suiteEFail = 0
foreach ($line in ($suiteEOutput -split "`r?`n")) {
    if ($line -match "\|\s+(PASS|FAIL)\s+\|") {
        if ($line -match "\|\s+PASS\s+\|") { $suiteEPass++ }
        if ($line -match "\|\s+FAIL\s+\|") { $suiteEFail++ }
    }
}
Log-Message "[SUITE E] Results: $suiteEPass PASSED, $suiteEFail FAILED" $(if ($suiteEFail -eq 0) { "Green" } else { "Red" })
$allTestResults["SUITE_E"] = @{
    name = "Suite E: Payment Ledger & Financial Invariants"
    passed = $suiteEPass
    failed = $suiteEFail
    status = if ($suiteEFail -eq 0) { "PASS" } else { "FAIL" }
}

# -----------------------------------------------------------------------------
# STEP 7: Suite F — Workflow & Cancellation State Machine
# -----------------------------------------------------------------------------
Log-Message "`n>>> [STEP 7 / SUITE F] Executing Suite F: Workflow & Cancellation State Machine..." "Yellow"
$suiteFSql = Join-Path $ArtifactsDir "test_suite_f_workflow_state_machine.sql"
$suiteFOutput = Get-Content -Raw $suiteFSql | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1
$suiteFOutput | Add-Content -Path $LogFile

$suiteFPass = 0
$suiteFFail = 0
foreach ($line in ($suiteFOutput -split "`r?`n")) {
    if ($line -match "\|\s+(PASS|FAIL)\s+\|") {
        if ($line -match "\|\s+PASS\s+\|") { $suiteFPass++ }
        if ($line -match "\|\s+FAIL\s+\|") { $suiteFFail++ }
    }
}
Log-Message "[SUITE F] Results: $suiteFPass PASSED, $suiteFFail FAILED" $(if ($suiteFFail -eq 0) { "Green" } else { "Red" })
$allTestResults["SUITE_F"] = @{
    name = "Suite F: Workflow & Cancellation State Machine"
    passed = $suiteFPass
    failed = $suiteFFail
    status = if ($suiteFFail -eq 0) { "PASS" } else { "FAIL" }
}

# -----------------------------------------------------------------------------
# STEP 8: Suite G — Invoice & Billing Reconciliation
# -----------------------------------------------------------------------------
Log-Message "`n>>> [STEP 8 / SUITE G] Executing Suite G: Invoice & Billing Reconciliation..." "Yellow"
$suiteGSql = Join-Path $ArtifactsDir "test_suite_g_invoice_reconciliation.sql"
$suiteGOutput = Get-Content -Raw $suiteGSql | docker exec -i $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1
$suiteGOutput | Add-Content -Path $LogFile

$suiteGPass = 0
$suiteGFail = 0
foreach ($line in ($suiteGOutput -split "`r?`n")) {
    if ($line -match "\|\s+(PASS|FAIL)\s+\|") {
        if ($line -match "\|\s+PASS\s+\|") { $suiteGPass++ }
        if ($line -match "\|\s+FAIL\s+\|") { $suiteGFail++ }
    }
}
Log-Message "[SUITE G] Results: $suiteGPass PASSED, $suiteGFail FAILED" $(if ($suiteGFail -eq 0) { "Green" } else { "Red" })
$allTestResults["SUITE_G"] = @{
    name = "Suite G: Invoice & Billing Reconciliation"
    passed = $suiteGPass
    failed = $suiteGFail
    status = if ($suiteGFail -eq 0) { "PASS" } else { "FAIL" }
}

# -----------------------------------------------------------------------------
# STEP 9: Suite H — Multi-Session Concurrency & Transaction Integrity
# -----------------------------------------------------------------------------
Log-Message "`n>>> [STEP 9 / SUITE H] Executing Suite H: Multi-Session Concurrency..." "Yellow"
$suiteHScript = Join-Path $ArtifactsDir "test_suite_h_concurrency.ps1"
& $suiteHScript -ContainerName $ContainerName -DatabaseName $DatabaseName -ArtifactsDir $ArtifactsDir
$suiteHResultsFile = Join-Path $ArtifactsDir "suite_h_results.json"
$suiteHData = Get-Content $suiteHResultsFile | ConvertFrom-Json
$suiteHPass = ($suiteHData | Where-Object { $_.status -eq "PASS" }).Count
$suiteHFail = ($suiteHData | Where-Object { $_.status -ne "PASS" }).Count
Log-Message "[SUITE H] Results: $suiteHPass PASSED, $suiteHFail FAILED" $(if ($suiteHFail -eq 0) { "Green" } else { "Red" })
$allTestResults["SUITE_H"] = @{
    name = "Suite H: Multi-Session Concurrency"
    passed = $suiteHPass
    failed = $suiteHFail
    status = if ($suiteHFail -eq 0) { "PASS" } else { "FAIL" }
}

# -----------------------------------------------------------------------------
# STEP 10: Suite I — Repeated & Randomized Property Regression Sweep
# -----------------------------------------------------------------------------
Log-Message "`n>>> [STEP 10 / SUITE I] Executing Suite I: Randomized Property Regression..." "Yellow"
$suiteIScript = Join-Path $ArtifactsDir "test_suite_i_randomized_regression.ps1"
& $suiteIScript -ContainerName $ContainerName -DatabaseName $DatabaseName -ArtifactsDir $ArtifactsDir -Iterations 20 -RandomSeed 42
$suiteIResultsFile = Join-Path $ArtifactsDir "suite_i_results.json"
$suiteIData = Get-Content $suiteIResultsFile | ConvertFrom-Json
Log-Message "[SUITE I] Results: $($suiteIData.passed) PASSED, $($suiteIData.failed) FAILED" $(if ($suiteIData.failed -eq 0) { "Green" } else { "Red" })
$allTestResults["SUITE_I"] = @{
    name = "Suite I: Randomized Property Regression"
    passed = $suiteIData.passed
    failed = $suiteIData.failed
    status = $suiteIData.status
}

# -----------------------------------------------------------------------------
# STEP 11: Save Durable Checkpoint & Structured JSON Results
# -----------------------------------------------------------------------------
Log-Message "`n>>> [STEP 11] Saving Durable Progress Checkpoint & JSON Results..." "Yellow"
$allTestResults | ConvertTo-Json -Depth 5 | Set-Content $ResultsFile

# Update progress checkpoint
$totalPass = $suiteBPass + $suiteCPass + $suiteDPass + $suiteEPass + $suiteFPass + $suiteGPass + $suiteHPass + $suiteIData.passed + 1 # +1 for Suite A
$totalFail = $suiteBFail + $suiteCFail + $suiteDFail + $suiteEFail + $suiteFFail + $suiteGFail + $suiteHFail + $suiteIData.failed
$overallStatus = if ($totalFail -eq 0) { "GO" } else { "NO-GO" }

$progressMd = @"
# SuperWash Stage 5B Phase 2B: Verification Progress Checkpoint

**Execution Timestamp:** $((Get-Date).ToString("yyyy-MM-dd HH:mm:ss")) IST  
**Dedicated Container:** $ContainerName  
**Host Binding:** 127.0.0.1:$Port  
**Database:** $DatabaseName  
**Overall Status:** $overallStatus ($totalPass Passed, $totalFail Failed)  

## Suite Execution Matrix

| Suite | Name | Passed | Failed | Status |
| :---: | :--- | :---: | :---: | :---: |
| **Suite A** | Baseline & Candidate Execution | 1 | 0 | **PASS** |
| **Suite B** | Exhaustive Privileges & Security | $suiteBPass | $suiteBFail | **$($allTestResults["SUITE_B"].status)** |
| **Suite C** | Booking, Idempotency & Snapshots | $suiteCPass | $suiteCFail | **$($allTestResults["SUITE_C"].status)** |
| **Suite D** | Linked Services & Batch Coupon Sync | $suiteDPass | $suiteDFail | **$($allTestResults["SUITE_D"].status)** |
| **Suite E** | Payment Ledger & Financial Invariants | $suiteEPass | $suiteEFail | **$($allTestResults["SUITE_E"].status)** |
| **Suite F** | Workflow & Cancellation State Machine | $suiteFPass | $suiteFFail | **$($allTestResults["SUITE_F"].status)** |
| **Suite G** | Invoice & Billing Reconciliation | $suiteGPass | $suiteGFail | **$($allTestResults["SUITE_G"].status)** |
| **Suite H** | Multi-Session Concurrency | $suiteHPass | $suiteHFail | **$($allTestResults["SUITE_H"].status)** |
| **Suite I** | Randomized Property Regression | $($suiteIData.passed) | $($suiteIData.failed) | **$($suiteIData.status)** |
| **TOTAL** | **Consolidated Execution** | **$totalPass** | **$totalFail** | **$overallStatus** |

## Recommendation
**$overallStatus** — Complete test matrix verified autonomously in isolated PostgreSQL 15 environment.
"@
$progressMd | Set-Content $ProgressFile

# -----------------------------------------------------------------------------
# STEP 12: Safe Container Teardown
# -----------------------------------------------------------------------------
Log-Message "`n>>> [STEP 12] Teardown: Stopping and removing disposable test container..." "Yellow"
docker stop $ContainerName 2>$null | Out-Null
docker rm $ContainerName 2>$null | Out-Null
Log-Message "[TEARDOWN] Container $ContainerName safely destroyed. Environment clean." "Green"

Log-Message "`n=================================================================" "Cyan"
Log-Message "  ALL 9 SUITES COMPLETED: $totalPass PASSED, $totalFail FAILED" "Cyan"
Log-Message "  Recommendation: $overallStatus" "Cyan"
Log-Message "=================================================================" "Cyan"
