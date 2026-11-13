# Stage 6 owner verification results

**NO-GO pending conclusive post-authentication denial for an unapproved identity.**

On November 13, 2026 at 21:57:21 UTC the owner ran the authenticated staging verifier against artifact 14074740993. Of 34 asset checks, 29 live SHA-256 digests matched, including the student catalog (HTTP 200, SHA-256 `96d67555cb3474aab1d49df6a7a38f1282e4617cb07c3a707d73c679f2bbf7e9`). All four authenticated admin and backup GETs returned the Worker’s expected 404.

## Authenticated staging UI

The owner manually tested the deployed staging application using their approved Cloudflare Access account and reported the following results. The assistant did not independently replay these browser interactions. The asset hash and admin/backup results above came from automated checks run in the owner's authenticated browser.

| Check | Owner-reported result |
| --- | --- |
| Question Bank | PASS |
| Deep-link navigation and refresh | PASS |
| Practice Builder, worksheet preview, and PDF export | PASS |
| Mobile responsive layout at approximately 390 px | PASS |

## Source PDFs 02–05

All four files are present in the sealed archive, listed by the deployment upload, and included in Vinext’s public-file list in the sealed Worker. A local replay of the exact built Worker with a synthetic signed identity returned HTTP 200 and matching hashes for all four (4,363,185; 13,987,593; 7,717,854; and 7,166,311 bytes respectively). That verified the artifact and local routing. The first browser verifier used a 30-second deadline covering headers and body, batched requests in groups of four, and suppressed error types. That output cannot distinguish download timeout, body allocation or hashing errors, and an edge delivery failure. Some similarly large files passed, so size alone does not explain the failures.

On November 13, 2026 at 22:03:30 UTC, the owner ran [retry-pdfs.js](retry-pdfs.js) in authenticated Chrome against staging artifact 14074740993. Each file returned HTTP 200, began with a valid `%PDF-` header, and completed without redirects or request errors. All four reported digests matched the sealed manifest. The retry verifies live delivery and integrity. The original error's cause remains undetermined.

| Live source PDF | Verified SHA-256 |
| --- | --- |
| bank-02.pdf | `fcc673296f40b437f6174e82c530b9bf639755d97308565d35f4db372eb9b2f5` |
| bank-03.pdf | `10757d0d7de0b5d57cd4c459b17edeceb70858c9f03016e609f2d840311653a7` |
| bank-04.pdf | `d5340628fd7fd6e715bd816fd7d17f108bf60fd96c822ba6d813986c53235304` |
| bank-05.pdf | `9ad05766191617f2204944de897c3b9f1b49b50aef1a528302852b865cd9ecdd` |

## Vinext build manifest

`vinext-client-entry-manifest.json` exists in the sealed artifact and appeared in Wrangler’s upload log. The pinned Vinext code reads it from disk to resolve build entry metadata. It is absent from the generated Worker public-file list. The Worker dispatches only `/_next/static/` directly to ASSETS and sends this root path through Vinext. The exact local Worker reproduced HTTP 404 for the manifest, and its homepage returned HTTP 200 with the actual entry script referenced in the HTML. The staging verifier independently matched the served JS/CSS. The observed 404 is consistent with the Worker routing contract, with no indication that the browser needs the manifest URL.

Keep the file and its hash in the sealed build inventory. The owner verifier’s original 34-file result stands as evidence. For the hosted decision, classify this particular 404 as an expected build-metadata response and count 33 of 33 required HTTP-delivered asset hashes verified across the original run and retry. No deployment or sealed manifest correction is indicated.

The sole unresolved verification gate is conclusive denial after an unapproved identity successfully authenticates. The [owner checklist](owner-verification.md) describes acceptable evidence. After that evidence is supplied, recheck the production rollback version and issue a final GO/NO-GO recommendation. Production deployment requires separate explicit owner approval. This documentation update made no deployment, Access policy change, or change to `main`.
