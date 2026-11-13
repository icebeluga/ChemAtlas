# E. Stage 3 implementation plan

**Start from `63fd7e4b5287d74f66227742e8b2a4f47e37920f` on a new integration candidate branch.** B provides the protected application and inherits the integrated processing/review work. Apply C as the first bounded UI patch. Use A as the interface and worksheet reference. Use `main` only as the release-control reference in this stage. Keep the candidate off production.

| Order | Work | Dependencies and acceptance |
| ---: | --- | --- |
| 1 | Freeze A/B/C/D SHAs, catalog/PDF hashes and workflow pin. Establish a reproducible B build and take pre-change screenshots. | Frozen pnpm install, typecheck, build, source/built private assertions, Node tests, Python tests with PyMuPDF and Tesseract. Record any baseline failure with fixture and SHA. |
| 2 | Apply C's two-file Question Bank port, then reconcile A's unit view, navigation, tokens and responsive styling. | Preserve direct IDs, search/type/status/topic filters, Back/Forward and reload. Scope styles around review and print pages. Compare A/C screens on equal data. |
| 3 | Port A's separate builder route, draft validation/storage, selection and arrange/format/preview/export UI. Keep D's existing practice session behavior. | Keep saved IDs and progress-transfer schema. Exercise v1/v2 and C flat selection import, multiple drafts, reopen, reorder, duplicate, restore and invalid inputs. Use A worksheet source registries. |
| 4 | Combine A export presentation with B shared stimulus logic and validated full-page fallback. | PDF tests cover 2008 Q1–3 once, one member alone, overlapping fallback pages, mixed MCQ/FRQ, multi-page FRQ, printed answer leakage and verified-key-only modes. Compare PDF page count and visual layout to approved fixtures. |
| 5 | Build a versioned catalog candidate using Report C. | First stage the 22 documented additions; inventory the 87 unresolved records and 864 field-level rows. Gate source/type/page/classification changes on recorded decisions. Retain 1,542 prior IDs and all existing associations. Preserve original B blob as rollback. |
| 6 | Verify private separation and feature behavior in isolated builds. | Test signed/unsigned/wrong-audience Access, denied admin/backup routes, bundle/CSS/PDF protection, no D1/R2 review bindings, fallback and unchanged review fixtures. Keep student accepted-image delivery as a separately reviewed decision if required. |
| 7 | Record a handoff candidate, manifest and rollback procedure. | Record commit, catalog and asset hashes, tests, screenshots, deferrals and release prerequisites. Keep the existing production pin until the later release stage approves a specific SHA. |

## Browser acceptance

Compare A reference and candidate on Chromium at 1440×900 and 390×844, plus tablet and narrow-width smoke checks. Capture Browse by Unit, default/filtered Question Bank, MCQ and multi-page FRQ, detail image modes, mobile menu, practice session, builder selection/arrange/format/export and a representative PDF. Record data fixture, viewport, SHA and expected differences. Require no horizontal overflow, clipped controls or broken sticky panels. Exercise keyboard navigation, focus, empty/error states, back/forward, deep links and reload. Capture explicit parity decisions for intentional UI changes.

## Release and recovery handoff

Keep the original branch snapshots and matching PDFs. Reverting the student candidate should restore a previous app and its matching catalog/worksheet manifest together. Before any later authorized deployment, verify the previous active Worker version, build from the approved SHA, check the generated private config and protected assets, then record signed-in and anonymous outcomes. Roll back to the recorded version if guard, bundle, PDF or Access behavior fails. Keep private D1/R2 backup and restore outside student rollback. Use a new candidate branch or revert commits during Stage 3 without rewriting any audited refs.

## Completion gates

- All pinned tests pass and browser evidence is tied to one candidate SHA.
- Browse, bank, detail, practice sessions and multi-draft export work on the supported viewports.
- No missing prior IDs, broken page pointers or loss of the six groups and 17 associations. Each addition and classification change has a recorded disposition.
- Runtime package and guarded Worker behavior match the protected infrastructure. Existing approved images remain isolated under their service's authorization.
- Unresolved catalog candidates and hosted-only checks are explicitly tracked as release gates or deferred features, with documented fallbacks.
