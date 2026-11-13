# Unified branch verification

Tested application and catalog checkpoint `00e598286ffbc217875f1f9c02b96eef2a86168d`. The two app blobs and catalog-diff blob were checked against GitHub by SHA. The catalog and the eight source PDFs were checked by Git blob hash. Testing used the local checkout and isolated review data.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed with pnpm 11.25.0 and Node 24.22.1. |
| `pnpm exec tsc --noEmit` | Passed. |
| `pnpm build` | Passed with Vinext's route-classification advisory. |
| `node --test tests/*.test.mjs` | 29 passed. Covers navigation, source-page ranges, canonical stimulus associations, worksheet deduplication, review revisions, backup and restore, and Access JWT verification. |
| `python -m unittest discover -s tests -p 'test_*.py' -v` | 51 passed on the source PDFs, including the Phase 2 proposal-only regression and shared-stimulus export. |
| `python research/audit_crop_geometry.py --output /tmp/chematlas-geometry.json` | Eight source segments, 1,814 valid question regions, six valid stimulus regions, zero geometry errors, and 240 near-full-page warnings. Geometry does not measure extraction completeness. |
| Built preview, Chromium at 1440 × 900 | Passed Question Bank search and unit/type filters, MCQ detail, PDF canvas fallback, browser Back/Forward, direct FRQ URL, and Practice Builder session start. |
| Built preview, Chromium at 390 × 844 | Passed mobile navigation to the Question Bank and checked that the page had no horizontal overflow. |
| Worksheet print output | Chromium produced a two-page PDF for 2008 MCQ Q1–3. PDF inspection found the shared-stimulus heading once and at least four embedded image segments. |
| Local development review dashboard | Chromium opened the dashboard with file storage paths isolated under a temporary directory. The development entry point bypasses Cloudflare Access. |
| Unconfigured built public review routes | The admin page returned 404. The review and backup APIs returned 503 with Access unconfigured, so review data was unavailable. The Access module's signed-token test verified owner acceptance and non-owner rejection. |

The browser run used Chromium headless shell after the system Chromium binary failed on an unavailable socket operation. Wrangler needed a local loopback interface shim for this container. Neither workaround is part of the application.

The browser run did not exercise a Cloudflare Access owner sign-in end to end or render a served accepted-image revision. The signed-token, image revision and storage tests exercised those components separately. The review branch remains a draft pending that browser verification. Historical independent extraction results remain as recorded in the foundation.

## Pushed application checkpoints

| Checkpoint | SHA |
| --- | --- |
| Inventory and integration plan | `9ab97c71261428c8f98f582d5a6f349f705573be` |
| Student UI and image-review reconciliation | `9ba587bb643222bda3dcf9ebdbbcae11fec33982` |
| Worksheet PDF and shared context | `0bd3d2d448478a08665d7fa44b7f3531165e4d69` |
| Canonical catalog report and integrity tests | `00e598286ffbc217875f1f9c02b96eef2a86168d` |
