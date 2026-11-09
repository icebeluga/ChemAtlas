#!/usr/bin/env python3
"""Read-only geometry audit for ChemAtlas sourceRegions against bundled PDFs.

Coordinates are interpreted as PyMuPDF page coordinates in points, with a
top-left origin, matching the stored [x0, y0, x1, y1] rectangles. This script
checks geometry and source-page resolution only; it does not establish visual
completeness or alter catalog data.
"""
from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from pathlib import Path

import fitz


def audit(root: Path) -> dict:
    catalog = json.loads((root / "public/questions.json").read_text(encoding="utf-8"))
    segments = catalog["sourceFiles"]
    docs = []
    for segment in segments:
        path = root / "public" / segment["url"].lstrip("/")
        docs.append((segment, fitz.open(path) if path.exists() else None))

    errors: list[dict] = []
    warnings: list[dict] = []
    checked_regions = 0
    questions_with_regions = 0
    page_rotations = Counter()

    for question in catalog["questions"]:
        regions = question.get("sourceRegions")
        if not isinstance(regions, list) or not regions:
            errors.append({"id": question.get("id"), "code": "missing_source_regions"})
            continue
        questions_with_regions += 1
        for index, region in enumerate(regions):
            page_no = region.get("page")
            rect = region.get("rect")
            if not isinstance(page_no, int) or not isinstance(rect, list) or len(rect) != 4:
                errors.append({"id": question["id"], "region": index, "code": "malformed_region"})
                continue
            match = next(((seg, doc) for seg, doc in docs if seg["from"] <= page_no <= seg["to"]), None)
            if not match:
                errors.append({"id": question["id"], "region": index, "page": page_no, "code": "unmapped_page"})
                continue
            seg, doc = match
            if doc is None:
                errors.append({"id": question["id"], "region": index, "page": page_no, "code": "missing_pdf"})
                continue
            local_index = page_no - seg["from"]
            if not 0 <= local_index < doc.page_count:
                errors.append({"id": question["id"], "region": index, "page": page_no, "code": "segment_page_out_of_range", "local_index": local_index, "page_count": doc.page_count})
                continue
            page = doc.load_page(local_index)
            bounds = page.rect
            page_rotations[str(page.rotation)] += 1
            try:
                values = [float(v) for v in rect]
            except (TypeError, ValueError):
                errors.append({"id": question["id"], "region": index, "page": page_no, "code": "non_numeric_rect"})
                continue
            if not all(math.isfinite(v) for v in values):
                errors.append({"id": question["id"], "region": index, "page": page_no, "code": "non_finite_rect"})
                continue
            crop = fitz.Rect(values)
            if crop.is_empty or crop.is_infinite or crop.width <= 0 or crop.height <= 0:
                errors.append({"id": question["id"], "region": index, "page": page_no, "code": "non_positive_rect"})
                continue
            if not bounds.contains(crop):
                errors.append({"id": question["id"], "region": index, "page": page_no, "code": "out_of_bounds", "rect": values, "page_rect": [bounds.x0, bounds.y0, bounds.x1, bounds.y1]})
                continue
            checked_regions += 1
            if crop.width >= bounds.width * 0.98 and crop.height >= bounds.height * 0.85:
                warnings.append({"id": question["id"], "region": index, "page": page_no, "code": "near_full_page_crop", "rect_area_ratio": round(crop.get_area() / bounds.get_area(), 4)})

    segment_report = [{"url": s["url"], "from": s["from"], "to": s["to"], "available": d is not None, "pageCount": d.page_count if d is not None else None} for s, d in docs]
    for _, doc in docs:
        if doc is not None:
            doc.close()
    return {
        "coordinateConvention": "PyMuPDF points; top-left origin; [x0,y0,x1,y1]",
        "questions": len(catalog["questions"]),
        "questionsWithRegions": questions_with_regions,
        "regionsGeometryValid": checked_regions,
        "errors": errors,
        "warnings": warnings,
        "pageRotations": dict(page_rotations),
        "sourceSegments": segment_report,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = audit(args.root)
    payload = json.dumps(result, indent=2)
    if args.output:
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in {"errors", "warnings", "sourceSegments"}}, indent=2))
    print(f"sourceSegments={len(result['sourceSegments'])} errors={len(result['errors'])} warnings={len(result['warnings'])}")


if __name__ == "__main__":
    main()
