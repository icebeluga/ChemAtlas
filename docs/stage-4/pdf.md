# Worksheet PDF verification

Browser fixture uses 2008 Version A Q1–3 (shared answer choices), `mcq-2018-23-2039` (reviewed region and keyed answer), and `frq-2016-1-385` (actual 2019 urea FRQ, two full pages). At 390×844 a legacy flat selection migrated to one draft with five unique IDs, Q2 moved before Q1, a page break was set before the FRQ, A4 and citations were enabled, and the draft was duplicated. Reload retained both drafts, the active selection and formatting. Browser downloads were rendered with Poppler and compared to the original PDFs.

| Mode | Pages | Observed result |
| --- | --- | --- |
| Questions | 8 | One shared stimulus, three complete matching prompts, one separate keyed MCQ prompt, two FRQ source pages, response space and three reference pages. No appended answer key. |
| Answers | 1 | The fourth worksheet entry prints verified choice C. The remaining four show verified answer unavailable. Printed key citation is compiled page 2064. |
| Combined | 9 | Question section followed by the same verified-key output. |

The FRQ includes the molecular and particle diagrams, the apparatus and the table, with parts (a)–(h) intact. A4 margins and numbering render within the page. Three extra response lines caused a largely empty response-space page before the reference pages. The reference periodic table preserves its source orientation. Source fallback labels now appear in the downloaded PDF, including on continuation pages. Full-page output can still include adjacent prompts, scoring content or printed answers depending on the source. The audited Form I scoring-guide pages demonstrate the risk. The tested mixed question section had no appended or visible printed key. It does not qualify other fallback selections as answer-free.

[Rendered combined export](screens/worksheet.jpg)
