# Pilot report: `pilot-v1`

Date: 2026-11-14. Taxonomy 1.0.0 (`2807830503f6372c`). All numbers below come from files in `research/concepts/runs/pilot-v1/` (`report.json`, `compare-b.json`, `evaluation-{a,b,c}.json`) and `research/concepts/benchmark/reference-pilot-v1.json`.

## Bottom line

- The pipeline works end to end on real ChemAtlas questions: 92 selected, 85 classified, 7 correctly **blocked** because part of the question could not be seen. Nothing failed validation after fixes, and nothing was guessed.
- On a 40-question benchmark built by a model adjudicator (**not** a human), the main ("primary") concept is right about **95% of the time**. **Supporting** concepts are right only about **76–80%** of the time, below the 90% target.
- **Recommendation: do not start broad automated tagging yet.** First, a chemistry teacher reviews the 40 benchmark questions and settles about six boundary conventions (listed below). Then those conventions go into the concept definitions (taxonomy 1.1) and the benchmark is re-run. The primary-concept level is close to ready; the supporting level is not.

## What was processed

| | Count |
| --- | --- |
| Questions selected (stratified: all 9 units, MCQ and multipart FRQ, shared stimuli, flagged crops, OCR-uncertain, answer-page sources, scans, legacy) | 92 (72 MCQ, 20 FRQ) |
| Classified (content complete) | 85 |
| Blocked by missing content | 7 |
| FRQ/MCQ parts classified | 168 |
| Distinct concepts used | 91 of 109 |
| Primary concepts per part | 1 → 154 parts, 2 → 14 parts |
| Supporting concepts per part | 0 → 106, 1 → 57, 2 → 5 |
| Official topic proposed differs from catalog | 11 questions (flagged, catalog not changed) |
| Review status after the second pass | 33 `machine_reviewed` (both passes agreed, no flags), 52 `needs_attention`, 7 `blocked`, 0 `human_verified` |

**Blocked (no tags stored):** `mcq-2018-36-1207` (shared eggshell data on an earlier page), `frq-2011-6-937` and `frq-2024-3-2119` (continuation page missing), `mcq-2024-21-2091` (stimulus missing; crop shows Q23–25), `mcq-2024-33-2094` (page holds only Q31–32), `mcq-2022-62-1709` and `mcq-2023-67-1808` (scoring-guide pages, continuation missing).

**Crop findings (from the classifiers comparing crop with full page):** 47 crops fine; 24 cut off content that was recovered from the full page; 8 include neighbouring questions; 6 missing content that could not be recovered; 6 have no crop; 1 shows the wrong question. Diagrams: 43 analyzed, 3 partially readable, 1 unreadable. So about half of the sampled crops are imperfect. This confirms that text-only classification would be unsafe, and gives the image-review work a concrete list (the `flags` in `classifications.json`).

**Catalog data issues found** (reported, not changed): `frq-2003-3-536` is printed as the 2017 FRQ 3; `mcq-2024-21-2091` and `mcq-2024-33-2094` don't match the printed question numbers; 572 records have a `primaryUnit` that is null or disagrees with `primaryTopic`.

**Most frequent concepts:** primary: Gibbs free energy (6), enthalpy of reaction (6), IMFs and properties (5), hydrogen bonding (5), ionization energy (4), Lewis structures (4), titration curves (4), entropy (4). Supporting: electron-domain counting (5), Coulomb's law (4), precipitation (4). Most common combinations within a part: hydrogen bonding + IMFs and properties (5), Coulomb's law + ionization energy (4), electron domains + molecular geometry (3), free energy & equilibrium + Gibbs free energy (3).

## Strong examples

- `mcq-1994-65-692` (both passes agreed): primary `ph-solubility`, because the student "must recognize that a salt with a basic anion that is insoluble in water dissolves in acid because H+ consumes the anion". Supporting `precipitation`, because "must use the AP solubility facts that ammonium and nitrate salts are soluble to eliminate choices". The supporting tag is justified by how the distractors are eliminated, not by keywords.
- `frq-2008-3-59` (agreed, six parts): (a) `cell-potential`; (b) `cell-potential` + supporting `redox-half-reactions` ("must determine n = 6 from the balanced equation"); (c) `entropy`; (d)–(f) `rate-law`. One FRQ spans electrochemistry, thermodynamics and kinetics, and each concept stays attached to its part.

## Agreement between two independent classifiers

Pass A: Claude Opus 5.5, prompt `classifier.v1`. Pass B: Claude Sonnet 5.5, same prompt, blind to A. On all 92 questions: **46 agree** (same primary concepts and similar supporting tags on every part), **34 partial** (same primary concept, different supporting tags), **12 disagree** (different primary concept on at least one part). This mostly measures supporting-tag instability: when they disagree, it is usually whether a step deserves a supporting tag.

## Accuracy against the benchmark

**Reference set:** 40 questions, deterministically sampled. 25 come from the questions where A and B did not fully agree, 15 from those where they agreed (sampled before a comparison bug was fixed; the fix moved one question between strata). An Opus 5.5 adjudicator (`prompts/adjudicator.v1.md`) looked at every image, decided independently, and then judged two anonymized proposals in random order (A and B). **It is a model-built reference and has not been checked by a human.**

