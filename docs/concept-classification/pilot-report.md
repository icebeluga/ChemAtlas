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
| B: Sonnet, v1 | 0.83 | 0.87 | 0.42 | 0.76 |
| C: Opus, v2 (fresh run, not shown to adjudicator) | 0.95 | 0.94 | 0.79 | 0.76 |

Correction (round 2): the first version of this report gave run B as 0.89 / 0.85 / 0.50 / 0.76. That `evaluation-b.json` had been written before the range-aware comparison fix in the same commit. Re-scored with the fixed code, run B is as shown above. Runs A and C were unaffected.

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

A recommended production run is Opus for pass 1, a second independent pass, and adjudication of disputes only (about half the questions). That comes to roughly **$100–130 for the full catalog** at batch prices; human review time is the real cost. In the pilot, subagents classified 23 questions in about 6 minutes of wall-clock time per batch, with 4 batches in parallel. Sonnet was cheaper but noticeably less accurate on supporting tags (precision 0.42), so it is suited only as a disagreement detector, not as the primary classifier.

## What a human needs to do next

1. Open `research/concepts/runs/pilot-v1/review-sheet.html` locally (run `node scripts/concepts/cli.mjs prepare --run pilot-v1` first if the images are missing; they are not committed). Review at least the 40 benchmark questions and download the decisions file.
2. `node scripts/concepts/cli.mjs review --file concept-review-decisions.json` → records become `human_verified` (or rejected/edited) with history.
3. Turn the human decisions into the real reference: edit `reference-pilot-v1.json` (or create `reference-pilot-v1.human.json`) and run `evaluate --reference …` for passes a, b and c to get true precision and recall.
4. Decide the six conventions above, write them into the concepts' include/exclude text, rebuild the taxonomy (affected records go stale automatically), and re-run.

## Round 2 (2026-11-14, after the draft PR)

Everything below is model work, checked by code and by a second model where stated. **No human has verified any tag, convention or page location yet.**

### Blocked questions: 7 of 7 recovered, plus 1 more

All seven blocked questions had their missing content on an adjacent PDF page. The fixes live in `research/concepts/content-supplements.json`, which the pipeline applies on top of the catalog; `public/student-questions.json` and the image-review service are unchanged. A supplement changes the question's content hash, so only those records went stale and were re-classified (run `pilot-v1-recovered`, same two passes and prompt).

| Question | What was missing | Where it was | Catalog fix proposed |
| --- | --- | --- | --- |
| `mcq-2018-36-1207` | eggshell data for Q35–38 | previous page (1206) | register shared stimulus |
| `frq-2011-6-937` | parts (b)(ii) and (c) | next page (938) | |
| `frq-2024-3-2119` | part (f) | next scanned page (2122); page 2123 starts Question 4, so (f) is the last part | |
| `mcq-2024-21-2091` | wrong page: 2091 prints Q23–25 and its OCR read "23." as "21." | printed Q21 is on page 2089, which no record cites | repoint record, replace text |
| `mcq-2024-33-2094` | wrong page: 2094 prints Q31–32 | printed Q33 is on page 2095 | repoint record, replace text |
| `mcq-2022-62-1709` | parts (c)–(d) | next page (1710) | it is an FRQ from a scoring guide typed as MCQ |
| `mcq-2023-67-1808` | parts (c)–(d) | next page (1809) | same |
| `mcq-2014-33-185` | PCl5 equilibrium for Q29–33 | previous page (184) | register shared stimulus (found by the blind adjudicator) |

Second pass on the recovered questions: 3 agree, 2 partial, 2 disagree (the 8th was re-run separately). For the two wrong-page records, the catalog text belongs to another question, so it is withheld from the classifier and the readiness check forces image review.

Other catalog issues found this round: `frq-2011-3-946` is printed as 2002 Form B Question 3; the 2014 practice exam's Q29–33 stimulus and the 2018 Q35–38 stimulus are not in `research/stimuli.json`.

### Crop worklist

`cli.mjs crop-issues` writes `runs/pilot-v1/crop-issues.json`: 45 pilot questions with a crop or diagram problem, ordered by severity (1 wrong question, 6 missing content, 6 no crop, 8 extra content, 24 content recovered from the full page), each with a suggested action and any supplement page. It uses the earliest record that reported the problem, so a re-classification from a supplement does not hide the original defect. It is input for the image-review owner; nothing in the review service was changed.

### A held-out reference (blind)

