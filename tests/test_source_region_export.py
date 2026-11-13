import importlib.util
import tempfile
import unittest
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("export_source_regions", ROOT / "research/export_source_regions.py")
EXPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORTER)


class SourceRegionExportTests(unittest.TestCase):
    def export_text(self, question_ids):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "sample.pdf"
            pages = EXPORTER.export_questions(ROOT, question_ids, output)
            with fitz.open(output) as doc:
                return pages, "\n".join(page.get_text() for page in doc)

    def test_single_shared_stimulus_mcq_is_independently_answerable(self):
        pages, text = self.export_text(["mcq-2008-1-29"])
        self.assertEqual(pages, 2)
        for fragment in ("Questions 1-3", "Noble gases", "Actinides", "most difficult to oxidize"):
            self.assertIn(fragment, text)

    def test_multiple_questions_emit_shared_stimulus_once(self):
        pages, text = self.export_text(["mcq-2008-1-29", "mcq-2008-2-29", "mcq-2008-3-29"])
        self.assertEqual(pages, 4)
        self.assertEqual(text.count("Questions 1-3"), 1)
        for fragment in ("most difficult to oxidize", "always radioactive", "most likely to form anions"):
            self.assertIn(fragment, text)

    def test_corrected_mcq_excludes_removed_question_notice(self):
        _, text = self.export_text(["mcq-2013-33-961"])
        self.assertIn("greatest accuracy", text)
        self.assertIn("100 mL volumetric flask", text)
        self.assertNotIn("Questions #34-36", text)

    def test_frq_export_retains_lettered_subparts(self):
        _, text = self.export_text(["frq-2005-1-6"])
        for fragment in ("Propanoic acid", "(a)", "(b)", "(c)", "(d)", "(e)"):
            self.assertIn(fragment, text)


if __name__ == "__main__":
    unittest.main()
