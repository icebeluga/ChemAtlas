# Concept classification: progress checkpoint

Branch `feature/concept-classification-pipeline`, cut from `origin/main` at `4f965e3` (the approved base). The earlier local branch `fix/local-workers-runtime` (2 unpushed commits) is untouched. Upstream tracking was removed so nothing can be pushed to `main` by accident. Nothing has been pushed.

## Done
1. Research inputs imported unchanged (`research/concept-taxonomy/`, SHA-256 verified in a test).
2. Taxonomy v1.0.0: 109 concepts + 6 skills; all 810 research labels and 57 groups traced.
3. Library, CLI, review sheet, concept graph (Graphify-queryable), 15 automated tests.
4. Pilot `pilot-v1`: 92 real questions, crops rendered. Pass A = Opus 5.5 (stored), pass B = Sonnet 5.5 (blind, compared).
5. Benchmark: 40 questions adjudicated blind by Opus into `research/concepts/benchmark/reference-pilot-v1.json` (model-built, not human-verified). Scores in `runs/pilot-v1/evaluation-a.json` and `evaluation-b.json`.
6. Prompt `classifier.v2` written from the error analysis.
7. Defects found and fixed during the pilot: catalog FRQ labels that are ranges ("(a)–(c)", "(d onward)", "all parts") were rejected by validation and miscounted in comparison; now range-aware, with tests.

## Interruptions
- 2026-11-14: a 5-hour usage limit stopped 7 classifier agents. They resumed after the reset with no lost files.

## In progress / next
- Done: pass C (prompt v2) scored primary 0.95/0.94, supporting 0.79/0.76; v2 not adopted. See pilot-report.md.
- Done: pilot-report.md written and committed.
- Owner: human review of the benchmark (`runs/pilot-v1/review-sheet.html`) to turn the model-built reference into a real one.
