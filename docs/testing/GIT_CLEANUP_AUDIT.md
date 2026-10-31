# SuperWash Exprez — Git Working Tree Inventory & Cleanup Audit

**Audit Date:** 2026-10-31  
**Repository:** `F:\superwash`  
**Branch:** `main` (HEAD: `c177c9c`)  
**Production URL:** `https://superwash.pages.dev`  
**Target File Count:** Exactly 115 untracked files (0 staged, 0 modified tracked files)

---

## 1. Executive Summary

A comprehensive working-tree audit was conducted following the production deployment of release commit `c177c9c`.
The working tree currently has **0 tracked modifications** and **0 staged changes**. Exactly **115 untracked files** were detected across documentation, QA evidence, testing scripts, and temporary scratch tools.

In accordance with strict safety directives:
- **No files were deleted without prior review and user consent.**
- **No destructive git commands (`git clean -fd`, `git reset --hard`) were run.**
- **`.env.local`, production database configurations, user files, and customer records remain strictly intact and untouched.**

---

## 2. Categorization & Distribution Matrix

All 115 files have been categorized under standardized classifications A through J:

| Category | Description | File Count | Recommended Action |
|:---|:---|:---:|:---|
| **Category A** | Production application code | 0 | None (no uncommitted app code) |
| **Category B** | Permanent automated regression tests | 0 | None (Vitest tests are fully tracked) |
| **Category C** | Reusable browser E2E testing infrastructure | 3 | **Commit** to `frontend/src/test/` |
| **Category D** | Permanent QA documentation & release reports | 18 | **Commit** to `docs/testing/` and `docs/review/` |
| **Category E** | Useful visual test evidence (PNGs) | 66 | **Retain/Commit** with QA documentation |
| **Category F** | One-time debugging scripts | 18 | **Proposed for Deletion** (`scratch/*.cjs`) |
| **Category G** | Temporary browser inspection scripts | 0 | (Grouped under Category F in scratch) |
| **Category H** | Logs, generated outputs & temporary artifacts | 10 | **Proposed for Deletion** (`docs.zip`, live scratch PNGs, raw JSON) |
| **Category I** | Backups & historical database evidence | 0 | (Database migration backups safely stored) |
| **Category J** | Environment files & sensitive information | 0 | (`.env.local` securely gitignored) |
| **TOTAL** | | **115** | |

---

## 3. Detailed Proposed Cleanup Actions

### Group 1: Files Proposed for Safe Removal (28 files)
These files served a transient, one-time diagnostic or temporary packaging purpose during the mobile fix and release verification. They contain no source code, unique documentation, or reusable test cases.

1. `docs.zip` (1 file) — Transient packaging zip from documentation export.
2. `scratch/*.cjs` (18 files) — One-time diagnostic scripts used to measure DOM coordinates, test temporary overflow, and verify local nav anchors. Reusable test coverage is preserved in `frontend/src/test/`.
3. `scratch/live_evidence/*.png` (8 files) — Transient screenshots captured during initial live curl/browser smoke check.
4. `scratch/inventory.json` & `scratch/categorize_git.cjs` — Transient inventory tools created during this audit.

### Group 2: Reusable E2E Testing Infrastructure to Retain / Track (3 files)
These scripts provide long-term automated regression testing for the SuperWash web application using headless Chromium:
1. `frontend/src/test/full_manual_browser_test.cjs` — 32-scenario comprehensive browser test suite.
2. `frontend/src/test/manual_qa_audit_runner.cjs` — 17-scenario QA runner with automated evidence capture.
3. `frontend/src/test/production_readiness_browser_test.cjs` — Multi-viewport responsive verification (320px, 393px, 768px, 1440px).

