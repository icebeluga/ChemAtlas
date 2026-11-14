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
