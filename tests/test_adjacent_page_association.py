"""Development regressions for cross-page localization; not holdout evidence."""
import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import fitz

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("adjacent_page_detector", ROOT / "research/detect_question_boundaries.py")
DETECTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DETECTOR)


class AdjacentPageAssociationRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / "public/questions.json").read_text())
        cls.by_id = {q["id"]: q for q in cls.catalog["questions"]}
        selected = [cls.by_id[f"mcq-2024-{n}-" + ("2091" if n == 21 else "2090" if n <= 25 else "2092")]
                    for n in range(21, 27)]
        selected.append(cls.by_id["frq-2024-4-2123"])
        cls.proposals = DETECTOR.detect({**cls.catalog, "questions": selected}, ROOT / "public")
        cls.proposed_by_id = {q["id"]: q for q in cls.proposals["questions"]}

    def test_q23_has_ordered_shared_stimulus_and_adjacent_body_without_mutating_catalog(self):
        q = self.proposed_by_id["mcq-2024-23-2090"]
        self.assertEqual([r["page"] for r in q["regions"]], [2090, 2091])
        self.assertEqual([r["segmentRole"] for r in q["regions"]], ["sharedStimulus", "questionBody"])
        stimulus, body = q["regions"]
        self.assertEqual([stimulus["segmentOrder"], body["segmentOrder"]], [1, 2])
        self.assertEqual(stimulus["signals"]["sharedQuestionRange"], [22, 25])
        self.assertTrue(stimulus["signals"]["sharedContextOnly"])
        self.assertTrue(body["signals"]["catalogPageAssociationMismatch"])
        self.assertFalse(body["signals"]["sourceMetadataMismatch"])
        self.assertTrue(body["signals"]["answerChoiceSequence"])
        self.assertEqual(body["signals"]["answerChoiceLabels"], list("ABCD"))
        self.assertTrue(q["manualReview"])
        self.assertEqual(q["extractionStatus"], "candidate-needs-manual-verification")
        self.assertEqual(self.by_id["mcq-2024-23-2090"]["pages"], [2090])
        self.assertEqual(self.by_id["mcq-2024-23-2090"].get("sourceRegions"),
                         [{"page": 2090, "rect": [20, 45, 575, 797]}])

    def test_q23_geometry_excludes_neighbor_stems_and_footer_material(self):
        q = self.proposed_by_id["mcq-2024-23-2090"]
        shared, body = q["regions"]
        self.assertLess(shared["rect"][3], 300, "shared table must end above Q22")
        self.assertLess(body["rect"][3], 220, "Q23 crop must end before Q24")
        self.assertLess(body["rect"][2], 330, "Q23 left-column body must exclude Q25 in the right column")
        self.assertTrue(body["signals"]["fullPageRaster"])
        self.assertEqual(body["signals"]["answerChoiceMarkers"], 4)

    def test_q23_shared_table_closing_rule_is_inside_the_crop(self):
        stimulus = self.proposed_by_id["mcq-2024-23-2090"]["regions"][0]
        document = fitz.open(ROOT / "public/source/bank-07.pdf")
        try:
            page = document.load_page(289)  # catalog page 2090
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), colorspace=fitz.csGRAY, alpha=False)
            row_y = 242  # visible closing rule under the fourth table row, PDF points
            row = pix.samples[(row_y * 2) * pix.width:(row_y * 2 + 1) * pix.width]
            x0, x1 = int(70 * 2), int(560 * 2)
            dark_pixels = sum(value < 100 for value in row[x0:x1])
            self.assertGreater(dark_pixels, 500, "expected the table's closing rule in the source scan")
            self.assertGreater(stimulus["rect"][3], row_y,
                               "the shared-context crop must include the complete lower table border")
        finally:
            document.close()

    def test_adjacent_shared_group_candidates_trim_footer_and_stay_manual(self):
        for qid in ("mcq-2024-24-2090", "mcq-2024-25-2090"):
            question = self.proposed_by_id[qid]
            body = next(r for r in question["regions"] if r.get("segmentRole") == "questionBody")
            self.assertEqual(body["page"], 2091)
            self.assertLess(body["rect"][3], 500, f"{qid} should not retain the lower page footer/blank area")
            self.assertTrue(body["signals"]["rasterGraphicsUnverified"])
            self.assertTrue(body["manualReview"])

    def test_right_column_stem_number_is_inside_candidate_bounds(self):
        body = next(r for r in self.proposed_by_id["mcq-2024-25-2090"]["regions"]
                    if r.get("segmentRole") == "questionBody")
        self.assertLessEqual(body["rect"][0], 310,
                             "right-column crop must include the printed question-number glyph at the gutter")
        self.assertTrue(body["manualReview"])

    def test_scanned_multipage_frq_segments_prompts_and_excludes_response_space_and_footer(self):
        q = self.proposed_by_id["frq-2024-4-2123"]
        self.assertEqual([r["page"] for r in q["regions"]], [2123, 2123, 2124, 2124])
        self.assertEqual([r["signals"]["continuationSegmentIndex"] for r in q["regions"]], [1, 2, 1, 2])
        self.assertTrue(all(r["manualReview"] and r["signals"]["rasterGraphicsUnverified"] for r in q["regions"]))
        self.assertLess(max(r["rect"][3] for r in q["regions"]), 600,
                        "question-only segments must exclude printed footers and blank response areas")
        self.assertIn("a", q["regions"][0]["signals"]["frqSubpartLabels"])
        self.assertIn("b", q["regions"][1]["signals"]["frqSubpartLabels"])
        self.assertIn("c", q["regions"][2]["signals"]["frqSubpartLabels"])

    def test_recognized_scanned_frq_stem_still_splits_response_space(self):
        question = self.by_id["frq-2024-4-2123"]
        region = question["sourceRegions"][0]
        lines = [
            {"text": text, "rect": fitz.Rect(*rect)}
            for text, rect in (
                ("Begin your response to QUESTION 4 on this page.", (163, 52, 430, 69)),
                ("4. A student conducts a calorimetry experiment.", (15, 81, 525, 95)),
                ("The following table has the experimental data.", (29, 117, 242, 129)),
                ("Mass of water", (290, 233, 357, 243)),
                ("Mass of CaBr2", (290, 253, 359, 265)),
                ("(a) Explain why a lid is important.", (30, 362, 527, 391)),
                ("(b) Justify the sign of the enthalpy change.", (30, 532, 547, 546)),
                ("GO ON TO THE NEXT PAGE.", (399, 747, 575, 759)),
            )
        ]
        with fitz.open(ROOT / "public/source/bank-08.pdf") as document:
            with patch.object(DETECTOR, "_content_lines", return_value=(lines, 73, True)):
                first = DETECTOR.analyze_page(document[22], question, region, [question], {}, 2123)

        second, = first["additionalRegions"]
        self.assertTrue(first["signals"]["questionStartFound"])
        self.assertEqual(first["signals"]["questionStartMatches"], 1)
        self.assertFalse(second["signals"]["questionStartFound"])
        self.assertEqual([part["signals"]["frqSubpartLabels"] for part in (first, second)], [["a"], ["b"]])
        self.assertTrue(all(part["manualReview"] and part["signals"]["rasterGraphicsUnverified"]
                            for part in (first, second)))
        self.assertGreaterEqual(first["rect"][1], lines[0]["rect"].y1)
        self.assertLess(first["rect"][3], 420)
        self.assertGreater(second["rect"][1], 500)
        self.assertLess(second["rect"][3], 600)

    def test_unmeasurable_frq_continuation_rejects_prior_as_crop(self):
        document = fitz.open()
        page = document.new_page(width=612, height=792)
        page.insert_text((72, 120), "(c)")
        question = {"id": "frq-2099-1-1", "type": "FRQ", "number": 1, "year": 2099}
        region = {"page": 2, "rect": [30, 40, 580, 740]}
        result = DETECTOR.analyze_page(page, question, region, [question], {}, 2)
        self.assertIsNone(result["rect"])
        self.assertEqual(result["priorRect"], region["rect"])
        self.assertEqual(result["extractionStatus"], "unresolved")
        self.assertTrue(result["manualReview"])
        self.assertTrue(result["signals"]["priorRegionRejected"])
        document.close()


if __name__ == "__main__":
    unittest.main()
