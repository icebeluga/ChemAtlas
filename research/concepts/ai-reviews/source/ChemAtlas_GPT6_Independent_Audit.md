# ChemAtlas — Independent GPT-6 Concept Audit

**Status:** Independent AI second opinion, **not human/teacher verification**.

**Input:** Supplied `ChemAtlas_Concept_Classification_GPT6_Review.zip`, 85 question records, source images and question text, canonical 109-concept taxonomy, original Claude classifications, seven undecided conventions and eight proposed catalog supplements.

## Deliverables

- `gpt6-review-results.json`: **all 85 questions**, schema-validated `chematlas-ai-review/v1`, including recommendations for 7 conventions and 8 source-page corrections.
- `gpt6-review-results-batch-01.json`: original **40 benchmark questions** (73 examined parts).
- `gpt6-review-results-batch-02.json`: **45 held-out questions** (101 examined parts).
- Separate Phase-1 snapshots document concept choices **before** inspecting bundled Claude classifications for each batch.

**Coverage:** 85 questions; 174 review parts; 45 explicit tagged findings. Comparison verdict totals (per question): agree=29, minor-differences=29, over-tagged=8, under-tagged=5, wrong-primary=8, wrong-role=6. These are disagreement counts, not measured accuracy against a human reference. Some entries called “minor differences” are taxonomy boundary calls that warrant discussion.

## Chemistry and taxonomy observations

1. **Primary/supporting roles:** Some questions have the correct concepts in swapped roles. For example, `mcq-2023-43-1731` asks for a titration indicator and should primarily assess titration-curve/equivalence-point interpretation, not pKa speciation.
2. **Over-tagging routine prerequisites:** `mcq-2008-11-31` directly identifies activation energy; tagging collision-model independently is unnecessary for the listed response. `mcq-2022-52-1652` explicitly states the acid is weak, so adding a separate strong/weak acid label can dilute search relevance.
3. **Independent subpart tasks:** `frq-1999-7-564` part (d) separately asks for Lewis structure, 3D shape and polarity. The two-primary restriction causes arbitrariness. Some FRQs in the catalog group explicit lettered subparts; independent records expand them where needed.
4. **Wrong scope/label:** `mcq-2018-38-1920` combines standard Gibbs free energies of reactions. The taxonomy's `hess-law` wording specifically describes enthalpy, so `coupled-reactions` (or a dedicated Gibbs additivity rule) is more precise.
5. **Legacy content:** XeF4 sp3d2 orbital hybridization on `frq-2008-5-63` is historical exam material beyond the current AP hybridization scope; do not silently tag as if current AP mastery were required. Legacy Lewis acid–base adducts and nuclear/colligative questions need distinct scope markers.
6. **Source metadata:** The original source for `frq-2011-3-946` is printed 2002 AP Chemistry Form B Question 3. The source text for `mcq-2002-38-614` was merged with an adjacent question by OCR; the actual question on the page tests spectrophotometry.

## Proposed handling of the seven conventions

Recommendations in the JSON retain the seven source IDs. The main principle: **tag what the question explicitly assesses**, put other nontrivial necessary reasoning in `supporting`, and track mere diagrams/graphs as representations instead of automatically assigning a chemistry concept. A source explicitly asking multiple independently assessed outcomes may require two primary concepts or a carefully separated subpart.

## Page correction check

All eight supplied source-page/stimulus corrections have `confirmed` or `unsure` with descriptive evidence in `correctionChecks` (the decisions are an AI inspection, not authorization to update the original catalog). The source PDF is the authoritative record, not OCR extraction.

## Reproducibility and cautions

- The source pictures were inspected through page images and multi-question contact sheets; not every individual image was magnified separately. The text layer was used to locate paragraphs and question subparts. Cases requiring visual evidence were treated with additional care.
- Original Phase-1 classifications were saved before Claude comparisons; **three held-out judgments were reassessed after comparison**, flagged with `changedMindAfterComparison=true` rather than silently rewriting the initial decision.
- Reasonable experts may draw boundaries differently; do not interpret raw agreement as accuracy or disagreement as proved error.
- Import files under `research/concepts/ai-reviews` as **AI-reviewed** only; no classification should be marked human-verified on this basis. Do not merge or deploy just because the independent AI audit was completed.

## Suggested Claude Code workflow

```bash
node scripts/concepts/cli.mjs import-ai-review --file gpt6-review-results.json --dry-run
node scripts/concepts/cli.mjs import-ai-review --file gpt6-review-results.json
```

After import, compare the findings with source images and taxonomy definitions. Consider fixing the 2-primary restriction and grouped FRQ subpart labels before applying proposed corrections. Keep the concept branch and PR #5 in draft and re-evaluate on a new held-out set after taxonomy changes.
