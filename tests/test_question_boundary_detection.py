import importlib.util
import tempfile
import unittest
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("boundary_detector", ROOT / "research/detect_question_boundaries.py")
DETECTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DETECTOR)


class QuestionBoundaryDetectionTests(unittest.TestCase):
    def test_real_2005_frq_one_excludes_examination_header_and_footer(self):
        source = ROOT / "public/source/bank-01.pdf"
        if not source.exists():
            self.skipTest("Original bank-01.pdf is not available in this checkout.")
        with fitz.open(source) as doc:
            page = doc.load_page(5)  # Catalog page 6; printed 2005 FRQ Question 1.
            q = {"id": "frq-2005-1-6", "number": 1, "type": "FRQ", "pages": [6]}
            prior = {"page": 6, "rect": [0, 55, 612, 737]}
            result = DETECTOR.analyze_page(page, q, prior, [q], {}, 6)
        self.assertEqual(result["signals"]["frqSubpartLabels"], ["a", "b", "c", "d", "e"])
        self.assertLess(result["rect"][1], 300)  # Introductory acid equation is above the number.
        self.assertGreater(result["rect"][1], 250)  # Exam instructions/header are excluded.
        self.assertGreater(result["rect"][3], 690)  # Last subpart remains complete.
        self.assertLess(result["rect"][3], 720)  # Copyright/footer is excluded.

    def test_mcq_refines_prior_includes_context_choices_graphics_and_stops_before_next_question(self):
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 110), "Use the equation E = mc^2 for Questions 1-2.")
        page.insert_text((72, 160), "1. Which statement best describes the reaction?")
        for i, choice in enumerate(("A. first answer", "B. second answer", "C. third answer", "D. fourth answer")):
            page.insert_text((92, 195 + i * 28), choice)
        page.draw_rect(fitz.Rect(380, 190, 490, 280), color=(0, 0, 1), width=2)
        page.insert_text((72, 520), "2. Which product is formed?")
        prior = {"page": 1, "rect": [50, 140, 550, 430]}
        q1 = {"id": "mcq-1", "number": 1, "type": "MCQ", "pages": [1], "sourceRegions": [prior], "stimulusIds": ["shared"]}
        q2 = {"id": "mcq-2", "number": 2, "type": "MCQ", "pages": [1], "sourceRegions": [{"page": 1, "rect": [50, 500, 550, 700]}]}
        result = DETECTOR.analyze_page(page, q1, prior, [q1, q2], {"shared": {"regions": [{"page": 1, "rect": [60, 85, 450, 125]}]}}, 1)
        self.assertIsNotNone(result["rect"])
        self.assertLess(result["rect"][1], 130)  # introductory equation/shared setup retained
        self.assertGreater(result["rect"][3], 300)  # drawing extends the crop past the answer text
        self.assertLess(result["rect"][3], 520)  # following question excluded
        self.assertEqual(result["signals"]["answerChoiceMarkers"], 4)
        self.assertGreaterEqual(result["signals"]["textCharacters"], 80)
        self.assertGreaterEqual(result["signals"]["pageTextCharacters"], result["signals"]["textCharacters"])
        self.assertEqual(result["signals"]["graphicsIncluded"], 1)
        self.assertEqual(result["signals"]["linkedStimulusRegions"], 1)
        self.assertGreaterEqual(result["confidence"], 0.78)
        self.assertFalse(result["manualReview"])
        doc.close()

    def test_frq_detects_lettered_subparts_and_rotation(self):
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 130), "1. Propanoic acid is a weak acid.")
        page.insert_text((90, 170), "(a) Write the equilibrium expression.")
        page.insert_text((90, 205), "(b) Calculate the pH of the solution.")
        page.set_rotation(90)
        q = {"id": "frq-1", "number": 1, "type": "FRQ", "pages": [1]}
        result = DETECTOR.analyze_page(page, q, None, [q], {}, 1)
        self.assertEqual(result["signals"]["frqSubpartMarkers"], 2)
        self.assertEqual(result["signals"]["pageRotation"], 90)
        self.assertGreater(result["confidence"], 0.5)
        doc.close()

    def test_sparse_scanned_page_is_flagged_without_full_page_fallback(self):
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        q = {"id": "scan-1", "number": 1, "type": "MCQ", "pages": [1]}
        result = DETECTOR.analyze_page(page, q, None, [q], {}, 1)
        self.assertTrue(result["manualReview"])
        self.assertIsNone(result["rect"])
        self.assertLess(result["confidence"], 0.58)
        doc.close()

    def test_detector_uses_original_question_metadata_and_source_mapping(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "source").mkdir()
            pdf = fitz.open()
            page = pdf.new_page()
            page.insert_text((72, 120), "1. Identify the strongest acid.")
            page.insert_text((90, 160), "A. HCl")
            page.insert_text((90, 190), "B. HF")
            page.insert_text((90, 220), "C. HBr")
            page.insert_text((90, 250), "D. HI")
            pdf.save(root / "source" / "bank.pdf")
            pdf.close()
            catalog = {"sourceFiles": [{"url": "/source/bank.pdf", "from": 1, "to": 1}],
                       "questions": [{"id": "q1", "number": 1, "type": "MCQ", "pages": [1],
                                      "sourceRegions": [{"page": 1, "rect": [60, 100, 520, 300]}]}]}
            result = DETECTOR.detect(catalog, root)
            self.assertEqual(result["questionCount"], 1)
            self.assertEqual(result["questions"][0]["id"], "q1")
            self.assertIsNotNone(result["questions"][0]["regions"][0]["rect"])

    def test_two_columns_stay_within_the_target_question_column(self):
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        page.insert_text((48, 100), "1. Left-column question")
        page.insert_text((64, 135), "A. alpha")
        page.insert_text((64, 165), "B. beta")
        page.insert_text((64, 195), "C. gamma")
        page.insert_text((64, 225), "D. delta")
        page.insert_text((350, 100), "2. Right-column question")
        page.insert_text((366, 135), "A. alpha")
        page.insert_text((366, 165), "B. beta")
        page.insert_text((366, 195), "C. gamma")
        page.insert_text((366, 225), "D. delta")
        q1 = {"id": "left", "number": 1, "type": "MCQ", "pages": [1]}
        q2 = {"id": "right", "number": 2, "type": "MCQ", "pages": [1]}
        result = DETECTOR.analyze_page(page, q1, None, [q1, q2], {}, 1)
        self.assertEqual(result["signals"]["columnCount"], 2)
        self.assertLess(result["rect"][0], 250)
        self.assertLess(result["rect"][2], 300)
        doc.close()

    def test_multipage_question_keeps_each_catalogued_page_and_flags_continuation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "source").mkdir()
            pdf = fitz.open()
            first = pdf.new_page()
            first.insert_text((72, 120), "1. Explain the following equilibrium.")
            first.insert_text((90, 160), "(a) Write the expression for K.")
            second = pdf.new_page()
            second.insert_text((90, 160), "(b) Calculate the value under the stated conditions.")
            second.insert_text((90, 205), "(c) Justify your answer.")
            pdf.save(root / "source" / "bank.pdf")
            pdf.close()
            q = {"id": "frq-long", "number": 1, "type": "FRQ", "pages": [1, 2],
                 "sourceRegions": [{"page": 1, "rect": [60, 100, 520, 300]}, {"page": 2, "rect": [60, 100, 520, 300]}]}
            catalog = {"sourceFiles": [{"url": "/source/bank.pdf", "from": 1, "to": 2}], "questions": [q]}
            result = DETECTOR.detect(catalog, root)["questions"][0]
            self.assertEqual([r["page"] for r in result["regions"]], [1, 2])
            self.assertEqual(result["regions"][1]["signals"]["textCharacters"] > 25, True)
            self.assertTrue(result["regions"][1]["manualReview"])
            self.assertEqual(result["manualReview"], True)

    def test_apply_high_confidence_writes_only_unambiguous_question_regions(self):
        catalog = {"questions": [
            {"id": "good", "sourceRegions": [{"page": 1, "rect": [0, 0, 1, 1]}]},
            {"id": "manual", "sourceRegions": [{"page": 2, "rect": [0, 0, 2, 2]}]},
        ]}
        proposals = {"questions": [
            {"id": "good", "regions": [{"page": 1, "rect": [5, 6, 70, 80], "confidenceBand": "high", "manualReview": False}]},
            {"id": "manual", "regions": [{"page": 2, "rect": [1, 1, 3, 3], "confidenceBand": "medium", "manualReview": True}]},
        ]}
        updated, applied = DETECTOR.apply_high_confidence(catalog, proposals)
        self.assertEqual(applied, 1)
        self.assertEqual(updated["questions"][0]["sourceRegions"], [{"page": 1, "rect": [5, 6, 70, 80]}])
        self.assertEqual(updated["questions"][1]["sourceRegions"], catalog["questions"][1]["sourceRegions"])
        self.assertEqual(catalog["questions"][0]["sourceRegions"], [{"page": 1, "rect": [0, 0, 1, 1]}])


if __name__ == "__main__":
    unittest.main()