The 40-question benchmark has two weaknesses: pass A's output was one of the proposals the adjudicator judged, and changes tuned on it cannot be validated on it. So the other 45 classified pilot questions got a **blind** reference: Opus with `prompts/adjudicator.blind.v1.md` saw only the images and concept definitions, never a classifier's output (`benchmark/holdout-reference-pilot-v1.json`, 44 complete + 1 partial).

| Pass A (Opus, v1) on | Primary P / R | Supporting P / R | Concept present, any role, P / R |
| --- | ---: | ---: | ---: |
| 40-question benchmark (inflated) | 0.95 / 0.99 | 0.80 / 0.83 | 0.95 / 0.99 |
| 44-question blind held-out set | 0.91 / 0.92 | 0.75 / 0.73 | 0.93 / 0.93 |
| **All 84, combined** | **0.93 / 0.95** | **0.77 / 0.77** | **0.94 / 0.96** |
| MCQ only (68) | 0.94 / 0.97 | 0.83 / 0.75 | 0.96 / 0.96 |
| FRQ only (16) | 0.92 / 0.93 | 0.73 / 0.79 | 0.93 / 0.95 |

Pass B (Sonnet) on all 84: primary 0.83 / 0.87, supporting 0.41 / 0.73.

What the errors are: **finding the right concept is fairly reliable (~0.94); deciding its role is not.** 15 of the errors on the 84 questions are role swaps (the right concept, tagged primary instead of supporting or the reverse), concentrated in multipart FRQs. Reviewers can fix a role with one click, and student search can match "primary or supporting", which makes search tolerant of role errors.

### Boundary conventions

`research/concepts/conventions.json` lists the six disputed boundaries from round 1 plus a seventh (specific IMF as co-primary vs supporting), each with options, the benchmark cases it affects, and a model suggestion kept separate from the decision. All are `undecided`. `evaluate --conventions` leaves the concepts of undecided cases out of the score: on the benchmark, pass A becomes primary 1.00 / 1.00 and supporting 0.83 / 0.95. That is a ceiling estimate for once the conventions are settled, not a measured result.

New boundary questions raised by the blind adjudicator (in its `notes`): vapor pressure has no concept (it currently falls under `dynamic-equilibrium`/`imf-properties`); ΔG° from free energies of formation; d-orbital hybridization in legacy items; combining ΔG° values (`coupled-reactions` vs `hess-law`).

### Supporting-tag verifier (experiment, not adopted)

`prompts/verifier.v1.md` re-checks only pass A's supporting tags against two tests (necessary, and not a routine step). It was written from the general rule, not from benchmark errors. Over the 85 classified questions it removed 5, moved 6 to contextual and added none.

| On all 84 | Supporting P / R |
| --- | ---: |
| Pass A | 0.77 / 0.77 |
| Pass A + verifier | 0.83 / 0.70 |
| Same, blind held-out set only | 0.75 / 0.73 → 0.78 / 0.68 |

It trades recall for precision rather than improving both; on the blind set the gain is small. Stored records stay on pass A. If the owner decides that a wrong tag in student search is worse than a missing one, the verifier is a ready precision setting (results in `runs/pilot-v1/results-v/`).

### Human review workflow

`cli.mjs review-sheet --runs pilot-v1,pilot-v1-recovered` now:
- shows the 40 benchmark questions first, with filters (benchmark, needs attention, machine reviewed, not yet decided) and a progress count;
- offers pass B's differing tags as one-click options per part, and an add box per part (previously every addition went to the first part);
- keeps the classifier's evidence when a tag is kept;
- refuses to export an edit that leaves a part without a primary concept or puts one concept in two roles (also enforced by `cli.mjs review`);
- shows content supplements so the reviewer can confirm the page;
- has a panel for the seven conventions; choices are exported with the reviewer's name and recorded in `conventions.json` by `cli.mjs review`;
- autosaves in the browser.

After review, `cli.mjs build-reference --from-review` builds `benchmark/human-reference-pilot-v1.json` from records a named person approved or edited (machine agreement never counts), and `evaluate --reference` with that file gives the first human-measured accuracy.

### Still needs a human

1. Review the benchmark (and ideally the held-out set) in the sheet; this is the only way to get a real accuracy figure.
2. Decide the seven conventions in the sheet's panel.
3. Confirm the eight supplement page locations, and decide whether to apply the proposed catalog corrections.
4. Decide whether student search should favour precision (verifier) or recall (pass A).
