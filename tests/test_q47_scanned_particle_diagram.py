"""Development regression for Q47's scanned two-column extraction failure."""
import copy
import json
import unittest
from pathlib import Path

import fitz

from research import detect_question_boundaries as detector


ROOT = Path(__file__).resolve().parents[1]


class Q47ScannedParticleDiagramRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / "public/questions.json").read_text())
        cls.question = next(q for q in cls.catalog["questions"]
                            if q["id"] == "mcq-2024-47-2105")
        cls.stimuli = json.loads((ROOT / "research/stimuli.json").read_text())
        cls.original_question = copy.deepcopy(cls.question)
        cls.result = detector.detect(
            {**cls.catalog, "questions": [cls.question]}, ROOT / "public", cls.stimuli
        )["questions"][0]
        cls.region = cls.result["regions"][0]

    def test_full_pipeline_recovers_scanned_diagram_stem_and_all_choice_markers(self):
        self.assertEqual(self.region["page"], 2105)
        x0, y0, x1, y1 = self.region["rect"]
        # Source-page visual bounds: particle figure/legend above the stem,
        # then the final target choice before Q48 starts below it.
        self.assertLessEqual(x0, 48)
        self.assertLessEqual(y0, 42)
        self.assertGreaterEqual(x1, 275)
        self.assertLess(x1, 305)  # excludes Q49 in the right column
        self.assertGreaterEqual(y1, 400)
        self.assertLess(y1, 425)  # excludes Q48 in the left column
        signals = self.region["signals"]
        self.assertTrue(signals["rasterGraphicsContextIncluded"])
        self.assertEqual(signals["graphicsIncluded"], 1)
        self.assertEqual(signals["answerChoiceLabels"], list("ABCD"))
        self.assertEqual(signals["answerChoiceMarkers"], 4)
        self.assertTrue(signals["answerChoiceSequence"])

    def test_catalog_mismatch_and_raster_source_require_manual_review_without_metadata_change(self):
        self.assertTrue(self.region["signals"]["catalogQuestionNumberMismatch"])
        self.assertTrue(self.region["signals"]["fullPageRaster"])
        self.assertTrue(self.region["manualReview"])
        self.assertTrue(self.result["manualReview"])
        self.assertEqual(self.question, self.original_question)
        updated, applied = detector.apply_high_confidence(
            {**self.catalog, "questions": [self.question]},
            {"questions": [self.result]},
        )
        self.assertEqual(applied, 0)
        self.assertEqual(updated["questions"][0]["pages"], [2105])
        self.assertEqual(updated["questions"][0]["fullText"], self.original_question["fullText"])

    def test_source_image_has_particle_diagram_and_crop_excludes_page_furniture(self):
        document = fitz.open(ROOT / "public/source/bank-08.pdf")
        try:
            page = document.load_page(4)  # catalog page 2105 / physical PDF page 5
            crop = fitz.Rect(self.region["rect"])
            self.assertTrue(crop.contains(fitz.Rect(52, 42, 276, 202)))
            # The source raster contains ink in the particle-diagram bounds.
            pix = page.get_pixmap(matrix=fitz.Matrix(1, 1), colorspace=fitz.csGRAY,
                                  clip=fitz.Rect(52, 42, 276, 202), alpha=False)
            self.assertGreater(sum(value < 150 for value in pix.samples), 1000)
            self.assertLess(crop.y1, 760)  # footer/GO ON/QR are below the crop
            self.assertLess(crop.x1, 305)  # Q49 is in the adjacent right column
            self.assertLess(crop.y1, 425)  # Q48 starts below the target
        finally:
            document.close()


if __name__ == "__main__":
    unittest.main()
