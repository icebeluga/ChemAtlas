# ChemAtlas Stage 3 handoff

This candidate combines the Cloudflare student foundation with the restored flat Question Bank, a Sites-style course directory and unit/topic views, and a separate multi-draft Practice Builder. The existing session setup still opens at `/?view=builder`. Question and session deep links and browser progress use the existing URL and storage contracts. Question Bank selections add to the active worksheet draft. The prior browser-local flat selection is migrated on first use.

## Checkpoints and builds

| Artifact | Git pin or digest |
| --- | --- |
| Stage 2 audit | `42d31dafe1f4b94a0b86d2d1f6a346f7ea18be43` |
| Cloudflare baseline and rollback source | `63fd7e4b5287d74f66227742e8b2a4f47e37920f` |
| Exact two-file Question Bank restoration | `dde51f0eea012e09cd24d780649485b0639e2cf6` |
| Sites reference archive | `6f4a568382eef820418a9f84fe97bd5cbd21d721` |
| Previous integrated source | `cb3fcca3782778b07e948e4be9468e2b55dcd65b` |
| Release workflow reference | `25c4528307776533575f8f07993e35a851798156` |
| Baseline package Git blob | `d6584e06fa65ced7e27eef8c3b3c7e5729af1998` |
| Baseline pnpm lock Git blob | `c21859cd598d1cb9e225c81cc5048dcb3259416d` |
| Candidate pnpm lock Git blob | `2194ac07a9a90509c95a3e551dc4eb31b899b3d4` |
| Active student catalog Git blob | `3eef99956b037611afc9b5a60a056f1cbbb311b0` |
| Separate catalog candidate SHA-256 | `68ae75c6005854eb13a8203fdaa54417bea598bebeb1495dfef02a788de14b8d` |
| Migration ledger SHA-256 | `69c509eb8f413ea259d38becd14fe28fc4619bf125ea71e799ab68633982c6b3` |

Dependencies use Node 24.22.1 and pnpm 11.25.0 for the recorded checks. The fresh frozen dependency install ran in an alternate modules directory and the resulting dependency tree also passed typecheck, build and Node tests. The pinned build uses React 19.2.6, Vinext 1.0.0-beta.5, Vite 8.0.13, Wrangler 4.140.0, PDF.js 6.4.299 and pdf-lib 1.17.1. Python checks used PyMuPDF 1.26.6 and Tesseract 5.5.0.

```sh
git clone --branch integration/chematlas-stage3-unified https://github.com/icebeluga/ChemAtlas.git
cd ChemAtlas
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm test
python -m pip install PyMuPDF==1.26.6
python -m unittest discover -s tests -p 'test_*.py'
pnpm build
pnpm check:private --built
pnpm exec wrangler deploy --dry-run --config dist/server/wrangler.json
```

The exact application commit used for the handoff is recorded in the release manifest. The eight bundled PDF Git hashes, in filename order, are recorded in [release-manifest.json](release-manifest.json). The built artifact is under `dist/server` and `dist/client`. Preserve the original audited archive and the existing production release workflow pin.

## Verification

| Check | Result |
| --- | --- |
| Baseline build, TypeScript, Node, Python, private assertions | Passed. 35 Node tests and 51 Python tests. |
| Candidate TypeScript, build, Node, Python, source and built private assertions | Passed. 40 Node tests and 51 Python tests. |
| Dependency lock | Frozen installation and pnpm lockfile supply-chain validation passed. |
| Wrangler packaging | Dry run passed. The generated student config exposes the ASSETS binding. |
| Local Worker authentication | An isolated signed fixture served the app, JavaScript, CSS, catalog, PDF worker and source PDF. Anonymous versions returned 403. Admin and review backup routes returned 404. Automated tests cover signed token validation and rejection cases. |
| Chromium | 1440×900 and 390×844. Browse, unit/topic navigation, filtered Question Bank and empty results, FRQ detail canvas, browser Back and reload, worksheet selection persistence, creation and switching of drafts, format, PDF download, practice response and self-check. Legacy selection migration, reordering, duplication, backup download/import and keyboard-operated unit navigation were also checked at 1440×900, 390×844, 768×1024 and 320×700. |
| Worksheet composition | Actual reviewed 2008 Q1–3 and single-member export fixtures. Synthetic fallback verified one shared source page and ordered multi-page FRQ fallback. The downloaded browser FRQ PDF contains the complete four-part prompt and no answer key. |

[Desktop comparison](screens/desktop-comparison.jpg) · [Mobile comparison](screens/mobile-comparison.jpg) · [Baseline desktop](screens/baseline-desktop.jpg) · [Baseline mobile](screens/baseline-mobile.jpg) · [Rendered worksheet](screens/worksheet-preview.jpg) · [Tablet and narrow checks](screens/compact-checks.jpg)

The Sites comparison uses the archived 1,651 records and default Bank filters. The candidate captures the 1,542-record runtime with an active 2005 FRQ filter. The candidate preserves the Cloudflare top bar, mobile menu, explicit Practice sessions entry, URL filters, and PDF detail controls. Browse uses the archived card anatomy and visual hierarchy. The bank retains Cloudflare's filtered topic context and the restored flat cards. The builder ports the four Sites steps into the Cloudflare shell. Fine spacing, typography and detail toolbar still differ.

## Catalog, worksheet, and private service

[Source checks](source-checks.md) · [Catalog candidate](questions.stage3-v1.json) · [Decision ledger](catalog-decisions.jsonl)

The versioned catalog contains 1,564 records with all 1,542 active stable IDs, 22 accepted additions, 87 pending additions, and 864 shared IDs whose proposed changes remain pending. The 678 identical shared records need no migration. The active app still uses the 1,542-record runtime catalog while Stage 4 verifies the separately versioned candidate. All six stimulus groups and 17 associations survive in both catalog versions.

Worksheet export uses the archived reviewed print content and answer registry. Unreviewed layouts fall back to complete source pages, deduplicated by source bank and page, with verified shared context for isolated stimulus regions. Whole pages can contain adjacent material or printed answers and the preview calls this out. Student-facing approved-image delivery stays deferred.

Vinext builds `student/app` as the student route root. The existing admin source remains under `app` for the private service. The built client manifest and asset scan exclude the review dashboard. Signed student requests still hit the Worker route guard. The private Worker, D1/R2 configuration, reviewed data, archives, and production workflow received no changes.

## Stage 4 gates and rollback

1. Repeat visual acceptance on one clean checkout and the matching versioned catalog. Compare equal filter settings and fixture IDs. Repeat the tested draft operations and keyboard navigation on the authorized release environment. Check focus and scrolling across all detail controls.
2. Compare printed source editions and complete prompts for the 87 additions and 864 shared deltas. Resolve the year, type and page conflicts and only promote a reviewed candidate as a unit with its worksheet registries.
3. Verify a mixed MCQ/FRQ worksheet with real multi-page and fallback sources. Check reference tables, page breaks, answer-only and combined modes, and document any printed-key leakage before authorizing wider worksheet distribution.
4. Do a signed-in Cloudflare Access verification in an authorized protected environment. Confirm allowed and denied identities, direct asset and PDF requests, and admin-route denials. Use synthetic or isolated storage for any private restore exercise.
5. Record the exact approved application SHA, matched catalog and asset hashes, current Worker version and rollback target before release. On application rollback, restore the prior student version and its matching catalog/worksheet assets together. Leave private data recovery on its independent workflow.

Stage 3 performed local packaging and isolated testing. Production release is a later decision.
