# Functional and visual parity

Screenshots show Sites v48, the Stage 3 handoff application and the Stage 4 candidate in that order. The comparison uses the same viewport, navigational state and test records. The archived and student catalogs differ in total records and in their topic assignments.

[Desktop 1440×900](screens/desktop.jpg) · [Mobile 390×844](screens/mobile.jpg) · [Tablet 768×1024](screens/tablet.jpg) · [Narrow mobile 320×700](screens/narrow.jpg)

| Surface | Exercise and observed result | Classification |
| --- | --- | --- |
| Browse and unit directory | Opened Unit 1 using keyboard Enter at each viewport. Directory and unit pages rendered without horizontal document overflow. | Acceptable difference. Student keeps its separate compact navigation and card treatments. |
| Topics and flat bank | Matched Unit 1, topic 1.3, FRQ, search 2005 using the controls in both apps. Tested zero-match query then recovered the shared `frq-2005-2-7` record. | Acceptable difference. Sites uses individual filter chips and different result totals. |
| Detail and original PDFs | Opened the same FRQ by keyboard, inspected canvas after scrolling, navigated Back and Forward, reloaded the detail URL, then separately loaded `mcq-2008-1-29`. Student next/previous returned to the same MCQ URL. | Intended improvement. Student preserves URL filters and source-page controls. |
| Keyboard focus | Stage 3 omitted the Sites skip link, and focus returned to the document body after detail navigation. Stage 4 focuses the main landmark across bank/detail transitions and supports the skip link at each width. | Functional regression corrected. Focus lands on the landmark, with page controls next in the tab order. |
| Practice session | On student at each width, started an FRQ session, submitted a response, recorded a self-check and reloaded the session URL. | Intended improvement. Separate session entry and durable session URLs. |
| Practice Builder | Builder opened on both at each width. Student mixed export exercised draft migration, ordering, duplication, page breaks, formatting, preview, download and reload persistence. | Intended improvement. Cloudflare shell separates interactive sessions from printable drafts. |
| Scrolling and responsive layout | Captured Browse, Unit, filtered Bank, PDF detail and builder at every width, with no horizontal document overflow in the measured states. | Acceptable difference. Spacing, typography and detail-toolbar layout vary. |
| Hosted sign-in and CDN | Local Workers with synthetic tokens only. | Unverified and release-blocking. |

No uncaught page errors appeared in these four-width flows. Browser Back is verified for the matched bank result. Scroll restoration after navigating from later pages of a paginated result set, drag-and-drop reorder and screen-reader output were outside this pass.
