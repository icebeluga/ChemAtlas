# Running and reviewing the unified ChemAtlas repository

## Student service

Use Node 22.13 or newer and the pinned pnpm version from `package.json`. From the integration branch:

```sh
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1
pnpm exec tsc --noEmit
pnpm build
node --test tests/*.test.mjs
python -m unittest discover -s tests -p 'test_*.py'
```

Install PyMuPDF in your Python environment for the detector tests. The student preview opens at the loopback address printed by Vinext. Browse by unit, filter the Question Bank, or start a Practice Builder session. From the session, open **Worksheet**, wait for the original pages to render, then choose **Print or save PDF**. A question with a missing crop uses its original page. Shared context is included once per group. Source material may include answer markings or neighboring content on fallback pages.

For the built student-service preview, run `pnpm start` after building. The public worker has no D1/R2 review bindings or Access identity configuration. It uses the PDF source fallback when private accepted images are unavailable.

## Private review service

Use the independent Worker configuration in `wrangler.private-review.jsonc`. For local storage testing use `pnpm exec wrangler d1 migrations apply chematlas-private-review --local --config wrangler.private-review.jsonc` and `pnpm exec wrangler dev --local --config wrangler.private-review.jsonc` after building. Configure Access owner, team domain, and audience through local environment bindings for identity verification. See [private review deployment notes](private-review-deployment-phase-1.md) for binding details. The hosted review requires valid Cloudflare Access authentication and private D1/R2 bindings.

The local development dashboard at `/admin/question-review` uses a file adapter and skips Cloudflare sign-in. Keep it on loopback. To isolate preview data, set `CHEMATLAS_REVIEW_MANIFEST` and `CHEMATLAS_REVIEW_IMAGES` to temporary paths before starting the dev server. Review decisions, crop revisions, and backup operations can be exercised against that store.

## Conflict and catalog record

- `app/page.tsx` combines the public navigation state and Practice Builder with the inherited accepted-image fetch, catalog thumbnails, image mode, and dev-only dashboard link. The existing classification tools remain reachable from the student Tools menu.
- `app/globals.css` combines the student theme and responsive navigation with the inherited dashboard and accepted-image rules. The worksheet adds print styles.
- The foundation `public/questions.json` remains canonical, with the same blob SHA `3eef99956b037611afc9b5a60a056f1cbbb311b0`. The private routes and detector retain their foundation files.
- [Machine-generated diff](unified-catalog-diff.json) compares public recovery `8e0a13a` to the foundation by stable ID. Both have 1,542 IDs. The canonical catalog has 1,266 MCQs and 276 FRQs. It retains the 19 type corrections, two expanded page mappings and 17 question-to-stimulus associations. The diff also records 143 source-region changes, 24 exam-label changes, four review-reason changes, two full-text changes and one year-field change. The eight PDF metadata entries match.
- Regenerate the diff from a full Git checkout using `git show 8e0a13a:public/questions.json > /tmp/chematlas-public-catalog.json`, then `python scripts/diff_catalog.py /tmp/chematlas-public-catalog.json public/questions.json`.
- The foundation geometry script contains the earlier crop branch's logic plus stimulus checks. The earlier output is preserved on its frozen ref. Historical public recovery and catalog-compatibility reports remain available alongside the new diff.

## Open issues

| Item | Status |
| --- | --- |
| 109 records implied by the 1,651-question screenshot | Source records and provenance unavailable. |
| Original Work and Site source | The GitHub recovery branch contains the reconstructable UI. Unsaved Work files and the original version-48 source remain unverified. |
| Phase 2 crop reliability | Proposal-only. Batch 5 remains 0/5 complete-and-clean. Batch 6 still has incomplete `mcq-2023-43-1731`; Markdown/JSON sample ordering differs. The `frq-2016-1-385` source-year discrepancy remains flagged in historical evidence. |
| Hosted authentication and storage | Hosted sign-in and D1/R2 data were outside this integration run. |
