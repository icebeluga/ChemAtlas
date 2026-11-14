"""Development regressions for Batch 5 crop and provenance failures."""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import fitz

from research import detect_question_boundaries as detector

ROOT = Path(__file__).resolve().parents[1]


class Batch5FailureRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / "public/questions.json").read_text())
        cls.stimuli = json.loads((ROOT / "research/stimuli.json").read_text())
        cls.by_id = {q["id"]: q for q in cls.catalog["questions"]}

    def detect(self, question_id):
        q = self.by_id[question_id]
        return detector.detect({**self.catalog, "questions": [q]}, ROOT / "public", self.stimuli)["questions"][0]

    def source_page(self, page_number):
        source = next(x for x in self.catalog["sourceFiles"] if x["from"] <= page_number <= x["to"])
        doc = fitz.open(ROOT / "public" / source["url"].lstrip("/"))
        return doc, doc.load_page(page_number - source["from"])

    def test_q53_full_text_box_width_and_wrapped_final_choice_are_preserved(self):
        result = self.detect("mcq-1984-53-128")
        self.assertFalse(result["automaticApplicationEligible"])
        self.assertEqual(result["approvalStatus"], "proposal-only")
        region = result["regions"][0]
        self.assertGreaterEqual(region["rect"][2], 300)
        self.assertLess(region["rect"][2], 323)  # keeps the adjacent column's text outside
        self.assertEqual(region["signals"]["answerChoiceLabels"], list("ABCDE"))
        self.assertFalse(region["signals"]["horizontalTextClippingDetected"])
        self.assertGreater(region["signals"]["horizontalTextBoundingBoxesChecked"], 0)
        doc, page = self.source_page(128)
        try:
            crop = fitz.Rect(region["rect"])
            expected = next(line["rect"] for line in detector._text_lines(page)
                            if line["text"].startswith("All species are in equilibrium"))
            self.assertTrue(crop.contains(expected), f"wrapped answer text clipped: {expected} vs {crop}")
        finally:
            doc.close()

    def test_q15_shared_graph_is_a_separate_ordered_context_segment(self):
        result = self.detect("mcq-2002-15-754")
        self.assertEqual([r.get("segmentRole") for r in result["regions"]], ["sharedStimulus", "questionBody"])
        shared, body = result["regions"]
        self.assertEqual(shared["signals"]["sharedQuestionRange"], [15, 16])
        self.assertTrue(shared["signals"]["graphicsDependencyDetected"])
        self.assertTrue(shared["signals"]["graphicsDependencyResolved"])
        doc, page = self.source_page(754)
        try:
            graph_bounds = fitz.Rect(83.3, 176.0, 281.5, 313.2)
            self.assertTrue(fitz.Rect(shared["rect"]).contains(graph_bounds))
            self.assertGreater(shared["signals"]["graphicsIncluded"], 0)
            self.assertLess(shared["rect"][3], body["rect"][1])
            self.assertEqual(body["signals"]["excludedGroupQuestions"], [16])
            body_text = " ".join(line["text"] for line in detector._text_lines(page)
                                 if fitz.Rect(body["rect"]).intersects(line["rect"]))
            self.assertIn("15.", body_text)
            self.assertNotIn("16.", body_text)
        finally:
            doc.close()

    def test_2011_equation_and_inferred_following_page_are_retained_for_review(self):
        result = self.detect("frq-2011-1-1220")
        first = next(r for r in result["regions"] if r["page"] == 1220)
        self.assertTrue(first["signals"]["referencedUpstreamDependencyResolved"])
        self.assertLessEqual(first["rect"][1], 277.6)
        continuation = [r for r in result["regions"] if r["page"] == 1221]
        self.assertTrue(continuation, "sequential part (g) on the next source page was not detected")
        self.assertTrue(all(r["manualReview"] for r in continuation))
        self.assertTrue(any(r["signals"].get("continuationPageInferredFromSubpartSequence") for r in continuation))
        self.assertTrue(result["manualReview"])
        doc, page = self.source_page(1221)
        try:
            table = fitz.Rect(176.0, 47.0, 447.0, 209.0)
            regions = [fitz.Rect(r["rect"]) for r in continuation if r.get("rect")]
            self.assertTrue(any(rect.contains(table) for rect in regions), "referenced boiling-point table is not covered")
        finally:
            doc.close()

    def test_2016_id_2019_source_conflict_stays_manual_without_metadata_mutation(self):
        question = self.by_id["frq-2016-1-385"]
        original = copy.deepcopy(question)
        result = self.detect(question["id"])
        self.assertTrue(result["manualReview"])
        self.assertTrue(any(r.get("signals", {}).get("sourceMetadataMismatch") for r in result["regions"]))
        self.assertEqual(question, original)

    def test_2010_example_is_preserved_as_question_response_guidance(self):
        result = self.detect("frq-2010-4-921")
        region = next(r for r in result["regions"] if r["page"] == 921)
        doc, page = self.source_page(921)
        try:
            lines = detector._text_lines(page)
            example_box = next(box for box in detector._visual_rects(page) if box.y0 > 230 and box.y1 < 430)
            self.assertTrue(fitz.Rect(region["rect"]).contains(example_box))
            self.assertIn("about the reaction", " ".join(line["text"] for line in lines
                                                           if fitz.Rect(region["rect"]).intersects(line["rect"])))
        finally:
            doc.close()
        self.assertNotIn(923, [r["page"] for r in result["regions"]],
                         "next-question subparts must not be mistaken for this FRQ's continuation")

    def test_no_phase2_proposal_is_automatically_applied(self):
        catalog = {"questions": [{"id": "x", "sourceRegions": [{"page": 1, "rect": [0, 0, 1, 1]}]}]}
        proposals = {"questions": [{"id": "x", "regions": [{"page": 1, "rect": [5, 6, 70, 80],
                      "confidenceBand": "high", "manualReview": False}]}]}
        updated, count = detector.apply_high_confidence(catalog, proposals)
        self.assertEqual(count, 0)
        self.assertEqual(updated, catalog)
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "should-not-exist.json"
            run = subprocess.run([sys.executable, str(ROOT / "research/detect_question_boundaries.py"),
                                  "--apply-high-confidence", "--catalog-output", str(output)],
                                 capture_output=True, text=True)
            self.assertEqual(run.returncode, 2)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
