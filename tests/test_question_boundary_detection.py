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
            crop_text = page.get_textbox(fitz.Rect(result["rect"]))
        self.assertEqual(result["signals"]["frqSubpartLabels"], ["a", "b", "c", "d", "e"])
        self.assertLess(result["rect"][1], 320)  # Introductory acid equation is above the number.
        self.assertGreater(result["rect"][1], 295)  # Exam instructions/header are excluded.
        self.assertIn("1.34", crop_text)  # The equation and Ka value remain.
        self.assertNotIn("score weighting", crop_text)
        self.assertGreater(result["rect"][3], 690)  # Last subpart remains complete.
        self.assertLess(result["rect"][3], 720)  # Copyright/footer is excluded.

    def test_real_2005_frq_continuation_uses_subparts_and_graphics_without_full_page_crop(self):
        source = ROOT / "public/source/bank-01.pdf"
        if not source.exists():
            self.skipTest("Original bank-01.pdf is not available in this checkout.")
        with fitz.open(source) as doc:
            page = doc.load_page(8)  # Catalog page 9; continuation of 2005 FRQ Question 3.
            q = {"id": "frq-2005-3-8", "number": 3, "type": "FRQ", "pages": [8, 9]}
            prior = {"page": 9, "rect": [20, 40, 592, 737]}
            result = DETECTOR.analyze_page(page, q, prior, [q], {}, 9)
        self.assertTrue(result["manualReview"])
        self.assertTrue(result["signals"]["continuationPageDetected"])
        self.assertEqual(result["signals"]["frqSubpartLabels"], ["c"])
        self.assertGreater(result["rect"][1], 40)
        self.assertLess(result["rect"][1], 90)
        self.assertGreater(result["rect"][3], 300)  # Graph and all (c) work remain.
        self.assertLess(result["rect"][3], 360)  # Exam stop/footer area is excluded.

    def test_real_2006_frq_excludes_symbol_copyright_footer(self):
        source = ROOT / "public/source/bank-01.pdf"
        if not source.exists():
            self.skipTest("Original bank-01.pdf is not available in this checkout.")
        with fitz.open(source) as doc:
            page = doc.load_page(19)  # Catalog page 20; printed 2006 FRQ Question 1.
            q = {"id": "frq-2006-1-20", "number": 1, "type": "FRQ", "pages": [20]}
            prior = {"page": 20, "rect": [0, 55, 612, 737]}
            result = DETECTOR.analyze_page(page, q, prior, [q], {}, 20)
            crop_text = page.get_textbox(fitz.Rect(result["rect"]))
        self.assertIn("why a precipitate does not form", crop_text)
        self.assertNotIn("All rights reserved", crop_text)
        self.assertLess(result["rect"][3], 713.5)

    def test_real_2021_frq_continuation_keeps_setup_above_first_subpart(self):
        source = ROOT / "public/source/bank-02.pdf"
        if not source.exists():
            self.skipTest("Original bank-02.pdf is not available in this checkout.")
        with fitz.open(source) as doc:
            page = doc.load_page(100)  # Catalog page 401; third page of 2021 FRQ Question 1.
            q = {"id": "frq-2021-1-399", "number": 1, "type": "FRQ", "pages": [399, 400, 401]}
            prior = {"page": 401, "rect": [20, 40, 574, 734]}
            result = DETECTOR.analyze_page(page, q, prior, [q], {}, 401)
            crop_text = page.get_textbox(fitz.Rect(result["rect"]))
        self.assertTrue(result["manualReview"])
        self.assertTrue(result["signals"]["continuationPageDetected"])
        self.assertIn("When a catalyst is added", crop_text)
        self.assertIn("HCOOH", crop_text)
        self.assertIn("(e) Is the reaction a redox reaction", crop_text)
        self.assertLess(result["rect"][1], 75)

    def test_real_1984_shared_mcq_does_not_extend_to_page_number(self):
        source = ROOT / "public/source/bank-01.pdf"
        if not source.exists():
            self.skipTest("Original bank-01.pdf is not available in this checkout.")
        with fitz.open(source) as doc:
            page = doc.load_page(119)  # Catalog page 120; printed 1984 MCQ Question 8.
            q = {"id": "mcq-1984-8-120", "number": 8, "type": "MCQ", "pages": [120]}
            prior = {"page": 120, "rect": [0, 390, 306, 735]}
            result = DETECTOR.analyze_page(page, q, prior, [q], {}, 120)
            crop_text = page.get_textbox(fitz.Rect(result["rect"]))
        self.assertIn("Questions 8-9", crop_text)
        self.assertIn("Solid ethyl alcohol", crop_text)
        self.assertLess(result["rect"][3], 720)

    def test_real_2018_mcq_recovers_previous_page_shared_table(self):
        source = ROOT / "public/source/bank-04.pdf"
        following_source = ROOT / "public/source/bank-05.pdf"
        if not source.exists() or not following_source.exists():
            self.skipTest("Original bank-04.pdf and bank-05.pdf are not available in this checkout.")
        catalog = {
            "sourceFiles": [
                {"url": "/source/bank-04.pdf", "from": 901, "to": 1200},
                {"url": "/source/bank-05.pdf", "from": 1201, "to": 1500},
            ],
            "questions": [{
                "id": "mcq-2018-17-1201",
                "type": "MCQ",
                "number": 17,
                "pages": [1201],
                "sourceRegions": [{"page": 1201, "rect": [0, 55, 301.68, 258.15]}],
                "fullText": "Based on the structural formulas, which compound is more soluble in water?",
            }],
        }
        result = DETECTOR.detect(catalog, ROOT / "public")["questions"][0]
        self.assertEqual([region["page"] for region in result["regions"]], [1200, 1201])
        self.assertTrue(result["manualReview"])
        self.assertTrue(result["regions"][0]["signals"]["previousPageSharedGroupDetected"])
        self.assertEqual(result["regions"][0]["signals"]["sharedQuestionRange"], [15, 19])
        self.assertGreater(result["regions"][0]["signals"]["graphicsIncluded"], 0)
        self.assertTrue(result["regions"][1]["signals"]["graphicsExpected"])

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
