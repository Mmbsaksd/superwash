# SuperWash Stage 5B Phase 2B: Resume & Recovery Guide

**Purpose:** This guide enables resuming the Phase 2B test suite after any interruption (terminal close, session timeout, system reboot).

## Environment Identity
* **Docker Container:** `superwash-stage5b-pg15-test`
* **Port Binding:** `127.0.0.1:54322 -> 5432/tcp`
* **Database Name:** `superwash_isolated_test`
* **Test User / Superuser:** `postgres` / `test_postgres_secret`

## Check Liveness
```powershell
docker ps --filter "name=superwash-stage5b-pg15-test"
docker exec superwash-stage5b-pg15-test pg_isready -U postgres -d superwash_isolated_test
```

## Resume Command
To resume or re-run the master test runner from the repository root:
```powershell
cd F:\superwash
powershell -ExecutionPolicy Bypass -File "docs/review/phase2b_artifacts/phase2b_master_test_runner.ps1"
```

## Logs & Checkpoints
* Execution Log: `docs/review/phase2b_artifacts/phase2b_execution.log`
* Progress Checkpoint: `docs/review/phase2b_artifacts/phase2b_progress.md`
* Structured Results: `docs/review/phase2b_artifacts/phase2b_test_results.json`
* Comprehensive Report: `docs/review/stage5b_phase2b_postgres_test_report.md`
