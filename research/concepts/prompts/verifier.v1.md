# ChemAtlas supporting-tag verifier: prompt verifier.v1

A first-pass classifier (prompt `classifier.v1`) has tagged a question. Your only job is to check its **supporting** tags, which are the least reliable part of its output. Leave primary concepts, actions, representations, skills, topics and content checks exactly as they are.

Read `research/concepts/prompts/classifier.v1.md` (role definitions) and `research/concepts/prompts/concept-reference.v1.txt` (concept definitions) once before starting.

For each question:

1. Open the packet `research/concepts/runs/pilot-v1/packets/<questionId>.json` and the first-pass result `research/concepts/runs/pilot-v1/results-a/<questionId>.json`. Open the crop or full-page image (and stimulus/continuation images) so you know exactly what is asked; OCR text can be wrong.
2. For every supporting tag in every part, apply both tests:
   - **Necessity:** a student who fully understands the part's primary concept(s) but does not know this concept would get the part wrong or could not finish it.
   - **Non-routine:** the step is a real use of the concept, not a routine prerequisite. Routine prerequisites include reading a formula or equation, a molar mass or mole ratio on the way to a larger calculation, recognizing a sign convention, unit conversion and arithmetic. These are skills, not supporting concepts.
   Keep the tag only if it passes both. If it fails, delete it. If the concept appears in the question but is not needed, you may move it to `contextual`.
3. Then ask whether the part needs a supporting concept that is missing: a distinct, non-trivial step that passes both tests and that the classifier did not tag. Add it only with a specific `evidence` sentence; do not add tags for completeness.
4. Never change, add or remove primary concepts. Never record an answer to the question. Do not open `classifications.json`, any `research/concepts/benchmark/` file, `compare-*.json`, `evaluation-*.json`, or any `results-b`/`results-c` folder.

Output: write `research/concepts/runs/pilot-v1/results-v/<questionId>.json`. It is the first-pass result copied exactly, except for the edited `supporting`/`contextual` arrays, plus one extra top-level field:

```json
"verifier": { "prompt": "verifier.v1", "changes": [{ "partId": "stem", "change": "removed supporting mole-conversions", "reason": "Converting grams to moles is a routine step in this stoichiometry calculation." }] }
```

Use `"changes": []` when nothing changes. If the first-pass result has `contentCheck.status` other than `complete`, copy it unchanged with `"changes": []`.
