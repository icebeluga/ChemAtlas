# GPT-6 independent audit: analysis

Date: 2026-11-14. Input: `research/concepts/ai-reviews/source/gpt6-review-results.json` (all 85 questions) and GPT-6's report `ChemAtlas_GPT6_Independent_Audit.md`, both copied unchanged. Imported as `research/concepts/ai-reviews/gpt-6-pilot-v1.json`, labelled **independent AI review, not human-verified**. `classifications.json`, both Claude reference files and the conventions' decision status were not changed.

## 1. Import

- `import-ai-review --dry-run`: 85 questions, 174 parts, 0 errors, 0 warnings; every concept id, part id, verdict and convention option is valid.
- The two batch files and the Phase-1 snapshots GPT-6's report mentions were not among the files provided (only the combined JSON and the report were in Downloads). The combined file holds everything needed for scoring. Without the snapshots, GPT-6's Phase-1 independence cannot be checked from the files.
- Caveats GPT-6 states itself: some questions had been discussed before, so it is "not a perfectly blind controlled benchmark"; images were read partly from contact sheets. Its report says three judgments were reassessed after comparison; the JSON marks seven (`changedMindAfterComparison`).

## 2. How much the two AI families agree

Precision / recall of the first set of tags, taking the second as the reference (questions matched part by part, printed subparts mapped to catalog parts):

| Compared | Primary | Supporting | Concept present, any role |
| --- | ---: | ---: | ---: |
| Claude pass A vs Claude references (84) | 0.93 / 0.95 | 0.77 / 0.77 | 0.94 / 0.96 |
| Claude pass A vs GPT-6 (85) | 0.81 / 0.82 | 0.49 / 0.38 | 0.84 / 0.78 |
| Claude references vs GPT-6 (84) | 0.84 / 0.84 | 0.53 / 0.40 | 0.87 / 0.80 |
| Claude pass B (Sonnet) vs GPT-6 | 0.74 / 0.76 | 0.37 / 0.50 | 0.70 / 0.80 |

Claude's classifier and Claude's references agree much more with each other than either agrees with GPT-6. Part of the earlier 0.93 / 0.77 was same-family agreement, not accuracy. **On primary concepts the two families agree about 82% of the time; on supporting concepts only about half the time.** Neither model is ground truth, so these are agreement figures, not accuracy.

Per part: 95 of 174 GPT-6 parts match Claude exactly, 56 share the primary concept but differ in supporting tags or roles, and 23 have a different primary concept.

## 3. The 23 primary disagreements, checked against the taxonomy's rules and the source

Each case was judged against the concept definitions' "Tag when" and "Do not tag when" rules (which both models were given) and, where needed, the question itself.

