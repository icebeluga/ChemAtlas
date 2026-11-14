# Source identity of `frq-2024-5-2125`

Date: 2026-11-14. Question: the catalog calls this "2024 AP Chemistry FRQ 5" (magnesium nitrate and sodium carbonate), but the publicly released 2024 FRQ 5 is about hydrogen iodide equilibrium. Is it an alternate form or a metadata error? **No record was changed.**

## Evidence

| Check | Finding |
| --- | --- |
| Released 2024 FRQs in the catalog | `bank-02` pages 164–179 are a digital PDF whose pages carry "AP® Chemistry 2024 Free-Response Questions" and "© 2024 College Board". Its Question 5 is the HI equilibrium question, already in the catalog as `frq-2024-5-476`. |
| Where `frq-2024-5-2125` comes from | `bank-08` page 25, part of a complete scanned exam (catalog pages 2079–2127: Section I, "60 Questions, 1 hour and 30 minutes"; Section II, "7 Questions, 1 hour and 45 minutes", Q1–Q7 as `frq-2024-*-2111` … `frq-2024-7-2127`). |
| What the scan is | A photographed physical student response booklet: footer "Unauthorized copying or reuse of this page is illegal. Page 16 … Use a pencil or a pen … Do NOT write your name." No "© 2024 College Board" line. |
| Year and form printed on the pages | None on the pages examined (Section I first and last pages, Section II first page, Q5 page header and footer). No form code. |
| Where the year comes from | Only from the document-sharing site's cover sheet (`bank-07` page 278), which gives the uploader's title "Qp-2024-chemistry - 2024 past paper" under an AP Chemistry course at an international school in Shanghai. |
| Format | 60 MCQ + 7 FRQ with parts labelled (a), (b)… matches the 2014–2024 exam format, not the later A/B labelling. |

## Conclusion

- It is **not a typo in the question number or a copy of the released Q5**: it is a different exam form.
- It is **most likely an unreleased 2024 form** (College Board uses different forms outside the main US administration, for example international or late-testing forms). The uploader's title and the school's location are consistent with an international form, but **neither the year nor the form is printed on the pages**, so this is unconfirmed.
- The catalog's metadata is therefore incomplete rather than simply wrong: two different questions share the label "2024 AP Chemistry FRQ 5" (`frq-2024-5-476` and `frq-2024-5-2125`), with nothing distinguishing the forms. The same applies to all seven `frq-2024-*-21xx` records and the MCQs of that scan.

## Recommendation (owner decision; not done)

Add a form/source field to the catalog for the `bank-08` scan, for example `"examForm": "2024, unreleased form (scanned booklet; year per uploader title, unverified)"`, and keep the year as 2024 unless better evidence appears. The concept classification of the question is unaffected: it was classified from the page content, not the label.

## Other problems found while checking (recorded in `research/concepts/catalog-issues.json`)

- `bank-08` page 28 is the cover of a separate shared document titled "Unit 1 Progress Check MCQ" and page 59 is headed "Unit 3 Progress Check: MCQ" (AP Classroom), yet the 28 catalog records on catalog pages 2129–2159 are labelled 2024 exam MCQs. Only pages 28 and 59 were inspected.
- `frq-2024-1-480`, `frq-2024-3-480` and `frq-2024-5-480` are numbered lab-procedure steps inside released 2024 FRQ 7, parsed as separate questions.
- Two more `frq-2024-*` sets (`bank-02` pages 184–198, and a "Version J" set on 201–212) use A/B part labels, which suggests the post-2024 format. Not verified.
- The shared-site cover pages inside the source PDFs carry download stamps with personal details. The student site serves `public/source/` to anyone who can open it (`lib/student-access.mjs` restricts only `/admin`), so these pages are visible to students. Not changed; owner decision.