Scoring counts (question, part, concept) pairs:

| Run | Primary precision | Primary recall | Supporting precision | Supporting recall |
| --- | ---: | ---: | ---: | ---: |
| A: Opus, v1 (stored) | 0.95 | 0.99 | 0.80 | 0.83 |
| B: Sonnet, v1 | 0.89 | 0.85 | 0.50 | 0.76 |
| C: Opus, v2 (fresh run, not shown to adjudicator) | 0.95 | 0.94 | 0.79 | 0.76 |

Caveats:
- Run A's scores are **inflated**: its own output was one of the two proposals the adjudicator saw, and the adjudicator is the same model. Run C is the fairer estimate of a fresh Opus classification.
- The sample over-represents hard questions (25 of 40 from disputed cases). On the agreed stratum all runs score ~1.0 for primary concepts; the full-pilot accuracy is therefore likely somewhat higher than the overall column.
- 40 questions is small; one question moves supporting precision by about 3 points.

Adjudicator verdicts on the proposals: A correct 31 of 40, over-tagged 5, wrong primary 3, under-tagged 1. B correct 20 of 40, wrong primary 10, over-tagged 10.

### Revision attempt (prompt v2)

The pass-A errors were mainly (a) making the specific intermolecular force co-primary with "IMFs and properties", and (b) supporting tags on routine steps. `classifier.v2` adds explicit conventions for these. Re-running the 40 questions (run C) left supporting accuracy unchanged and lowered primary recall. The remaining errors are boundary calls where a reasonable convention and the adjudicator disagree:

1. Shape vs polarity when a part asks both (`frq-1999-7-564 (d)`).
2. Collision model vs activation energy for temperature-dependence questions (`mcq-2008-11-31`).
3. Phase-change energy vs endothermic/exothermic for heating-curve questions (`mcq-2008-13-32`).
4. pKa speciation vs Henderson-Hasselbalch when a buffer's major species is asked (`frq-2003-3-536 (e)`).
5. Whether strong/weak acid identity is a supporting step in pH questions (`mcq-2016-9-1056`, `mcq-2022-52-1652`).
6. Whether a particle diagram earns `solution-representations` as a supporting tag (`mcq-2014-15-178`, `mcq-2022-56-1653`).

These are for a teacher to decide. Prompt wording alone did not settle them, so v2 was **not** adopted: stored records remain v1, and `classifier.v2.md` is kept as a documented experiment.

**Taxonomy gaps reported by the classifiers:** phase diagrams (excluded from the current CED; add a `beyond-ap` concept); Lewis acid–base adducts / coordinate covalent bonds (also excluded; legacy only); combining ΔG° or ΔS° values the way Hess's law combines ΔH, and ΔG° from free energies of formation (currently forced into `gibbs-free-energy` / `hess-law`); conductivity of electrolyte solutions; qualitative rate factors such as surface area (currently `collision-model`). Several legacy items have no CED topic; the validator now allows an empty topic only when all primary concepts are `beyond-ap`.

## Cost and throughput (measured inputs, estimated prices)

Measured per question: about 1.5k tokens of text and candidate definitions, about 2.0k image tokens (crop, page and stimulus at API scaling), about 14.5k tokens of fixed prompt and concept reference (identical for every question, so cacheable), and about 450 tokens of JSON output. Thinking tokens were not measurable through Claude Code; the estimate assumes about 2k per question.

| Model (list price per MTok) | Per question, standard | Per question, Batches API (−50%) | Full catalog (1,564), one pass, Batches |
| --- | ---: | ---: | ---: |
| Opus 5.5 ($4 in / $20 out, $0.20 cache read) | ≈ $0.066 | ≈ $0.033 | ≈ $52 |
| Sonnet 5.5 ($2 / $10, $0.10 cache read) | ≈ $0.033 | ≈ $0.017 | ≈ $26 |

A recommended production run is Opus for pass 1, a second independent pass, and adjudication of disputes only (about half the questions). That comes to roughly **$100–130 for the full catalog** at batch prices; human review time is the real cost. In the pilot, subagents classified 23 questions in about 6 minutes of wall-clock time per batch, with 4 batches in parallel. Sonnet was cheaper but noticeably less accurate on supporting tags (precision 0.50), so it is suited only as a disagreement detector, not as the primary classifier.

## What a human needs to do next

1. Open `research/concepts/runs/pilot-v1/review-sheet.html` locally (run `node scripts/concepts/cli.mjs prepare --run pilot-v1` first if the images are missing; they are not committed). Review at least the 40 benchmark questions and download the decisions file.
2. `node scripts/concepts/cli.mjs review --file concept-review-decisions.json` → records become `human_verified` (or rejected/edited) with history.
3. Turn the human decisions into the real reference: edit `reference-pilot-v1.json` (or create `reference-pilot-v1.human.json`) and run `evaluate --reference …` for passes a, b and c to get true precision and recall.
4. Decide the six conventions above, write them into the concepts' include/exclude text, rebuild the taxonomy (affected records go stale automatically), and re-run.
