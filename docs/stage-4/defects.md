# Defect and correction log

All applied corrections are in application commit `3c78883006beb48c2dab68443e6e93b87bb9a769`.

| ID | Severity | Reproduction | Result |
| --- | --- | --- | --- |
| S4-01 | High | Open 2014 practice Q17 in the staged catalog. The current page refers to the same titration while the setup and graph are on 178. | Corrected source/evidence pages to 178–179. Runtime record, valid PDF range and catalog regression test passed. |
| S4-02 | High | Export `frq-2016-1-385` with source citations. Header says 2019 while citation says 2016. Its halogen tags also disagree with the urea prompt. | Corrected student source year/exam, retained ID, removed mismatched tags/crop, routed to topic review. Final rendered citation says 2019. |
| S4-03 | Medium | Preview a draft with unreviewed print content. Stage 3 says it must be removed while making the PDF downloadable. The downloaded pages had no fallback label. | Corrected builder guidance and labeled each full source page in PDF output. All three modes downloaded and were rendered. |
| S4-04 | Medium | Tab into the Stage 3 shell or return from a keyboard-opened Bank detail. Skip link absent and browser focus lands on the body. | Restored skip link and landmark focus on Bank/detail transitions. Checked across all four viewport sizes. |
| S4-05 | Medium | Inspect detail routing with a missing ID after a question was opened, or inspect tabs for equal physical page numbers in different banks. | Detail uses the requested ID and tab keys use global pages. Valid deep links and history passed. Edge cases were confirmed by code inspection. |
| S4-06 | Medium | Inspect 2022 Form I continuation pages on the proposed longer spans. The source mixes required continuation with scoring material. | Deferred in catalog ledger. Affected records need separate prompt-only verification before worksheet distribution. |
| S4-07 | Low | Generate the audited A4 export with default FRQ response lines and reference tables. | The last line spills onto a mostly empty response-space page. Documented pagination limitation. |
| S4-08 | Release blocker | Attempt real allowed/denied Access identity verification for the candidate. | No isolated hosted candidate was available. Local signed and denied results are recorded separately. |
