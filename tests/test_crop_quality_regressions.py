"""Full-pipeline real-PDF crop-quality regressions; debugging cases, not holdout data."""
import importlib.util
import json
import re
import shutil
import unittest
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("crop_quality_detector", ROOT / "research/detect_question_boundaries.py")
DETECTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DETECTOR)
TARGETS = ["frq-2006-6-25", "mcq-2014-49-1464", "frq-2017-3-1157", "mcq-2002-7-606",
           "mcq-2002-5-606", "mcq-2002-6-606"]


class RealPdfCropQualityRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / "public/questions.json").read_text())
        cls.by_id = {q["id"]: q for q in cls.catalog["questions"]}
        pages = {int(p) for qid in TARGETS for p in cls.by_id[qid].get("pages", [])}
        windows = {p + delta for p in pages for delta in (-1, 0, 1)}
        subset = {**cls.catalog,
                  "questions": [q for q in cls.catalog["questions"]
                                if windows.intersection(map(int, q.get("pages", [])))]}
        cls.proposals = DETECTOR.detect(subset, ROOT / "public")
        cls.proposed_by_id = {q["id"]: q for q in cls.proposals["questions"]}

    def question(self, qid):
        return self.proposed_by_id[qid]

    def regions(self, qid, page):
        return [r for r in self.question(qid)["regions"] if r["page"] == page]

    def region(self, qid, page, role=None):
        regions = self.regions(qid, page)
        if role:
            regions = [r for r in regions if r.get("segmentRole") == role]
        self.assertTrue(regions, f"no region for {qid} on {page} role={role}")
        return regions[0]

    def source_page(self, page_number):
        source = next(s for s in self.catalog["sourceFiles"]
                      if int(s["from"]) <= page_number <= int(s["to"]))
        doc = fitz.open(ROOT / "public" / source["url"].lstrip("/"))
        return doc, doc.load_page(page_number - int(source["from"]))

    def crop_text(self, page_number, rect):
        doc, page = self.source_page(page_number)
        try:
            return page.get_textbox(fitz.Rect(rect))
        finally:
            doc.close()

    def test_2006_boxed_statement_and_next_page_continuation_are_included(self):
        p25 = self.region("frq-2006-6-25", 25)
        p26 = self.region("frq-2006-6-25", 26)
        text25 = self.crop_text(25, p25["rect"])
        text26 = self.crop_text(26, p26["rect"])
        self.assertIn("When water boils", text25)
        self.assertIn("form hydrogen molecules and oxygen molecules", text25)
        self.assertTrue(p25["signals"]["boxedStatementDependencyResolved"])
        self.assertIn("(d)", text26)
        self.assertGreater(p26["signals"]["graphicsIncluded"], 0)
        self.assertTrue(p25["signals"]["singleQuestionFullWidthOverride"])
        self.assertTrue(self.question("frq-2006-6-25")["manualReview"])  # Continuation page remains reviewed.
        self.assertLess(p25["rect"][3], 700)
        self.assertNotIn("Copyright", text25)
        self.assertNotIn("2006 AP", text25)
        doc, page = self.source_page(25)
        try:
            structures = [fitz.Rect(info["bbox"]) for info in page.get_image_info()]
            self.assertTrue(any(fitz.Rect(p25["rect"]).contains(box) for box in structures))
        finally:
            doc.close()
        doc, page = self.source_page(26)
        try:
            graphics = [fitz.Rect(info["bbox"]) for info in page.get_image_info()]
            self.assertTrue(any(fitz.Rect(p26["rect"]).intersects(box) for box in graphics))
        finally:
            doc.close()

    def test_2014_table_above_stem_and_all_choices_are_in_one_clean_region(self):
        region = self.region("mcq-2014-49-1464", 1464)
        text = self.crop_text(1464, region["rect"])
        for expected in ("Name", "Structural Formula", "Molar Mass", "Acetone", "1-propanol", "Butane",
                         "58.1", "60.1", "(A)", "(B)", "(C)", "(D)"):
            self.assertIn(expected, text)
        self.assertTrue(region["signals"]["tableDependencyResolved"])
        self.assertEqual(region["signals"]["tableDependencyGraphics"], 3)
        self.assertLess(region["rect"][1], 280)
        self.assertGreater(region["rect"][3], 660)
        self.assertNotIn("48. A 6.0 mol", text)
        doc, page = self.source_page(1464)
        try:
            crop = fitz.Rect(region["rect"])
            formula_images = [fitz.Rect(info["bbox"]) for info in page.get_image_info()
                              if fitz.Rect(info["bbox"]).y0 < 540 and fitz.Rect(info["bbox"]).width > 90]
            self.assertEqual(len(formula_images), 3)
            self.assertTrue(all(crop.contains(box) for box in formula_images))
        finally:
            doc.close()

    @unittest.skipUnless(shutil.which("tesseract"), "Tesseract is required for scanned-page geometry regression")
    def test_2017_scanned_frq_uses_ocr_bounds_and_excludes_response_lines_and_footer(self):
        p1157 = self.region("frq-2017-3-1157", 1157)
        p1158 = self.region("frq-2017-3-1157", 1158)
        self.assertTrue(p1157["signals"]["ocrUsed"])
        self.assertTrue(p1157["manualReview"])
        self.assertTrue(p1158["manualReview"])
        doc, page = self.source_page(1157)
        try:
            ocr = DETECTOR._ocr_scanned_lines(page)
            rect = fitz.Rect(p1157["rect"])
            texts = [line["text"] for line in ocr if rect.intersects(line["rect"])]
            self.assertTrue(any("3." in line and "ozone" in line.lower() for line in texts))
            self.assertTrue(any("graph" in line.lower() and "below" in line.lower() for line in texts))
            self.assertTrue(any("time" in line.lower() for line in texts))  # Graph axis label lies inside the crop.
            self.assertFalse(any("unauthorized" in line.lower() for line in texts))
            self.assertFalse(any("next page" in line.lower() for line in texts))
        finally:
            doc.close()
        doc, page = self.source_page(1158)
        try:
            ocr = DETECTOR._ocr_scanned_lines(page)
            relevant = [line for line in ocr if re.match(r"\((?:d|i{1,3}|iv)\)", line["text"].strip(), re.I)
                        or "support the rate law" in line["text"].lower()]
            self.assertGreaterEqual(len(relevant), 4)
            last_question_y = max(line["rect"].y1 for line in relevant)
            pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), colorspace=fitz.csGRAY, alpha=False)
            row_bytes = pix.width
            pixels = pix.samples
            x0, x1 = int(55 * 1.5), int(555 * 1.5)
            first_response_line = None
            for y in range(int((last_question_y + 10) * 1.5), pix.height - int(70 * 1.5)):
                row = pixels[y * row_bytes + x0:y * row_bytes + x1]
                if sum(value < 200 for value in row) > (x1 - x0) * .50:
                    first_response_line = y / 1.5
                    break
            self.assertIsNotNone(first_response_line, "expected scanned answer-writing rule below the last subpart")
            self.assertLess(p1158["rect"][3], first_response_line)
            self.assertGreater(p1158["rect"][3], last_question_y)
        finally:
            doc.close()

    def test_2002_shared_phase_diagram_is_a_separate_linked_segment_and_q7_excludes_q5_q6(self):
        q7 = self.question("mcq-2002-7-606")
        self.assertEqual(len(q7["regions"]), 2)
        shared = self.region("mcq-2002-7-606", 606, "sharedStimulus")
        body = self.region("mcq-2002-7-606", 606, "questionBody")
        shared_text = self.crop_text(606, shared["rect"])
        body_text = self.crop_text(606, body["rect"])
        self.assertTrue(shared["signals"]["sharedChoiceSequence"])
        self.assertEqual(shared["signals"]["sharedChoiceLabels"], list("ABCDE"))
        self.assertIn("Questions 5-7 refer", shared_text)
        for label in "ABCDE":
            self.assertRegex(shared_text, rf"\({label}\)")
        self.assertIn("pressure increases", body_text)
        doc, page = self.source_page(606)
        try:
            final_line = next(line for block in page.get_text("dict")["blocks"]
                              for line in block.get("lines", [])
                              if "processes occurs?" in "".join(span["text"] for span in line["spans"]))
            # The lower edge needs visible padding beyond the full final text-line box.
            self.assertGreaterEqual(body["rect"][3], final_line["bbox"][3] + 8)
        finally:
            doc.close()
        self.assertNotIn("temperature increases", body_text)
        self.assertNotIn("temperature decreases", body_text)
        self.assertTrue(body["signals"]["targetQuestionOnly"])
        self.assertEqual(body["signals"]["excludedGroupQuestions"], [5, 6])
        self.assertEqual(shared["sharedContextId"], body["sharedContextId"])
        self.assertLess(shared["rect"][3], body["rect"][1])
        self.assertTrue(shared["manualReview"] and body["manualReview"])
        for qid in ("mcq-2002-5-606", "mcq-2002-6-606"):
            self.assertEqual(self.region(qid, 606, "sharedStimulus")["sharedContextId"],
                             shared["sharedContextId"])


if __name__ == "__main__":
    unittest.main()
