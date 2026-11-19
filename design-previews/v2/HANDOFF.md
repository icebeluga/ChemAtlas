# Handoff: ChemAtlas redesign, Session 1 (design and prototyping)

Last updated 2026-11-15. Read `DESIGN.md` next to this file for the design itself.

## State

Session 1 is complete. **The owner approved the v2 design on 2026-11-15** as the basis for Session 2 (production architecture and integration). The open decisions in `DESIGN.md` section 8 and the base branch are still unanswered. **No production code was changed. Nothing was committed, pushed or deployed.**

The three subagent types in `.claude/agents/` loaded after a session restart and are now available.

- Branch at the time: `audit/source-security-catalog-integrity`, commit `bc38bd4e727f0f45f85c2c3577c22731e287c500`. That branch belongs to other work; its uncommitted files were not touched.
- Other worktree: `../ChemAtlas-extraction` (`feature/question-image-extraction`), not touched.
- **Approved base (owner, 2026-11-15): `origin/main` at `4f965e32ffaa3b6bce8ab6f99b22fe42643fce16`.** Its app code is identical to the recorded verified release `3c78883006beb48c2dab68443e6e93b87bb9a769`.
- **Redesign branch: `feature/student-ui-redesign`, worktree `../ChemAtlas-redesign`,** created from that SHA. `design-previews/` is committed there (local commit only, not pushed); that copy is the canonical one. The copy in the original checkout is what the preview server on port 5191 serves.
- `design-previews/` is listed in the shared `.git/info/exclude` so it cannot land in other branches by accident. New files under it need `git add -f` on the redesign branch.
- Still local-only and untracked: `vite.design.local.config.ts`, `.claude/launch.json`, `.claude/agents/`.
- The owner's approval covers the baseline and preserving this work. It does not cover production implementation, merging, pushing or deployment. Session 2 (architecture) has not been authorized yet.
- `fix/local-workers-runtime` (local only, 2 commits ahead of the base) changes `components/student-app.tsx` and `app/globals.css`. It must be inspected and documented in Session 2, not discarded or overwritten.

## Files

| Path | What |
|---|---|
| `design-previews/index.html`, `atlas.html`, `workbench.html`, `proof.html`, `shared.js`, `screenshots/` | The original three directions and their write-up. Unchanged since Session 0. |
| `design-previews/serve.mjs` | Read-only static server, port 5191. Serves only `design-previews/`, `public/` and pdf.js. |
| `design-previews/v2/index.html` | Question Bank prototype |
| `design-previews/v2/builder.html` | Practice Builder prototype |
| `design-previews/v2/app.css` | Design tokens and shared components |
| `design-previews/v2/app.js` | Catalog loading, question rendering, worksheet store, list animation |
| `design-previews/v2/check.mjs` | Headless-Chrome interaction checks and screenshots |
| `design-previews/v2/screenshots/` | 13 screenshots: desktop 1440, tablet 768, phone 390 |
| `design-previews/v2/DESIGN.md` | Specification, rationale, engineering notes, approval checklist |
| `.claude/agents/*.md` | Three subagent definitions (see below) |

## Run it

```
node design-previews/serve.mjs
```

Then open `http://127.0.0.1:5191/design-previews/v2/index.html`. In Claude Code the same server is the `design-previews` launch configuration.

To re-run the checks and regenerate screenshots (needs Chrome at the default Windows path, or set `CHROME`):

```
node design-previews/v2/check.mjs
```

## What was tested

By `check.mjs`, in headless Chrome, last run clean (no console errors, exceptions or failed requests):

- Catalog loads (735 questions, 9 units); unit then topic selection; counts match
- Add from the list, select a row, printed question draws
- Keyboard: arrow down, `A`, `F` (full page), `/` (search focus)
- Search narrows, empty state appears, Clear filters restores
- Print-ready filter with year; a shared-stimulus question draws with its shared block; a typeset question draws
- Worksheet survives reload and the move to Practice Builder and back
- Builder: receives the list, reorder, remove, undo, group by type, title, export dialog, PDF button disabled
- No horizontal overflow at 1440, 768 and 390; phone question view opens with the worksheet strip still visible

Looked at by eye: bank and builder at desktop, bank at tablet, bank list and question at phone.

Not tested: real touch dragging, screen readers, measured colour contrast, Safari and Firefox, the browser print output, builder tablet and phone screenshots by eye, performance on a real phone.

## Known limitations

- Worksheet is one list in its own `localStorage` key; not connected to the app's drafts.
- PDF generation is not connected; the paper is an approximate layout with no page breaks.
- Drag reordering is desktop only; arrows and `Alt`+arrows work everywhere.
- Fonts load from Google Fonts (needs network).
- 89% of questions are "Needs review" and would export as full source pages. That is the data, shown as it is.
- The local Worker dev server answers 503 without Cloudflare Access settings. That gate was left alone; `vite.design.local.config.ts` runs the existing UI without the Worker for comparison only.

## Subagents

`.claude/agents/` defines `frontend-implementer` (sonnet), `repository-researcher` (haiku), `verification-assistant` (sonnet). They were written mid-session and Claude Code only loads agent types at session start, so **they become available in the next session**. In this session the built-in agent with an explicit model override was probed and answered as Sonnet 5.5 and Haiku 5.5. Each agent start cost about 53k tokens before doing any work, so delegation pays off only for sizeable tasks. Session 1's verification was done with `check.mjs` instead, which costs no model usage.

## Next steps (Session 2, after approval)

1. Done: base approved and branch created (see State).
2. Decide the open items in the `DESIGN.md` approval checklist.
3. Done: design-previews/ committed on the redesign branch (local only).
4. Production plan: tokens and fonts, component split of `student-app.tsx`, course band, list and pane, worksheet strip on the existing drafts, Practice Builder on the existing PDF pipeline.
