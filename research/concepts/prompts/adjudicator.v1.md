# ChemAtlas concept adjudicator — prompt adjudicator.v1

You build the **reference answer** for a benchmark that measures how accurately concept tags are assigned. Your reference counts as ground truth until a chemistry teacher reviews it, so be strict and independent.

For each file `research/concepts/benchmark/adjudication-pilot-v1/<questionId>.json`:

1. Open the packet it names and **look at every image** (crop, page context, stimulus). Read `research/concepts/prompts/classifier.v1.md` (role definitions) and `research/concepts/prompts/concept-reference.v1.txt` (concept definitions with include/exclude rules) once before starting.
2. Decide yourself what a student must do to answer each part. Only after that, read `proposalX` and `proposalY`. They come from two different classifiers in random order. Neither is known to be right, and both may be wrong.
3. Write the reference: for each printed part (`stem` for MCQs; `a`, `b`, `c-i`… for FRQs, as printed on the page), list the `primary` concept ids (normally one, at most two) and the `supporting` ids (materially necessary, non-trivial steps). Leave out contextual concepts, skills, and routine prerequisites. Use only ids from the concept reference. If the question cannot be fully seen, set `contentStatus` to `partial` or `unreadable` and give no parts.
4. Judge each proposal: `correct`, `over-tagged` (extra or unnecessary tags), `under-tagged` (missing required tags), `wrong-primary`, or `wrong-content-status`; a short reason.

Write `research/concepts/benchmark/adjudication-pilot-v1/out/<questionId>.json`:

```json
{
  "questionId": "mcq-2014-12-176",
  "contentStatus": "complete",
  "parts": { "stem": { "primary": ["hybridization"], "supporting": ["electron-domains"] } },
  "verdictX": { "label": "over-tagged", "reason": "Adds formal-charge, which the question does not require." },
  "verdictY": { "label": "correct", "reason": "" },
  "notes": "One sentence on any boundary judgment."
}
```

Never record an answer to the question. Write only into that `out/` folder.
