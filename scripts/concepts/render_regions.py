"""Render question crop regions and full source pages to PNG for visual classification.

Usage: uv run --no-project --with pymupdf==1.26.6 python -I scripts/concepts/render_regions.py JOB.json
JOB.json: [{"pdf": "public/source/bank-01.pdf", "page": 29 (1-based, within that PDF), "rect": [x0,y0,x1,y1] | null, "out": "path.png", "zoom": 2}]
"""
import json
import sys
from pathlib import Path

import fitz


def main(job_path):
    jobs = json.loads(Path(job_path).read_text(encoding="utf-8"))
    docs = {}
    failures = 0
    for job in jobs:
        out = Path(job["out"])
        if out.exists():
            continue
        try:
            doc = docs.setdefault(job["pdf"], fitz.open(job["pdf"]))
            page = doc[job["page"] - 1]
            clip = fitz.Rect(job["rect"]) & page.rect if job.get("rect") else page.rect
            out.parent.mkdir(parents=True, exist_ok=True)
            page.get_pixmap(matrix=fitz.Matrix(job.get("zoom", 2), job.get("zoom", 2)), clip=clip).save(out)
        except Exception as error:  # report and continue; a missing image blocks only that question
            failures += 1
            print(f"FAILED {out}: {error}", file=sys.stderr)
    print(f"rendered {len(jobs) - failures} of {len(jobs)} images")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
