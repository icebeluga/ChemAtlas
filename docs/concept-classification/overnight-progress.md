# Concept classification: progress checkpoint

Branch `feature/concept-classification-pipeline` (draft PR icebeluga/ChemAtlas#5). Nothing is merged or deployed, and no full-catalog classification has been run.

## Round 1 (done, committed before the PR)
Taxonomy 1.0.0, pipeline, review sheet, 92-question pilot, 40-question adjudicated benchmark. See `pilot-report.md`.

## Round 2 (2026-11-14)
1. All 7 blocked questions recovered from adjacent PDF pages via `research/concepts/content-supplements.json` (catalog unchanged), plus `mcq-2014-33-185`; re-classified in run `pilot-v1-recovered`. Pilot now 92/92 classified, 0 blocked.
2. Crop worklist: `cli.mjs crop-issues` → `runs/pilot-v1/crop-issues.json` (45 questions).
3. Blind held-out reference for the other 45 pilot questions; combined accuracy over 84 questions: primary 0.93/0.95, supporting 0.77/0.77, concept-in-any-role 0.94/0.96. Role swaps are the main error.
4. Pass B's round-1 figures were stale (written before the range-aware fix); corrected to supporting precision 0.42.
5. `conventions.json`: 7 open boundary decisions with affected cases; `evaluate --conventions`.
6. Supporting-tag verifier experiment: precision up, recall down; not adopted.
7. Review sheet: benchmark first, filters, per-part additions, second-pass suggestions, edit validation, conventions panel, autosave; `build-reference --from-review`.
8. 21 concept tests pass.

## Needs a human
Review the benchmark in the sheet, decide the conventions, confirm the supplement pages and catalog corrections, choose precision vs recall for student search.

## Round 3 (2026-11-14): independent-review package
- `export-review-package` builds a review package for an outside AI reviewer (GPT-6); `import-ai-review` validates and stores the results as an independent AI review (never human-verified).
- Package built and verified: 85 questions (40 benchmark + 45 held-out), 150 parts, 195 source images, 109 concepts, 7 conventions, 8 corrections; 379 files, 39 MB. Saved to the owner's Downloads folder (not committed).
- `research/concepts/catalog-issues.json` collects the catalog problems found so far.
- 24 concept tests pass.

## Round 4 (2026-11-14): GPT-6 audit imported
- GPT-6 results (85 questions, 174 parts) validated with 0 errors and imported as an independent AI review; raw files kept in `research/concepts/ai-reviews/source/`. Batch files and Phase-1 snapshots were not provided.
- Cross-family agreement: primary ~0.82, supporting ~0.5 (vs 0.93 / 0.77 within Claude). Of the 23 primary disagreements, Claude matches the taxonomy rules in 10, GPT-6 is right in 1 (+2 where Claude omitted entropy), 1 taxonomy gap, 4 legacy-format, 4 role calls, 1 unresolved.
- GPT-6 advice recorded on 7 conventions (all still undecided); 2 new conventions (C7, C8); all 8 page corrections independently confirmed; 4 catalog issues added.
- Validation now flags `exclude-rule-check`. Analysis: `gpt6-audit-analysis.md`.

## Round 5 (2026-11-14): taxonomy 1.1 draft
- Draft source and build (113 concepts: 6 edited, 4 added) from changes both AI reviews support; not active, nothing re-classified. Adopting it would make 17 records stale. Change log: `research/concepts/taxonomy-1.1-changes.md`.
- `build-taxonomy --source --out` builds a draft without touching the active taxonomy.

## Round 6 (2026-11-14): conductivity topic and frq-2024-5-2125
- `electrolyte-conductivity` now topic 3.7 (related 3.8, 2.3), documented as a ChemAtlas decision; draft rebuilt (`d4073d133876a5e5`), still inactive.
- `frq-2024-5-2125` is from a different, unreleased exam form (scanned booklet; year only from the uploader's title), not a numbering typo; record unchanged. Three more catalog problems found. See `source-identity-frq-2024-5-2125.md`.
