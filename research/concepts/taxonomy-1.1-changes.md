# Taxonomy 1.1 (draft): change log

Status: **draft, not active.** Source `concepts.v1.1.draft.source.json`, built to `taxonomy.v1.1.draft.json` (hash `d4073d133876a5e5`, 113 concepts). The pipeline still uses taxonomy 1.0.0 (`taxonomy.v1.json`); nothing has been re-classified and no record is stale.

Scope: only changes supported by **both** independent AI reviews (Claude's classifiers/adjudicators and GPT-6) **and** by the chemistry. The open conventions C0–C8 are deliberately not encoded; they need the owner's (ideally a teacher's) decision first. Evidence: `docs/concept-classification/gpt6-audit-analysis.md`.

## Edited concepts (6)

| Concept | Change | Why |
| --- | --- | --- |
| `hess-law` | Exclude: "Do not tag combining ΔG° values of reactions (tag coupled-reactions)." | `mcq-2018-38-1920` adds ΔG° values; Claude's classifier tagged hess-law although its definition is ΔH only. GPT-6 and Claude's adjudicator both chose coupled-reactions. |
| `coupled-reactions` | Definition and include now cover reversing, scaling and adding ΔG° of reactions (G is a state function), not only driving an unfavorable step. | Same case; without this, a plain "find overall ΔG° from three reactions" question fits neither concept cleanly. |
| `entropy` | Include: "…or by solving ΔG° = ΔH° − TΔS° for ΔS°". | `frq-2011-3-933` (c)(ii) and `frq-2011-3-946` (c)(ii) ask for ΔS°; Claude omitted entropy, GPT-6 tagged it. The role (primary or supporting) is convention C7 and is left open. |
| `hybridization` | Exclude points sp3d/sp3d2 in legacy items to the new `d-orbital-hybridization`. | `frq-2008-5-63` (XeF4); the old text said d-orbital hybridization is "not assessed", yet both reviewers still tagged hybridization because no marker existed. |
| `solution-representations` | Exclude: conductivity reasoning without a particle representation goes to `electrolyte-conductivity`. | Boundary for the new concept. |
| `descriptive-chemistry` | Exclude: Lewis acid–base adducts go to `lewis-acid-base`. | Boundary for the new concept. |

## New concepts (4)

| Concept | Scope | Why |
| --- | --- | --- |
| `electrolyte-conductivity` (topic 3.7; related 3.8, 2.3) | current AP | `frq-2024-5-2125` (b) asks why the filtrate conducts; GPT-6 had to use bonding-types (wrong) and Claude solution-representations (a particle-diagram concept). Reported by Claude's classifiers in round 1 and by GPT-6. Topic placement: see below. |
| `lewis-acid-base` | beyond AP | BF3 + NH3 adduct (`frq-2005-4-10` (f), also `mcq-2017-30-1137`). Reported by both. |
| `phase-diagrams` | beyond AP | `mcq-2002-6-606` and legacy items; reported by both. |
| `d-orbital-hybridization` | beyond AP | Legacy sp3d/sp3d2 (`frq-2008-5-63` (e)(ii)); both reviewers asked for a scope marker. |

**Topic placement of `electrolyte-conductivity` (revised).** The first draft put it under 3.8. A check of the College Board CED (by GPT-6, at the owner's request) found that 3.8 is specifically about particulate representations of solutions, and no CED topic is about conductivity as such. The draft now uses **3.7 (solutions and mixtures) as the closest organizational association**, with 3.8 related when particle diagrams are involved and 2.3 related for molten versus solid ionic compounds. This is a **ChemAtlas classification decision, not an explicit College Board learning objective**; the concept's `topicNote` field says so.

Beyond-AP concepts have no current CED topic and set the record flag `beyond-ap-content`, so legacy items stay searchable without being presented as current exam content.

## Considered and left out

- **Vapor pressure** (raised only by Claude's classifiers): not in this draft; decide whether to add a concept or extend `imf-properties`.
- **Conventions C0–C8**: encode after they are decided, as include/exclude text on the concepts each one names.
- **Three primary concepts for FRQ parts with three separate deliverables** (C1): a prompt and convention change, not a taxonomy change. Validation already accepts three primaries with a review flag.

## Impact if adopted

17 of the 92 stored records reference a changed concept and would become stale (`build-taxonomy --source … --out …` lists them). They would need re-classification; the other 75 stay current.

## How to adopt (owner decision)

1. Review this file and the draft source; adjust wording or the conductivity topic as needed.
2. Copy the draft source over `concepts.v1.source.json` with `"taxonomyVersion": "1.1.0"` and `"status"` set as for 1.0.0, then run `node scripts/concepts/cli.mjs build-taxonomy` (rewrites `taxonomy.v1.json` and the concept graph).
3. `node scripts/concepts/cli.mjs status` lists the stale records; re-classify them (`prepare --ids …`, two passes, `ingest`, `compare`) and re-run the evaluations.
4. Update `concept-reference.v1.txt` / the classifier prompt so classifiers see the new concepts.
