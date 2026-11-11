# Real-PDF visual audit - holdout 01

Fixed detector revision 144870a, PyMuPDF 1.26.7. Five IDs preregistered in batch 04, eight rendered segments. Detection included same-page catalog neighbors.

| ID | Result | Visual finding |
|---|---|---|
| mcq-2008-70-44 | Fail | The target stem and choices are complete, but all five choices from Question 69 are included. Confidence was high (0.90), with no manual-review flag. |
| mcq-2022-1-1617 | Fail | All choices are visible, but a yellow highlight reveals the correct answer. Confidence was high (0.86), with no manual-review flag. |
| mcq-2023-1-1720 | Fail | The target is complete but includes clipped section directions and Question 2's equation. This unmarked exam copy repeats the stem from tuning ID mcq-2023-1-1756, so it is ID-disjoint only. |
| mcq-2024-1-2129 | Minor issue | Complete stem and four numerical expressions. Unnecessary booklet header and progress-check title are included. |
| frq-2022-1-420 | Fail | Page 421 loses the purification setup and clips the table heading. Page 422 omits an introductory sentence, but both structures and the titration plot remain. Page 423 preserves parts (e)-(h) and their graph, with extra header/footer. Manual review was flagged. |

Totals: 0 pass, 1 minor issue, 4 fail. The first holdout shares page 44 with one tuning question, and the 2023 exam item shares a stem with a tuning item. Treat this as an ID-disjoint diagnostic, with limited source/content independence.
