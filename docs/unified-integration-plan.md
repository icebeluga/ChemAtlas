# ChemAtlas integration inventory and plan

GitHub inventory checked November 12, 2026. The foundation is the exact requested detector SHA. Each of the seven emergency snapshot refs matched its source head. The separate recovery manifest is preserved at `2ce54bdf42976d2dfdd284977f2b5d761d402332`.

| Ref | SHA | Ancestry compared with foundation |
| --- | --- | --- |
| `backup/crop-checkpoint-482a83d` | `482a83d9c799c9fdf7cd94e6ca7d0f025a8b210f` | behind, +0/−72 |
| `backup/emergency-2026-11-12/automatic-pdf-boundaries` | `a088a88e22f005140eda42250198bfcf17456661` | Foundation SHA |
| `backup/emergency-2026-11-12/main` | `95c09c0cf1cd703cb8c30f7e23da47bb4571cc98` | Frozen reference |
| `backup/emergency-2026-11-12/online-question-image-review` | `200e9081ab963acd296fdd9fd598684904fba881` | Frozen reference |
| `backup/emergency-2026-11-12/private-review-deployment` | `19d94f890204dfedb80863980473b48d00b81b70` | Frozen reference |
| `backup/emergency-2026-11-12/public-ui-recovery` | `8e0a13aa6376377b7dfc7317042be259a281eb37` | Frozen reference |
| `backup/emergency-2026-11-12/question-crop-verification` | `fbd4188f33137513cfecf80a224688ece06f5840` | Frozen reference |
| `backup/emergency-2026-11-12/question-image-review-dashboard` | `54061720af651e0b5f2118467c8709fc730cf75f` | Frozen reference |
| `backup/emergency-2026-11-12/recovery-manifest` | `2ce54bdf42976d2dfdd284977f2b5d761d402332` | diverged, +1/−82 |
| `backup/save-batch-2-checkpoint-2026-11-12` | `a088a88e22f005140eda42250198bfcf17456661` | Foundation SHA |
| `main` | `95c09c0cf1cd703cb8c30f7e23da47bb4571cc98` | behind, +0/−82 |
| `work/automatic-pdf-boundaries` | `a088a88e22f005140eda42250198bfcf17456661` | Foundation SHA |
| `work/online-question-image-review` | `200e9081ab963acd296fdd9fd598684904fba881` | behind, +0/−69 |
| `work/private-review-deployment` | `19d94f890204dfedb80863980473b48d00b81b70` | behind, +0/−51 |
| `work/public-ui-recovery` | `8e0a13aa6376377b7dfc7317042be259a281eb37` | diverged, +18/−82 |
| `work/question-crop-verification` | `fbd4188f33137513cfecf80a224688ece06f5840` | diverged, +1/−82 |
| `work/question-image-review-dashboard` | `54061720af651e0b5f2118467c8709fc730cf75f` | behind, +0/−70 |

## File ownership and integration plan

| Paths | Evidence and decision |
| --- | --- |
| `app/page.tsx` | Both branches changed the student app. Three-way comparison against main found five conflict regions. Reconcile student navigation, Practice Builder, and responsive view changes with accepted-image fetch, PDF fallback, and existing question rendering. |
| `app/globals.css` | Three-way comparison found a theme conflict. Carry the public theme and student styles forward alongside foundation-specific private-review styles. |
| `app/navigation.mjs`, `tests/navigation.test.mjs` | Public-only navigation module and direct-link/URL tests. Carry forward and run against the integrated UI. |
| `docs/catalog-compatibility.md`, `docs/public-ui-recovery-investigation.md` | Carry public recovery evidence as historical material. |
| `tests/public-catalog-integrity.test.mjs` | Carry source/page integrity assertions forward and update the historical count expectations to the reconciled catalog. |
| `public/questions.json`, `public/source/*`, `public/page-audit.json`, `research/stimuli.json` | Use the foundation catalog as canonical. Compare by ID and field with the public snapshot. Verify 19 labels, two page expansions, stimulus membership, and PDF ranges. The screenshot total of 1,651 gives no IDs for the 109 missing records. |
| `app/admin/question-review/**`, `app/api/admin/question-review/**`, `lib/question-review-*`, `lib/cloudflare-access.*`, `drizzle/**`, `wrangler.private-review.jsonc`, `scripts/vite/question-review-plugin.mjs` | Private deployment, dashboard, and online image review heads are ancestors. Keep foundation auth, storage, revisions, backups, and route gating. Exercise private access only against isolated preview data. |
| `research/audit_crop_geometry.py`, `research/crop-geometry-audit.json` | These are the two files from the lone divergent crop commit. The foundation script contains its geometry logic plus stimulus validation. Retain the foundation script and report, and preserve the older report in its frozen ref. |
| `research/**`, `tests/test_*.py` | Keep detector scripts, fixtures, historical reports and independent-validation outcomes. Keep proposal-only behavior. |
| `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `worker/index.ts`, `.openai/hosting.json` | Foundation runtime and dependency configuration own the integration. Verify local builds and public/private route boundaries without publishing. |

The public compare lists seven changed paths, all covered above. Existing image-review and baseline commits already reach the foundation. The original unsaved Work session state and hosted review data are outside the verified source inventory.

## Verification gates and unresolved work

- Run the pinned install, typecheck, build, JavaScript and Python suites, and automated catalog comparison.
- Exercise student navigation, filters, details, back/forward, Practice Builder, PDF output, image fallback, private login and unauthorized rejection in a local browser where dependencies support it.
- Preserve the Batch 3 withdrawn blanket pass, Batch 5 frozen 0/5 complete-and-clean, and Batch 6 incomplete `mcq-2023-43-1731`. Batch 6 Markdown/JSON ordering discrepancy remains open. Keep the 2016/2019 source-year discrepancy visible.
- Commit and push phased checkpoints, document actual test results and local service commands, and open a review PR. No hosted review writes, deployments, main merges or backup edits.