### Group 3: Permanent QA & Audit Documentation to Retain / Track (18 files)
Authoritative audit reports, bug registers, and test results demonstrating release compliance:
- `docs/review/PRODUCTION_RELEASE_PREPARATION_REPORT.md`
- `docs/testing/SUPERWASH_BUGS_AND_NEXT_RELEASE_BACKLOG.md`
- `docs/testing/SUPERWASH_LAUNCH_READINESS_SUMMARY.md`
- `docs/testing/SUPERWASH_LIVE_E2E_TEST_RESULTS_2026-10-28.md`
- `docs/testing/SUPERWASH_PRELAUNCH_MANUAL_TEST_PLAN.md`
- `docs/testing/local_qa_audit/BUG_REGISTER.md`
- `docs/testing/local_qa_audit/INTERACTIVE_ELEMENT_INVENTORY.md`
- `docs/testing/local_qa_audit/LOCAL_QA_REPORT.md`
- `docs/testing/local_qa_audit/MANUAL_APPLICATION_TESTING_FORM.md`
- `docs/testing/local_qa_audit/REGRESSION_TEST_RESULTS.md`
- `docs/testing/local_qa_audit/WORKFLOW_TEST_RESULTS.md`
- `docs/testing/manual_browser_audit/AUDIT_VERIFICATION_REPORT.md`
- `docs/testing/manual_browser_audit/BUG_REGISTER.md`
- `docs/testing/manual_browser_audit/DEVELOPMENT_DATA_CLEANUP_REPORT.md`
- `docs/testing/manual_browser_audit/MANUAL_TEST_REPORT.md`
- `docs/testing/manual_browser_audit/PAGE_AND_CONTROL_INVENTORY.md`
- `docs/testing/manual_browser_audit/TEST_CASE_RESULTS.csv`
- `docs/testing/local_qa_audit/audit_raw_results.json`

### Group 4: Visual QA Evidence (66 files)
High-resolution PNG screenshots captured during automated test runs proving visual verification of modals, portals, invoices, and viewports:
- `docs/testing/local_qa_audit/evidence/*.png` (22 files)
- `docs/testing/manual_browser_audit/evidence/*.png` (32 files)
- `docs/testing/production_readiness/evidence/final_audit/*.png` (12 files)

---

## 4. Complete 115-File Itemized Inventory