| Outcome | Parts |
| --- | --- |
| **Claude matches the taxonomy rules** (10) | `frq-2003-3-536` (c)(ii) (H-H covers "the ratio needed for a target pH"; but see C4); `mcq-2016-5-1053` (bond-order covers comparing bond strength from multiplicity; bond-enthalpy is ΔH estimation); `mcq-2018-13-1198` (order from a linear 1/[A] plot is integrated-rate-laws, and rate-law excludes it); `mcq-2022-5-1663` (d) (enthalpy-of-reaction covers heat scaling with the amount reacting); `frq-2005-1-6` (c)(ii) (buffer pH calculation is H-H; buffers excludes it); `frq-2008-3-59` (b) (cell-potential includes ΔG° = −nFE°; gibbs-free-energy excludes ΔG–E alone); `frq-2020-sample-2-116` (c) (sign of ΔH against an energy diagram is endo-exothermic); `mcq-2008-44-39` (positive E° and favorability is cell-potential; GPT-6 also changed its mind); `mcq-2014-29-1453` (K3 from K1, K2 is k-manipulation; GPT-6's own finding agrees); `mcq-2023-43-1731` (pka-speciation explicitly includes indicator choice) |
| **GPT-6 is right** (1) | `mcq-2018-38-1920`: adding ΔG° values of reactions is `coupled-reactions` ("tag when free energies of reactions must be added"); `hess-law` is ΔH only. Claude's classifier broke an existing rule; Claude's adjudicator had already agreed with GPT-6. |
| **Claude omitted a needed concept** (2) | `frq-2011-3-933` (c)(ii) and `frq-2011-3-946` (c)(ii) compute ΔS° from ΔG° = ΔH° − TΔS°. entropy's rule covers calculating its value, so `entropy` belongs. Which role is convention C7. |
| **Taxonomy gap** (1) | `frq-2024-5-2125` (b): conductivity of the filtrate. GPT-6's `bonding-types` is wrong (no bond is classified); Claude's `solution-representations` is the nearest existing concept. Needs an electrolyte-conductivity concept. |
| **Legacy reaction prediction** (4) | `frq-2005-4-10` (b), (e), (f), (g): retired "write the equation for each reaction" items. Claude used reaction-types / descriptive-chemistry as primary; GPT-6 used the equation-writing concept. Convention C8. Part (f) (BF3 + NH3 adduct) also needs a Lewis acid–base concept. |
| **Role call, both defensible** (4) | `mcq-2014-15-178` (choose the particle diagram at a titration point: C6), `mcq-2016-24-1063` (limiting reactant vs heat scaling), `mcq-2014-33-185` (reverse-rate graph vs Le Châtelier), `mcq-2024-56-2109` (particle diagrams vs precipitation). The same two concepts are present; only the order differs. |
| **Unresolved** (1) | `frq-2009-5-325` (f)(iii): three different answers (Claude, Claude's reference, GPT-6). Reading the question: the direction comes from ΔG° of reaction Z (reverse of X + Y, −120 kJ, favorable) and the pressure change from 2 mol gas → 1 mol gas, so `gibbs-free-energy` + supporting `ideal-gas-law` fits; GPT-6's `reaction-quotient` is not used (no Q is computed). For a teacher. |

A pattern explains most of the disagreements: **GPT-6 tags the quantity a part asks for (ΔG, a rate law, bond enthalpy); the taxonomy defines concepts by the relationship used.** Under the current rules Claude is usually right, but the rules themselves are a design choice, so this is now convention C7.

## 4. Supporting tags and roles

- **Removals both families support.** GPT-6 dropped three supporting tags that Claude's own verifier had already removed or demoted: `mole-conversions` in a ΔH calculation (`frq-2011-3-933` b), `rate-law` when k comes from a half-life (`frq-2017-3-1157` d-ii), and `strong-weak-acids` when the stem says the acid is weak (`mcq-2022-52-1652`). GPT-6 also drops `collision-model` where activation energy is named (C2). These are the classifier's main supporting-tag weakness: routine steps tagged despite the prompt's rule.
- **Additions that break existing rules.** Several GPT-6 additions are excluded by the taxonomy: `reaction-stoichiometry` inside a titration calculation (`frq-2020-sample-2-116` f), `enthalpy-of-reaction` next to a bond-enthalpy estimate (`frq-2009-5-325` d, `mcq-2014-24-1450`), `heat-transfer` with `calorimetry` (`mcq-2014-9-174`), `molecular-geometry` with `bond-angles` (`mcq-2016-27-1064`), and `activation-energy` next to `catalysis`, whose definition already includes the lower-barrier pathway.
- **Inconsistency on C0.** GPT-6 handles three similar boiling-point/IMF questions three different ways (`mcq-2002-67-765`, `mcq-2022-21-1622`, `frq-2008-6-65` b), which is itself evidence the convention is needed.
- **Exclude-rule check.** Both models produce tag pairs that one concept's "Do not tag when… (tag X)" text points away from: 15 of 168 Claude parts, 21 of 174 GPT-6 parts, 13 of 172 Claude-reference parts. Not every flagged pair is wrong (some parts use both steps), but several are real errors on each side. Validation now raises a warning and an `exclude-rule-check` flag for these (section 7).

## 5. Conventions

GPT-6's recommendations are stored in `conventions.json` as `aiRecommendations` (advice only; every convention stays `undecided`) and shown in the review sheet.

| Convention | Claude's suggestion | GPT-6 | Assessment |
| --- | --- | --- | --- |
| C0 specific IMF role | A (imf-properties primary, specific force supporting) | Other: A for property comparisons; specific force primary when the question asks which attraction is broken | GPT-6's refinement is chemically sound: "which forces are overcome when water boils" assesses identifying the force. Recommend A with that exception. |
| C1 shape vs polarity | C when both asked | C, and allow a third primary when Lewis structure, shape and polarity are all requested | Agree. Validation already accepts three primaries (flags `many-primary` for review); only the prompt's "never more than two" needs changing for FRQ parts with three separate deliverables. |
| C2 collision vs Ea | C | Other: collision-model for qualitative "why faster" explanations; activation-energy primary when Ea is what is asked for | Same rule as Claude's C, stated more precisely. Claude's adjudicator agrees on `mcq-2008-11-31`. |
| C3 phase change vs endo/exo | A | A | Agree. |
| C4 pKa speciation vs H-H | A | A ("non-obvious ratio" for H-H) | Agree, but note the interaction: with GPT-6's wording, `frq-2003-3-536` (c)(ii) (pH = pKa, so equal amounts) becomes pka-speciation, contradicting the current H-H definition. The definition must be edited together with the decision. |
| C5 strong/weak as supporting | B | B | Agree; Claude's verifier made the same call. |
| C6 particle diagram | B | B (tag it when choosing or judging a particle depiction is the task) | Agree. Under this rule `mcq-2014-15-178` keeps solution-representations; its role is still open. |
| **C7** requested quantity vs relationship (new) | A | (implicitly B) | New; see section 3. |
| **C8** legacy reaction prediction (new) | A | (implicitly B) | New; see section 3. |

Two independent model families now point the same way on C2–C6. That makes them strong candidates, but they remain the owner's (ideally a teacher's) decision.

## 6. Source-page corrections

GPT-6 confirmed all eight supplements, each with a page-specific note (for example "bank-07 p295 prints Question 33 about evidence for first-order C2H5Cl decomposition"). They have now been checked twice, by Claude (rendered pages and PDF text) and by GPT-6, and the checks are recorded as `alsoCheckedBy` (content hashes unchanged). Still not human-confirmed. Recommendation: apply the proposed catalog corrections (repoint `mcq-2024-21` to page 2089 and `mcq-2024-33` to page 2095, re-type `mcq-2022-62` and `mcq-2023-67` as FRQs, register the 2018 Q35–38 and 2014 practice Q29–33 stimuli) as a separate, owner-approved catalog change, not inside this branch.

New catalog issues from the audit, added to `catalog-issues.json`: `mcq-2002-38-614`'s OCR interleaves two page columns (confirmed from the catalog text); `frq-2005-7-13` and `frq-2011-3-946` group printed subparts. While checking, Claude also found that `mcq-2008-44-39`'s catalog text is a one-line paraphrase, not the printed question.

## 7. Proposed improvements (in priority order)

Changes are proposals unless marked done. None changes stored classifications.

**Taxonomy.** Items 1–4 are now drafted as taxonomy 1.1 (`research/concepts/taxonomy-1.1-changes.md`; not active). Item 5 and the convention text (item 6) wait for the owner.
1. `hess-law` exclude: add "Do not tag addition of ΔG° values (tag coupled-reactions)". `coupled-reactions` include: "including combining ΔG° of reactions because G is a state function, even without an unfavorable step". (Both families; the rule existed but was missed.)
2. `entropy` include: "including solving ΔG° = ΔH° − TΔS° for ΔS°" (role per C7).
3. New `electrolyte-conductivity` concept (strong, weak and non-electrolytes; conductivity from mobile ions; CED 3.x/2.x). Reported by Claude in round 1 and by GPT-6.
4. New beyond-AP concepts: `lewis-acid-base` (adducts, coordinate covalent bonds), `phase-diagrams`. Both reported by both families. Extend `hybridization`'s exclude text with "sp3d/sp3d2 hybridization is beyond the current course" so legacy parts are flagged.
5. New `vapor-pressure` concept (or extend `imf-properties` to cover vapor pressure explicitly). Raised by Claude's classifiers in round 2.
6. Write each decided convention into the named concepts' include/exclude text; rebuilding the taxonomy makes the affected records stale automatically.

**Classifier**
1. Done: validation now warns and flags `exclude-rule-check` when a part pairs two concepts that one concept's exclude rule separates. The flag shows in the review sheet; it never rejects a result.
2. Prompt v3 (to draft after conventions are decided): state the decided conventions; allow a third primary only for FRQ parts with three separately requested deliverables; list the routine steps that keep being tagged (mole conversion inside a larger calculation, stoichiometry inside a titration, a rate law that is given, an acid's strength when the stem states it).
3. Student search: until a human has reviewed them, use primary tags, plus supporting tags only where two independent model families agree. Supporting tags on their own agree across families only about half the time.
4. Re-measure on a fresh held-out set after taxonomy 1.1, since the current 85 questions have now shaped the rules.

## 8. What needs a human

- Decide the nine conventions (review sheet panel; GPT-6's and Claude's suggestions are shown).
- Spot-check the cases where the two AI families disagree on the primary concept (section 3). These are the best use of limited teacher time.
- Approve the catalog corrections as a separate change.
