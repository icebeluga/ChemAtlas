# ChemAtlas emergency recovery manifest — 2026-11-12

## Purpose and boundaries

This manifest preserves the **GitHub-committed** state recoverable while the ChatGPT Work conversations "Save Batch 2 Checkpoint" and "Save Batch 3 Checkpoint" were not loading ("Could not load this ChatGPT conversation"). The data below was checked against the private `icebeluga/ChemAtlas` repository on 2026-11-12. Earlier reported outcomes are distinguished from new verification.

**Not recovered:** the complete missing ChatGPT conversation transcripts, any uncommitted files in their Work environments, active process state, unpushed tool artifacts, or hosted review data. These backups do **not** stop a Work run and do not prove that a run has stopped. Nothing was merged to `main`, deployed, or written to the hosted review application.

## Frozen GitHub backups created

Each `backup/emergency-2026-11-12/...` ref was created from the **exact verified SHA** of its corresponding branch. This is a complete Git snapshot of that branch's committed tree/history, not just its latest report.

| Source branch | Frozen backup branch suffix | Exact source SHA |
|---|---|---|
| `main` | `main` | `95c09c0cf1cd703cb8c30f7e23da47bb4571cc98` |
| `work/automatic-pdf-boundaries` | `automatic-pdf-boundaries` | `a088a88e22f005140eda42250198bfcf17456661` |
| `work/online-question-image-review` | `online-question-image-review` | `200e9081ab963acd296fdd9fd598684904fba881` |
| `work/private-review-deployment` | `private-review-deployment` | `19d94f890204dfedb80863980473b48d00b81b70` |
| `work/public-ui-recovery` | `public-ui-recovery` | `8e0a13aa6376377b7dfc7317042be259a281eb37` |
| `work/question-crop-verification` | `question-crop-verification` | `fbd4188f33137513cfecf80a224688ece06f5840` |
| `work/question-image-review-dashboard` | `question-image-review-dashboard` | `54061720af651e0b5f2118467c8709fc730cf75f` |

Existing backups **left intact**:
- `backup/crop-checkpoint-482a83d` → `482a83d9c799c9fdf7cd94e6ca7d0f025a8b210f`
- `backup/save-batch-2-checkpoint-2026-11-12` → `a088a88e22f005140eda42250198bfcf17456661` (**despite its name, this preserves the latest committed detector through Batch 6; it is NOT a copy of the Batch 2 chat**).

This manifest is committed separately on `backup/emergency-2026-11-12/recovery-manifest`; source and backup branches remain unmodified.

## Detector / Phase 2: recoverable development milestones

- **Batch 3**: initial report said a five-question final visual recheck passed; later `mcq-1984-8-120` reproduced a full production-path bug including a printed page number, and the earlier blanket 5/5 claim was explicitly withdrawn. Relevant saved commits: `a62f521720a2bc0a919a84dc797814890dab8c70` (checkpoint) and `2f11785cc8dd4bc557989b98e70ee445b18d9fc3` (failure-specific repair). See `research/reports/real-pdf-visual-audit-batch-03.md`.
- **Early independent validation**: Batch 1 showed a false automatic approval in `mcq-2002-7-606` and additional manual-review cases. The historical Batch 4 saved evidence and regressions are in the detector branch; do not treat those failure cases as new independent successes.
- **Batch 5**: committed frozen result `bce480c9bd95fa806834ea508a8840fc6e159d69` found **0/5 complete-and-clean**, three critical incomplete extractions, two false automatic approvals, one catalog/source-year inconsistency, and one FRQ with minor extra content. See `research/reports/independent-validation/batch-05-report.md`.
- **Batch 5 repair**: commit `3df2cb9af033996a48735374fdb280fa91f6ac57` fixed known development examples (right-edge answer clipping, missing shared heating graph, missing upstream equation and adjacent-page FRQ part), investigated mislabelled `frq-2016-1-385` (source header indicates 2019), and **disabled automatic application of proposals**. All outputs remain proposal-only. Saved repair report: `research/reports/independent-validation/batch-05-repair/report.md`. It reports **51 tests passed**; this has not been independently rerun during the recovery.
- **Batch 6**: frozen independent validation against the repaired detector, saved at `a088a88e22f005140eda42250198bfcf17456661`: **4/5 complete, 4/5 clean, 5/5 readable, 4/4 required manual reviews correctly routed, 0 automatically applied proposals**. `mcq-2023-43-1731` remains incomplete: left side of graph, beginning of stem, and choices cut off. Reports: `research/reports/independent-validation/batch-06-report.md` and `batch-06-results.json`. **Caveat**: the Markdown and JSON reports differ in question/sample ordering; reconcile before using sample-level metrics. No Phase 2 corpus-wide reliability claim is justified.
- **Phase**: Phase 2 still open; do not start Phase 3 from these results.

## Other preserved work

- `work/public-ui-recovery`: reconstructed newer UI and practice-builder work. Not equivalent to recovery of the unavailable original unsaved ChatGPT Site interface; no deployment/browser verification established by this backup.
- `work/online-question-image-review`, `work/private-review-deployment`, `work/question-image-review-dashboard`: separate image review and hosted-review development histories, saved as separate Git refs. No hosted review records were touched in this emergency backup.
- `work/question-crop-verification` and `backup/crop-checkpoint-482a83d`: crop geometry and prior verification histories.

Historical project context (not freshly audited here) included 1,542 indexed records in an older local checkout (1,285 MCQ and 257 FRQ, 8 source PDFs), 94 visually verified crops at one checkpoint, and inconsistencies between old and newer site counts. **Do not treat these as current deployed catalog counts**.

## Safe recovery instructions

1. Preserve all `backup/emergency-2026-11-12/*` refs, the two prior `backup/*` refs, and the source branches. Do not delete or force-push.
2. Investigate inaccessible ChatGPT Work sessions separately through ChatGPT and OpenAI Support, using conversation URLs and request diagnostics; do not assume the runs are stopped.
3. When resuming work, check for any newer source commits made after these snapshots. Inspect uncommitted Work-environment changes if the sessions become accessible; commit or export them separately.
4. Avoid simultaneous Work runs changing the same Git branch until the original session status is understood.
5. For detector work, start from `work/automatic-pdf-boundaries` or its frozen emergency snapshot. Maintain proposal-only safeguards, repair the outstanding Batch 6 question, and conduct a fresh locked independent validation batch; do not retroactively convert development repairs into validation passes.
6. Do not change hosted review records or deploy production changes without an explicit development plan and verification.

## Key links

- Repository: https://github.com/icebeluga/ChemAtlas
- Detector report: https://github.com/icebeluga/ChemAtlas/blob/work/automatic-pdf-boundaries/research/reports/independent-validation/batch-06-report.md
- Batch 5 repair: https://github.com/icebeluga/ChemAtlas/blob/work/automatic-pdf-boundaries/research/reports/independent-validation/batch-05-repair/report.md
- Frozen detector backup: https://github.com/icebeluga/ChemAtlas/tree/backup/emergency-2026-11-12/automatic-pdf-boundaries

**Audit scope:** GitHub commit and file reads plus available historical conversation context; no live Work transcript, execution log, GitHub Actions validation run, deployment audit, or remote workspace filesystem inspection.
