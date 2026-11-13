# Stage 6 owner verification results

**NO-GO pending authenticated delivery of four PDFs and the remaining hosted checks.**

On November 13, 2026 at 21:57:21 UTC the owner ran the authenticated staging verifier against artifact 14074740993. Of 34 asset checks, 29 live SHA-256 digests matched, including the student catalog (HTTP 200, SHA-256 `96d67555cb3474aab1d49df6a7a38f1282e4617cb07c3a707d73c679f2bbf7e9`). All four authenticated admin and backup GETs returned the Worker’s expected 404.

## Source PDFs 02–05

All four files are present in the sealed archive, listed by the deployment upload, and included in Vinext’s public-file list in the sealed Worker. A local replay of the exact built Worker with a synthetic signed identity returned HTTP 200 and matching hashes for all four (4,363,185; 13,987,593; 7,717,854; and 7,166,311 bytes respectively). That verified the artifact and local routing. Staging delivery remains unverified. The first browser verifier used a 30-second deadline covering headers and body, batched requests in groups of four, and suppressed error types. That output cannot distinguish download timeout, body allocation or hashing errors, and an edge delivery failure. Some similarly large files passed, so size alone does not explain the failures.

Run [retry-pdfs.js](retry-pdfs.js) once in the signed-in staging Console. It checks the four files sequentially with a 180-second per-file deadline and reports status, redirect flag, timings, received byte count, PDF signature, error name and hash comparison. This is read-only and does not extract credentials. A successful retry establishes delivery and integrity; it establishes the earlier deadline as a plausible cause, with stronger evidence if delivery takes over 30 seconds. A repeated failure retains the delivery gate and its phase-specific evidence.

## Vinext build manifest

`vinext-client-entry-manifest.json` exists in the sealed artifact and appeared in Wrangler’s upload log. The pinned Vinext code reads it from disk to resolve build entry metadata. It is absent from the generated Worker public-file list. The Worker dispatches only `/_next/static/` directly to ASSETS and sends this root path through Vinext. The exact local Worker reproduced HTTP 404 for the manifest, and its homepage returned HTTP 200 with the actual entry script referenced in the HTML. The staging verifier independently matched the served JS/CSS. The observed 404 is consistent with the Worker routing contract, with no indication that the browser needs the manifest URL. Hosted UI behavior still requires the functional smoke checks.

Keep the file and its hash in the sealed build inventory. The owner verifier’s original 34-file result stands as evidence. For the hosted decision, classify this particular 404 as an expected build-metadata response and require the 33 HTTP-delivered asset hashes, including the four pending PDFs. No deployment or sealed manifest correction is indicated.

The [owner checklist](owner-verification.md) still applies to functional UI/export and the unapproved identity evidence. No Cloudflare deployment, Access policy or main change was performed.
