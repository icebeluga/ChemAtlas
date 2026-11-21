# Student concept search: integration plan

Status: **planned, not wired into the UI.** The retrieval layer exists and is tested (`lib/concepts/search.mjs`, `tests/concept-pipeline.test.mjs`). The UI is not wired yet because there are no human-verified associations to show, and showing unverified machine tags to students is out of bounds.

## Data the app would load

`node scripts/concepts/cli.mjs export-index` writes `research/concepts/concept-index.json`, built only from `human_verified` records whose content hash and concept hashes are still current. To ship it, copy it to `public/concept-index.json` as a deliberate, reviewed release step (it is a static asset like `student-questions.json`). The file contains:

- `concepts[id]`: name, group, official topics, scope, `questionIds`. The counts are the lengths of these lists, computed from stored associations, never hardcoded.
- `questions[id]`: type, review status, topics, units, primary and supporting concept ids, and per-FRQ-part concept lists.

Contextual tags are never included. Provisional (machine) output is only exported with `--provisional`, into a different file, for internal testing.

## Behaviour

- **Browse:** unit → topic → concept → questions. `conceptsForTopic(index, topicId)` lists the concepts relevant to a topic, with the count inside that topic and the cross-topic total.
- **Cross-topic search:** "all questions testing formal charge" = `searchQuestions(index, { concepts: ["formal-charge"] })`, regardless of the question's topic.
- **Several concepts:** `mode: "any"` (OR, the default: questions testing at least one selected concept) or `mode: "all"` (AND: questions testing every selected concept). The UI should label this as "Match any / Match all".
- **Role filter:** `role: "primary"` restricts matches to questions whose main focus is the concept; the default matches primary or supporting.
- **Combines with existing filters:** `unit`, `topic`, `type` (`MCQ`/`FRQ`/`Mixed`) use the same values as the current Question Bank selects. Free-text search and the existing review/legacy handling stay as they are.
- **FRQ parts:** results can show which part tests the concept (e.g. "FRQ 3 (b)(ii)").
- **Verified vs provisional:** only verified records are in the student index. If the owner later decides to show provisional tags, they must be visually marked and come from a separately exported file.

## Minimal UI change when data exists (in `components/student-app.tsx`)

1. Fetch `/concept-index.json` next to `/student-questions.json`; if it is missing or empty, hide the concept control (current behaviour unchanged).
2. Add a CONCEPT multi-select to the existing `library-filters` row, options from `conceptsForTopic` for the selected topic (all concepts when topic is "all"), each with its count; a Match any/all toggle when two or more are chosen.
3. In `filteredQuestions`, intersect with `searchQuestions(...)` ids when concepts are selected.
4. Show concept chips on result rows from `index.questions[id].primary`.
5. Add the concept id to the URL state used by `parseChemAtlasLocation` / `buildChemAtlasUrl` so links and Back work.

This keeps the existing styling and layout. Run `pnpm check`, `pnpm test` and the browser checks in `docs/stage-3/README.md` before any release, and follow the release handoff in `docs/stage-5/README.md`.