| # | File Path | Git Status | File Type | Classification | Purpose | Required for Future? | Proposed Action |
|:---:|:---|:---:|:---:|:---:|:---|:---:|:---|
| 1 | `docs.zip` | Untracked | ZIP Archive | Category H | Bundled documentation archive created during packaging | No | Proposed for Deletion |
| 2 | `docs/review/PRODUCTION_RELEASE_PREPARATION_REPORT.md` | Untracked | Markdown Report | Category D | Production release preparation and review sign-off document | Yes | Commit to repository |
| 3 | `docs/testing/SUPERWASH_BUGS_AND_NEXT_RELEASE_BACKLOG.md` | Untracked | Markdown Report | Category D | Launch readiness, test plan, and pre-release backlog documentation | Yes | Commit to repository |
| 4 | `docs/testing/SUPERWASH_LAUNCH_READINESS_SUMMARY.md` | Untracked | Markdown Report | Category D | Launch readiness, test plan, and pre-release backlog documentation | Yes | Commit to repository |
| 5 | `docs/testing/SUPERWASH_LIVE_E2E_TEST_RESULTS_2026-10-28.md` | Untracked | Markdown Report | Category D | Launch readiness, test plan, and pre-release backlog documentation | Yes | Commit to repository |
| 6 | `docs/testing/SUPERWASH_PRELAUNCH_MANUAL_TEST_PLAN.md` | Untracked | Markdown Report | Category D | Launch readiness, test plan, and pre-release backlog documentation | Yes | Commit to repository |
| 7 | `docs/testing/local_qa_audit/BUG_REGISTER.md` | Untracked | Markdown Report | Category D | Local QA audit reports, bug register, and test execution results | Yes | Commit to repository |
| 8 | `docs/testing/local_qa_audit/INTERACTIVE_ELEMENT_INVENTORY.md` | Untracked | Markdown Report | Category D | Local QA audit reports, bug register, and test execution results | Yes | Commit to repository |
| 9 | `docs/testing/local_qa_audit/LOCAL_QA_REPORT.md` | Untracked | Markdown Report | Category D | Local QA audit reports, bug register, and test execution results | Yes | Commit to repository |
| 10 | `docs/testing/local_qa_audit/MANUAL_APPLICATION_TESTING_FORM.md` | Untracked | Markdown Report | Category D | Local QA audit reports, bug register, and test execution results | Yes | Commit to repository |
| 11 | `docs/testing/local_qa_audit/REGRESSION_TEST_RESULTS.md` | Untracked | Markdown Report | Category D | Local QA audit reports, bug register, and test execution results | Yes | Commit to repository |
| 12 | `docs/testing/local_qa_audit/WORKFLOW_TEST_RESULTS.md` | Untracked | Markdown Report | Category D | Local QA audit reports, bug register, and test execution results | Yes | Commit to repository |
| 13 | `docs/testing/local_qa_audit/audit_raw_results.json` | Untracked | JSON Data | Category H | Local QA audit reports, bug register, and test execution results | Yes | Commit to repository |
| 14 | `docs/testing/local_qa_audit/evidence/01_landing_page_desktop.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 15 | `docs/testing/local_qa_audit/evidence/02_carousel_next_slide.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 16 | `docs/testing/local_qa_audit/evidence/03_customer_login_page.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 17 | `docs/testing/local_qa_audit/evidence/04_staff_login_page.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 18 | `docs/testing/local_qa_audit/evidence/05_customer_booking_step1.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 19 | `docs/testing/local_qa_audit/evidence/06_customer_booking_step2.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 20 | `docs/testing/local_qa_audit/evidence/07_customer_booking_step3.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 21 | `docs/testing/local_qa_audit/evidence/08_customer_booking_step4.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 22 | `docs/testing/local_qa_audit/evidence/09_customer_booking_step5.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 23 | `docs/testing/local_qa_audit/evidence/10_booking_confirmed_order_tracker.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 24 | `docs/testing/local_qa_audit/evidence/11_order_tracker_stage1.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 25 | `docs/testing/local_qa_audit/evidence/12_customer_profile_addresses.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 26 | `docs/testing/local_qa_audit/evidence/13_customer_settings.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 27 | `docs/testing/local_qa_audit/evidence/14_delivery_portal.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 28 | `docs/testing/local_qa_audit/evidence/15_manager_portal.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 29 | `docs/testing/local_qa_audit/evidence/16_owner_admin_dashboard.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 30 | `docs/testing/local_qa_audit/evidence/16_owner_executive_analytics.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 31 | `docs/testing/local_qa_audit/evidence/16_owner_pricing_coverage.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 32 | `docs/testing/local_qa_audit/evidence/17_viewport_Desktop_FHD_Wide.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 33 | `docs/testing/local_qa_audit/evidence/17_viewport_Desktop_Standard.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 34 | `docs/testing/local_qa_audit/evidence/17_viewport_Mobile_iPhone_SE.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 35 | `docs/testing/local_qa_audit/evidence/17_viewport_Tablet_iPad.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 36 | `docs/testing/local_qa_audit/evidence/test_landing.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 17 local QA audit test cases | Reference | Commit to docs or retain in QA archive |
| 37 | `docs/testing/manual_browser_audit/AUDIT_VERIFICATION_REPORT.md` | Untracked | Markdown Report | Category D | Manual browser audit test suite report, bug register, and test matrix | Yes | Commit to repository |
| 38 | `docs/testing/manual_browser_audit/BUG_REGISTER.md` | Untracked | Markdown Report | Category D | Manual browser audit test suite report, bug register, and test matrix | Yes | Commit to repository |
| 39 | `docs/testing/manual_browser_audit/DEVELOPMENT_DATA_CLEANUP_REPORT.md` | Untracked | Markdown Report | Category D | Manual browser audit test suite report, bug register, and test matrix | Yes | Commit to repository |
| 40 | `docs/testing/manual_browser_audit/MANUAL_TEST_REPORT.md` | Untracked | Markdown Report | Category D | Manual browser audit test suite report, bug register, and test matrix | Yes | Commit to repository |
| 41 | `docs/testing/manual_browser_audit/PAGE_AND_CONTROL_INVENTORY.md` | Untracked | Markdown Report | Category D | Manual browser audit test suite report, bug register, and test matrix | Yes | Commit to repository |
| 42 | `docs/testing/manual_browser_audit/TEST_CASE_RESULTS.csv` | Untracked | CSV Data | Category D | Manual browser audit test suite report, bug register, and test matrix | Yes | Commit to repository |
| 43 | `docs/testing/manual_browser_audit/evidence/00_browser_state_reset.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 44 | `docs/testing/manual_browser_audit/evidence/01_landing_page_clean.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 45 | `docs/testing/manual_browser_audit/evidence/02_carousel_interaction.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 46 | `docs/testing/manual_browser_audit/evidence/03_coverage_checker_results.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 47 | `docs/testing/manual_browser_audit/evidence/04_how_it_works.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 48 | `docs/testing/manual_browser_audit/evidence/05_contact_page.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 49 | `docs/testing/manual_browser_audit/evidence/06_privacy_page.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 50 | `docs/testing/manual_browser_audit/evidence/07_terms_page.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 51 | `docs/testing/manual_browser_audit/evidence/08_unauth_route_guard.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 52 | `docs/testing/manual_browser_audit/evidence/09_customer_login.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 53 | `docs/testing/manual_browser_audit/evidence/10_staff_login.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 54 | `docs/testing/manual_browser_audit/evidence/11_booking_step1_schedule.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 55 | `docs/testing/manual_browser_audit/evidence/12_booking_step2_contact.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 56 | `docs/testing/manual_browser_audit/evidence/13_booking_step3_address.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 57 | `docs/testing/manual_browser_audit/evidence/14_map_picker_modal.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 58 | `docs/testing/manual_browser_audit/evidence/15_booking_step4_review.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 59 | `docs/testing/manual_browser_audit/evidence/16_booking_step5_payment.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 60 | `docs/testing/manual_browser_audit/evidence/17_booking_confirmed_order.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 61 | `docs/testing/manual_browser_audit/evidence/18_order_tracker_booked.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 62 | `docs/testing/manual_browser_audit/evidence/19_delivery_portal.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 63 | `docs/testing/manual_browser_audit/evidence/20_manager_portal.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 64 | `docs/testing/manual_browser_audit/evidence/22_customer_addresses.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 65 | `docs/testing/manual_browser_audit/evidence/23_customer_settings.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 66 | `docs/testing/manual_browser_audit/evidence/24_owner_dashboard.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 67 | `docs/testing/manual_browser_audit/evidence/25_owner_pricing.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 68 | `docs/testing/manual_browser_audit/evidence/26_owner_staff.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 69 | `docs/testing/manual_browser_audit/evidence/28_viewport_375x667.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 70 | `docs/testing/manual_browser_audit/evidence/29_viewport_414x896.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 71 | `docs/testing/manual_browser_audit/evidence/30_viewport_768x1024.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 72 | `docs/testing/manual_browser_audit/evidence/31_viewport_1366x768.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 73 | `docs/testing/manual_browser_audit/evidence/32_viewport_1920x1080.png` | Untracked | PNG Screenshot | Category E | Visual evidence capture of 32 manual browser audit test cases | Reference | Commit to docs or retain in QA archive |
| 74 | `docs/testing/production_readiness/evidence/final_audit/customer_logged_in_393px.png` | Untracked | PNG Screenshot | Category E | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 75 | `docs/testing/production_readiness/evidence/final_audit/delivery_portal_tasks.png` | Untracked | PNG Screenshot | Category E | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 76 | `docs/testing/production_readiness/evidence/final_audit/final_pre_release_audit_results.json` | Untracked | JSON Data | Category H | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 77 | `docs/testing/production_readiness/evidence/final_audit/landing_1440px.png` | Untracked | PNG Screenshot | Category E | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 78 | `docs/testing/production_readiness/evidence/final_audit/landing_320px.png` | Untracked | PNG Screenshot | Category E | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 79 | `docs/testing/production_readiness/evidence/final_audit/landing_393px.png` | Untracked | PNG Screenshot | Category E | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 80 | `docs/testing/production_readiness/evidence/final_audit/landing_768px.png` | Untracked | PNG Screenshot | Category E | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 81 | `docs/testing/production_readiness/evidence/final_audit/modal_assign_staff.png` | Untracked | PNG Screenshot | Category E | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 82 | `docs/testing/production_readiness/evidence/final_audit/modal_invoice_view.png` | Untracked | PNG Screenshot | Category E | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 83 | `docs/testing/production_readiness/evidence/final_audit/modal_map_location_picker.png` | Untracked | PNG Screenshot | Category E | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 84 | `docs/testing/production_readiness/evidence/final_audit/modal_weight_entry.png` | Untracked | PNG Screenshot | Category E | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 85 | `docs/testing/production_readiness/evidence/final_audit/order_confirmed_393px.png` | Untracked | PNG Screenshot | Category E | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 86 | `docs/testing/production_readiness/evidence/final_audit/owner_dashboard_full.png` | Untracked | PNG Screenshot | Category E | Final pre-production release audit visual evidence and metrics | Reference | Commit to docs or retain in QA archive |
| 87 | `frontend/src/test/full_manual_browser_test.cjs` | Untracked | CJS Test Script | Category C | Automated end-to-end browser test runner for regression audits | Yes | Commit to repository |
| 88 | `frontend/src/test/manual_qa_audit_runner.cjs` | Untracked | CJS Test Script | Category C | Automated end-to-end browser test runner for regression audits | Yes | Commit to repository |
| 89 | `frontend/src/test/production_readiness_browser_test.cjs` | Untracked | CJS Test Script | Category C | Automated end-to-end browser test runner for regression audits | Yes | Commit to repository |
| 90 | `scratch/check_booking_mobile.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 91 | `scratch/check_coords.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 92 | `scratch/check_coords_320.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 93 | `scratch/check_coords_360.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 94 | `scratch/check_scrolled_bottom.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 95 | `scratch/check_slides.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 96 | `scratch/diagnose_audit.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 97 | `scratch/find_overflow.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 98 | `scratch/inspect_768_overflow.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 99 | `scratch/live_evidence/01_live_landing_320px.png` | Untracked | PNG Screenshot | Category H | Visual screenshot capture of post-deployment production verification | No | Retain locally in scratch or delete after sign-off |
| 100 | `scratch/live_evidence/02_live_landing_393px.png` | Untracked | PNG Screenshot | Category H | Visual screenshot capture of post-deployment production verification | No | Retain locally in scratch or delete after sign-off |
| 101 | `scratch/live_evidence/03_live_landing_768px.png` | Untracked | PNG Screenshot | Category H | Visual screenshot capture of post-deployment production verification | No | Retain locally in scratch or delete after sign-off |
| 102 | `scratch/live_evidence/04_live_bottom_nav.png` | Untracked | PNG Screenshot | Category H | Visual screenshot capture of post-deployment production verification | No | Retain locally in scratch or delete after sign-off |
| 103 | `scratch/live_evidence/05_live_login_view.png` | Untracked | PNG Screenshot | Category H | Visual screenshot capture of post-deployment production verification | No | Retain locally in scratch or delete after sign-off |
| 104 | `scratch/live_evidence/06_live_booking_wizard.png` | Untracked | PNG Screenshot | Category H | Visual screenshot capture of post-deployment production verification | No | Retain locally in scratch or delete after sign-off |
| 105 | `scratch/live_evidence/07_live_order_tracking.png` | Untracked | PNG Screenshot | Category H | Visual screenshot capture of post-deployment production verification | No | Retain locally in scratch or delete after sign-off |
| 106 | `scratch/live_evidence/08_live_manager_portal.png` | Untracked | PNG Screenshot | Category H | Visual screenshot capture of post-deployment production verification | No | Retain locally in scratch or delete after sign-off |
| 107 | `scratch/pre_release_audit_verifier.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 108 | `scratch/reproduce_mobile_layout.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 109 | `scratch/test_live_booking.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 110 | `scratch/test_live_nav.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 111 | `scratch/test_mobile_nav.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 112 | `scratch/verify_768_nav.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 113 | `scratch/verify_fixed_mobile.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 114 | `scratch/verify_live_deep.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |
| 115 | `scratch/verify_live_production.cjs` | Untracked | CJS Script | Category F | One-off diagnostic and verification script for mobile layout and nav audit | No | Proposed for Deletion (transient scratch) |

---

## 5. Proposed Next Step
Awaiting explicit user confirmation before executing any file removals. Once approved, transient files in `scratch/` and `docs.zip` will be safely removed, and permanent documentation will be staged in an organized commit.
