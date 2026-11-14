# Concept classification: progress checkpoint

Branch `feature/concept-classification-pipeline`, cut from `origin/main` at `4f965e3` (the approved base; the earlier local branch `fix/local-workers-runtime` is untouched).

## Done
- Research inputs imported unchanged to `research/concept-taxonomy/` (SHA-256 verified).
- Normalized taxonomy v1: `research/concepts/concepts.v1.source.json` (authored, 109 concepts incl. 4 beyond-AP, 6 skills) -> `taxonomy.v1.json` (generated; all 810 research labels mapped, 57 research groups crosswalked).
- Concept graph in graphify node-link format: `research/concepts/concept-graph.json`.
- Library `lib/concepts/` (taxonomy, content+readiness, candidates, records/validation/review, evaluate, search, graph) and CLI `scripts/concepts/cli.mjs`.
- Pilot selection (92 real questions) and packets with rendered crops in `research/concepts/runs/pilot-v1/`.

## In progress
- Pilot pass A (Opus subagents, prompt classifier.v1) and independent pass B (Sonnet subagents).

## Next
- Ingest, compare, adjudicate reference, evaluate, tests, docs.
