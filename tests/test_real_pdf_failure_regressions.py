"""Focused detector regressions for documented real-PDF failures.

These examples were previously inspected and are regression cases, not an
independent holdout sample. Each proposal is produced by the full catalog-to-PDF
detector path with the same-page catalog questions present.
"""
import importlib.util
import json
import re
import unittest
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("failure_regression_detector", ROOT / "research/detect_question_boundaries.py")
DETECTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DETECTOR)
QUESTION_IDS = [
    "mcq-2008-70-44", "mcq-2022-1-1617", "mcq-2023-1-1720",
    "mcq-2024-1-2129", "frq-2022-1-420", "mcq-2022-1-1669",
    "mcq-2023-1-1812", "mcq-2024-12-2132", "frq-2024-1-464",
    "frq-2024-1-484", "mcq-1984-8-120", "mcq-2023-1-1756",
    "frq-2023-1-442",
]


class RealPdfFailureRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / "public/questions.json").read_text())
        all_questions = cls.catalog["questions"]
        cls.by_id = {q["id"]: q for q in all_questions}
        pages = {int(p) for qid in QUESTION_IDS for p in cls.by_id[qid].get("pages", [])}
        subset = {**cls.catalog,
                  "questions": [q for q in all_questions
                                if pages.intersection(map(int, q.get("pages", [])))]}
        cls.proposals = DETECTOR.detect(subset, ROOT / "public")
        cls.proposed_by_id = {q["id"]: q for q in cls.proposals["questions"]}

    def question(self, qid):
        return self.proposed_by_id[qid]

    def region(self, qid, page):
        return next(r for r in self.question(qid)["regions"] if r["page"] == page)

    def crop_text(self, qid, page_number):
        region = self.region(qid, page_number)
        source = next(s for s in self.catalog["sourceFiles"]
                      if int(s["from"]) <= page_number <= int(s["to"]))
        with fitz.open(ROOT / "public" / source["url"].lstrip("/")) as doc:
            page = doc.load_page(page_number - int(source["from"]))
            return page.get_textbox(fitz.Rect(region["rect"]))

    def test_2008_target_starts_after_previous_question_choices(self):
        region = self.region("mcq-2008-70-44", 44)
        text = self.crop_text("mcq-2008-70-44", 44)
        self.assertGreater(region["rect"][1], 315)
        self.assertIn("Naturally produced amino acids", text)
        self.assertIn("chlorine", text)
        self.assertNotIn("average molecular kinetic energy", text)
        self.assertFalse(region["manualReview"])

    def test_2023_mcq_excludes_directions_and_following_question_equation(self):
        region = self.region("mcq-2023-1-1720", 1720)
        text = self.crop_text("mcq-2023-1-1720", 1720)
        self.assertRegex(text, r"most ionic\s+character")
        self.assertEqual(region["signals"]["answerChoiceMarkers"], 4)
        self.assertNotIn("Directions:", text)
        self.assertNotIn("NO2Cl", text)
        self.assertFalse(region["manualReview"])

    def test_2024_question_1_keeps_rightmost_answer_expression_without_booklet_header(self):
        region = self.region("mcq-2024-1-2129", 2129)
        text = self.crop_text("mcq-2024-1-2129", 2129)
        self.assertIn("number of moles in", text)
        self.assertEqual(region["signals"]["answerChoiceMarkers"], 4)
        self.assertGreater(region["rect"][2], 430)
        self.assertNotIn("Unit 1 Progress Check", text)
        self.assertFalse(region["manualReview"])

    def test_2024_single_column_question_uses_full_width_and_all_choices(self):
        region = self.region("mcq-2024-12-2132", 2132)
        text = self.crop_text("mcq-2024-12-2132", 2132)
        self.assertEqual(region["signals"]["columnCount"], 1)
        self.assertGreater(region["rect"][2], 540)
        self.assertIn("mole fraction of each gas", text)
        for label in "ABCD":
            self.assertRegex(text, rf"\({label}\)")
        self.assertFalse(region["manualReview"])

    def test_answer_revealing_source_markup_blocks_automatic_approval(self):
        annotated = self.region("mcq-2022-1-1617", 1617)
        self.assertIn("answer_revealing_annotation", annotated["signals"]["sourceQualityFlags"])
        self.assertTrue(annotated["manualReview"])
        self.assertGreater(annotated["confidence"], 0.8)  # independent source-quality gate

        for qid in ("mcq-2022-1-1669", "mcq-2023-1-1756"):
            region = self.region(qid, self.by_id[qid]["pages"][0])
            self.assertIn("colored_answer_key_marking", region["signals"]["sourceQualityFlags"])
            self.assertTrue(region["manualReview"])

    def test_frq_2022_continuations_retain_setup_table_graph_and_all_subparts(self):
        page421 = self.crop_text("frq-2022-1-420", 421)
        page422 = self.crop_text("frq-2022-1-420", 422)
        page423 = self.crop_text("frq-2022-1-420", 423)
        self.assertIn("purify the", page421)
        self.assertIn("Properties of Salicylic Acid", page421)
        self.assertIn("Specific heat capacity", page421)
        self.assertIn("titration curve", page422)
        self.assertIn("structures and melting points", page422)
        self.assertGreater(self.region("frq-2022-1-420", 422)["signals"]["graphicsIncluded"], 0)
        self.assertGreater(self.region("frq-2022-1-420", 423)["signals"]["graphicsIncluded"], 0)
        for part in "efgh":
            self.assertRegex(page423, rf"\({part}\)")
        self.assertTrue(self.question("frq-2022-1-420")["manualReview"])

    def test_frq_2023_continuation_retains_data_and_battery_diagram(self):
        table_page = self.crop_text("frq-2023-1-442", 443)
        diagram_page = self.crop_text("frq-2023-1-442", 444)
        self.assertIn("heats the resulting mixture", table_page)
        self.assertIn("Mass of empty beaker", table_page)
        self.assertIn("0.0199 mol of Mn", table_page)
        self.assertIn("Some half-reactions are given", diagram_page)
        self.assertGreater(self.region("frq-2023-1-442", 444)["signals"]["graphicsIncluded"], 0)
        for label in ("(i)", "(ii)", "(iii)", "(iv)"):
            self.assertIn(label, diagram_page)
        self.assertTrue(self.question("frq-2023-1-442")["manualReview"])

    def test_frq_2024_continuation_retains_titration_setup_and_later_work(self):
        page465 = self.crop_text("frq-2024-1-464", 465)
        page466 = self.crop_text("frq-2024-1-464", 466)
        page467 = self.crop_text("frq-2024-1-464", 467)
        self.assertIn("student uses the sodium hydroxide", page465)
        self.assertIn("following graph", page465)
        self.assertIn("Experiment", page466)
        self.assertIn("Titration Curve", page466)
        self.assertGreater(self.region("frq-2024-1-464", 466)["signals"]["graphicsIncluded"], 0)
        self.assertIn("(ii)", page467)
        self.assertIn("(iii)", page467)
        self.assertTrue(self.question("frq-2024-1-464")["manualReview"])

    def test_2024_catalog_question_with_2025_source_is_flagged_not_rewritten(self):
        question = self.question("frq-2024-1-484")
        self.assertEqual(str(self.by_id["frq-2024-1-484"]["year"]), "2024")
        self.assertTrue(question["manualReview"])
        self.assertTrue(any(r["signals"].get("sourceMetadataMismatch") for r in question["regions"]))
        self.assertTrue(any(2025 in r["signals"].get("sourceYears", []) for r in question["regions"]))
        context_page = self.crop_text("frq-2024-1-484", 485)
        self.assertIn("student prepares", context_page)
        self.assertNotIn("AP CHEMISTRY 2025", context_page)
        self.assertGreater(self.region("frq-2024-1-484", 485)["signals"]["graphicsIncluded"], 0)

    def test_1984_actual_detect_pipeline_excludes_printed_page_number(self):
        regions = [r for r in self.question("mcq-1984-8-120")["regions"] if r["page"] == 120]
        source = next(s for s in self.catalog["sourceFiles"] if s["from"] <= 120 <= s["to"])
        with fitz.open(ROOT / "public" / source["url"].lstrip("/")) as doc:
            page = doc.load_page(120 - int(source["from"]))
            text = "\n".join(page.get_textbox(fitz.Rect(region["rect"])) for region in regions)
        self.assertEqual(len(regions), 2)  # Shared reference/choices and target stem are separate segments.
        self.assertTrue(all(region["rect"][3] < 720 for region in regions))
        self.assertIn("Questions 8-9", text)
        self.assertIn("Solid ethyl alcohol", text)
        self.assertNotRegex(text, r"(?m)^\s*2\s*$")

    def test_previously_passing_2023_mcq_remains_automatic(self):
        question = self.question("mcq-2023-1-1812")
        region = self.region("mcq-2023-1-1812", 1812)
        text = self.crop_text("mcq-2023-1-1812", 1812)
        self.assertFalse(question["manualReview"])
        self.assertTrue(region["signals"]["answerChoiceSequence"])
        self.assertGreater(region["signals"]["graphicsIncluded"], 0)
        self.assertRegex(text, r"\(A\)\s*Y")


if __name__ == "__main__":
    unittest.main()
