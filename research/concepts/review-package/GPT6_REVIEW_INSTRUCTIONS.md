# Independent review of ChemAtlas concept classifications

You are reviewing how AP Chemistry exam questions have been tagged with chemistry concepts. ChemAtlas is a study site; the tags will let students search for practice questions by concept (for example "questions that use Hess's law"). The tags were produced by Claude (Anthropic) models. **Your review must be independent:** classify every question yourself from the original source images first, and only then compare with Claude's tags.

The ChemAtlas owner is still learning AP Chemistry and cannot check advanced chemistry personally, so your judgment matters. Be strict, explain your reasoning briefly, and say when you are unsure. Your results will be recorded as an **independent AI review**, not as human verification.

## 1. What is in the package

| Path | Contents |
| --- | --- |
| `manifest.json` | Every question: set, type, parts, image files, completeness flags, and the paths below. Start here. |
| `questions/<id>/question.md` | Phase 1 material: parts to classify, cautions, image list, OCR text. **Contains no Claude tags.** |
| `images/crops/` | The question as the student sees it (cropped from the PDF page). |
| `images/pages/` | Full source pages (one file per page, shared by questions on the same page). |
| `images/stimuli/` | Shared stimuli (data, graphs, setups) used by a group of questions. |
| `taxonomy/CONCEPTS.md`, `taxonomy/concepts.json` | The 109 concepts: definitions, when to tag, when not to tag, examples, CED topics. **The only valid tags.** |
| `conventions/CONVENTIONS.md` | Seven unresolved boundary conventions. |
| `corrections/CORRECTIONS.md` | Eight source-page and shared-stimulus corrections Claude proposed, plus other catalog issues. |
| `claude/classifications/<id>.json` | Phase 2 only: Claude's tags with evidence for each question. |
| `claude/model-references.json` | Phase 2 only: the reference answers Claude's adjudicator models built (also not human-verified). |
| `review-output/` | `gpt6-review-results.template.json` (pre-filled skeleton, one entry per question and part), `review-results.schema.json`. |

Question sets: `benchmark` (40 questions; Claude's adjudicator saw two Claude proposals when building its reference) and `holdout` (45 questions; Claude's adjudicator classified them blind). Review the benchmark first; the holdout set is equally valuable if you have capacity.

## 2. Ground rules

- **The images are authoritative.** The OCR text loses subscripts, superscripts, charges, reaction arrows, structures and graphs, and sometimes includes neighbouring questions. Use it only to search.
- **Never invent missing information.** If a question cannot be fully seen (cut off, missing page, unreadable diagram, missing stimulus), set `contentStatus` to `partial` or `unreadable`. If it is visible but genuinely ambiguous (unclear wording, more than one defensible reading), use `ambiguous`. Explain in `contentIssues` and give tags only when the question is `complete`.
- Read every caution in `question.md`. When the crop is defective, the full page usually shows the whole question; classify the question number named in the id only.
- You may solve a question privately to see what it requires. **Do not record answers** anywhere in your output.
- Use only concept ids from `taxonomy/concepts.json`. If the right concept does not exist, use the closest one, and report the gap in `taxonomyIssues`.
- Do not open anything under `claude/` until you have recorded your independent classification of a question (section 3). If you work in batches, finish Phase 1 for the whole batch, save it, then do Phase 2 for that batch.

## 3. Phase 1: classify each question independently

For each question (in `manifest.json` order):

1. Open `questions/<id>/question.md` and every image it lists, including the full page and any stimulus.
2. Decide whether you can see the complete question: full stem, every answer choice (MCQ), every diagram, table, graph and equation it depends on, and any shared stimulus. Record `contentStatus`.
3. Work out what a student must actually do for each part: the operation (calculate, explain, compare…), the chemical relationship needed, and for an MCQ what separates the correct choice from plausible distractors.
4. Assign concepts per part:
   - **Primary**: the concept(s) the part is designed to assess. Normally one. Use two only when the part assesses both equally (for example, it asks for two separate things). Never more than two.
   - **Supporting**: another concept that is a **materially necessary, non-trivial** step. Apply both tests:
     - *Necessity*: a student who fully understands the primary concept but not this one would get the part wrong or could not finish it.
     - *Non-routine*: it is a real use of the concept, not a routine prerequisite. Routine steps include reading a formula or equation, a molar mass or mole ratio on the way to a larger calculation, recognizing a sign convention, unit conversion and arithmetic.
   - **Contextual** (optional, use sparingly): a concept that appears in the question but is not needed to answer it.
   - Decide from what solving requires, not from keywords. A concept can be tested without being named; a named concept may be only background.
   - Respect each concept's "Tag when" and "Do not tag when" rules in `CONCEPTS.md`.
   - Skills (arithmetic, unit conversion, graph reading, experimental design) are not concepts; do not tag them.
   - Content outside the current AP course (colligative properties, nuclear equations, organic naming, complex ions) uses the concepts marked "beyond the current AP course".
5. FRQs: classify every part listed. You may split a part into its printed subparts (`b` → `b-i`, `b-ii`) when the subparts assess different concepts, and you should classify range parts (`a–c`, `d-onward`, `remaining-visible-parts`) by their printed letters (`a`, `b`, `c`). Use lowercase ids joined by hyphens, matching the printed labels.
6. Write one or two sentences of `rationale` per part saying why each primary and supporting tag is required.
7. Set `confidence` to `high`, `medium` or `low` for the question.

## 4. Phase 2: compare with Claude

Open `claude/classifications/<id>.json`. Compare part by part and record:

- `comparison.verdict`: `agree` (same primary and supporting tags), `minor-differences` (same primary; a supporting difference you consider defensible either way), `over-tagged`, `under-tagged`, `wrong-primary`, `wrong-role` (right concepts, roles swapped) or `wrong-content-status` (Claude classified a question that cannot be fully seen, or the reverse).
- `comparison.findings`: one entry per difference you consider an error:
  - `missing`: Claude omitted a concept the part requires (give the role it should have).
  - `incorrect`: Claude used a concept that is wrong for this part.
  - `unnecessary`: the concept is related but not required (routine step or background); it should be dropped or contextual.
  - `wrong-role`: the concept belongs, but as primary instead of supporting or the reverse.
  Each finding gives `partId`, `conceptId`, `issue`, `claudeRole`, `proposedRole` (or `none`), and a short `explanation`. Judge Claude's evidence sentences too: say so if a sentence describes a step the question does not require.
- **Do not change your Phase 1 tags after reading Claude's.** If Claude convinces you that you were wrong, keep your Phase 1 tags and set `changedMindAfterComparison: true` with an explanation in `notes`. That way your independent judgment stays measurable.

You may also look at `claude/model-references.json`, but treat it as another Claude opinion, not as an answer key.

## 5. The seven conventions

`conventions/CONVENTIONS.md` lists boundary cases where Claude's models disagreed (for example, when a part asks for shape and polarity, which is primary?). For each, after Phase 1:

1. Look at the affected questions and decide which option gives correct, consistent tags.
2. Prefer options that (a) match how the AP Chemistry Course and Exam Description organizes the content, (b) can be applied reproducibly from visible features of a question, and (c) keep tags useful for student search (a tag that applies to nearly every question in a unit helps nobody).
3. Record `recommendation` (an option letter, or `other` with your proposed rule in `proposedRule`), a `rationale`, and `confidence`.

Your recommendation is advice. The owner decides; conventions are never decided by import.

## 6. Corrections and catalog issues

For each entry in `corrections/CORRECTIONS.md`, check whether the supplied page really contains the missing content for that question, and record a `correctionChecks` entry (`confirmed`, `rejected` or `unsure`, with a note). Report any other problems you notice (wrong year or question number, crop showing the wrong question, a missing page) in `catalogIssues`, and problems with the package itself (missing or unreadable image) in `packageIssues`.

## 7. Output

Fill in `review-output/gpt6-review-results.template.json` and return it as **`gpt6-review-results.json`** (UTF-8 JSON, valid against `review-results.schema.json`). If you work in batches, return one file per batch (`gpt6-review-results-batch-01.json`, …), each with the same top-level fields and only that batch's questions.

```json
{
  "format": "chematlas-ai-review/v1",
  "reviewer": { "model": "GPT-6", "interface": "ChatGPT", "notes": "" },
  "reviewedAt": "2026-11-15T12:00:00Z",
  "questions": [
    {
      "questionId": "example-frq-1",
      "contentStatus": "complete",
      "contentIssues": [],
      "independent": {
        "parts": {
          "a": { "primary": ["hybridization"], "supporting": ["electron-domains"], "contextual": [], "rationale": "Asks for the hybridization of the central atom; the student must count electron domains (a double bond counts once) to get it." },
          "b": { "primary": ["molecular-polarity"], "supporting": ["molecular-geometry"], "contextual": [], "rationale": "Asks whether the molecule is polar; requires the shape to decide whether bond dipoles cancel." }
        }
      },
      "confidence": "high",
      "comparison": {
        "verdict": "wrong-role",
        "findings": [
          { "partId": "b", "conceptId": "molecular-geometry", "issue": "wrong-role", "claudeRole": "primary", "proposedRole": "supporting", "explanation": "The part asks only about polarity; the shape is a step toward it." }
        ]
      },
      "changedMindAfterComparison": false,
      "notes": ""
    }
  ],
  "conventions": [
    { "id": "C1-shape-vs-polarity", "recommendation": "C", "proposedRule": "", "rationale": "…", "confidence": "medium" }
  ],
  "correctionChecks": [ { "questionId": "mcq-2024-33-2094", "result": "confirmed", "note": "Page shows printed Question 33." } ],
  "taxonomyIssues": [ { "kind": "missing-concept", "detail": "No concept covers vapor pressure.", "questionIds": [] } ],
  "catalogIssues": [],
  "packageIssues": []
}
```

(The example question above is invented to show the format; it is not in the package.)

Field rules: `contentStatus` complete | partial | unreadable | ambiguous; `confidence` high | medium | low; `issue` missing | incorrect | unnecessary | wrong-role; roles primary | supporting | contextual | none. Leave `independent.parts` empty and skip `comparison` for questions that are not `complete`. Every question in the manifest should appear once; if you skip one, leave it out and say why in `packageIssues`.

## 8. What happens next (for Claude Code)

The owner saves your file(s) into the ChemAtlas repository and Claude Code runs:

```bash
node scripts/concepts/cli.mjs import-ai-review --file gpt6-review-results.json --dry-run   # validate only
node scripts/concepts/cli.mjs import-ai-review --file gpt6-review-results.json             # or a comma-separated list of batch files
node scripts/concepts/cli.mjs evaluate --pass a --reference research/concepts/ai-reviews/gpt-6-pilot-v1.json --tag gpt6
```

The import validates every concept id, part id and field, then writes `research/concepts/ai-reviews/gpt-6-pilot-v1.json`, labelled "independent AI review; NOT human-verified". It does not change Claude's stored classifications, does not mark anything human-verified, and does not decide conventions. Claude then measures its accuracy against your independent tags, studies your findings and convention advice, and proposes changes to the concept definitions and prompts for the owner to approve.
