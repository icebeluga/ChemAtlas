#!/usr/bin/env python3
"""Suggest question-specific PDF crops using metadata, text layout, and page graphics.

The detector is deliberately conservative. It writes proposals and measured evidence; it
never mutates question metadata or the review manifest. Low-signal/scanned pages require
manual review and do not receive a fabricated full-page crop.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any

import fitz

MCQ_START = re.compile(r"^\s*(?:question\s*)?(\d{1,3})\s*[.)]?\s+(\S.*)$", re.I)
FRQ_START = re.compile(r"^\s*(?:question\s+)?(\d{1,2})\s*[.)]\s+(\S.*)$", re.I)
CHOICE = re.compile(r"^\s*\(?([A-E])(?:\)|[.)])\s+\S", re.I)
SUBPART = re.compile(r"^\s*(?:\(([a-h])\)|([a-h])[.)])\s+\S", re.I)
SUBPART_CONTINUATION = re.compile(r"^\s*(?:\(([a-h]|iv|vi{0,3}|ix|i{1,3})\)|([a-h]|iv|vi{0,3}|ix|i{1,3})[.)])\s+\S", re.I)
CONTEXT_CUE = re.compile(r"(?:equation|following|data|refer|table|graph|diagram|reaction|based on|information|use the|shown|figure|below|above|at 25|[=⇌↔→Δ]|K[a-z]|pH|\b\d+(?:\.\d+)?\s*(?:mol|M|kJ|kPa|atm|°C))", re.I)
UPSTREAM_DEPENDENCY_CUE = re.compile(
    r"\b(?:equation|reaction|expression|formula|statement|information|setup)\s+(?:shown\s+)?above\b|"
    r"\baccording\s+to\s+(?:the\s+)?(?:equation|reaction|expression|formula)\s+above\b|"
    r"\bbased\s+on\s+(?:the\s+)?(?:information|setup|equation|reaction)\s+above\b",
    re.I,
)
CHEMICAL_EXPRESSION = re.compile(r"(?:[=⇌↔→]|ΔH|\\Delta|\b(?:mol|kJ)\s*/|\b\d+\s*[A-Z][a-z]?(?:\([^)]*\))?)", re.I)
SHARED_GROUP = re.compile(r"^\s*questions?\s+(\d{1,3})\s*(?:-|–|to|through)\s*(\d{1,3})\s+(?:refer|use|are|will|should|answer|relate\s+to|are\s+based\s+on)\b", re.I)
PAGE_BOILERPLATE = re.compile(r"(?:GO ON TO THE NEXT PAGE|END OF EXAM|Copyright|©\s*(?:19|20)\d{2}|The College Board\. All rights reserved|(?:www\.|apcentral\.)?collegeboard\.com|Downloaded by\b|Scan to open on Studocu|lOMoARcPSD|messages\.(?:pdf_cover_qr_code_label|downloaded_by)|^\s*Version\s+[A-Z]\s*$)", re.I)
PAGE_FOOTER = re.compile(r"(?:GO ON TO THE NEXT PAGE|END OF EXAM|S\s*T\s*O\s*P|Copyright|©\s*(?:19|20)\d{2}|The College Board\. All rights reserved|collegeboard\.com|Web or Mass distribution prohibited|Unauthorized copying or reuse|Downloaded by\b|Scan to open on Studocu|lOMoARcPSD|messages\.(?:pdf_cover_qr_code_label|downloaded_by))", re.I)
PAGE_HEADER = re.compile(r"(?:Unit\s+\d+\s+Progress\s+Check|Test\s+Booklet|AP\s+Chemistry\s+20\d{2}.*Free[- ]Response\s+Questions|^\s*(?:19|20)\d{2}\s+AP\s*$|^\s*(?:19|20)\d{2}\s+AP\s*®?\s+CHEMISTRY\s+FREE[- ]RESPONSE\s+QUESTIONS.*$|^\s*®?\s*CHEMISTRY\s+FREE[- ]RESPONSE\s+QUESTIONS.*$|^\s*FREE[- ]RESPONSE\s+QUESTIONS\s*$|^\s*CHEMISTRY\s*$|^\s*SECTION\s+[IVX]+\s*$|^\s*\d+\s+Questions\s*$)", re.I)
QUESTION_INSTRUCTION = re.compile(
    r"^\s*Answer\s+Questions?\s+\d+(?:\s*[-–]\s*\d+)?\s+(?:below|in this part)\b.*(?:score weighting|percent|minutes?)?",
    re.I,
)
GENERIC_EXAM_INSTRUCTION = re.compile(
    r"\b(?:write your response in the space|examples and equations may be included|"
    r"for calculations, clearly show|you must show your work|pay attention to significant figures)\b",
    re.I,
)
MCQ_STEM_CUE = re.compile(
    r"^\s*(?:(?:question\s*)?\d{1,3}\s*[,.)]?\s*)?(?:which|what|how|why|calculate|determine|select|identify|estimate|predict|explain|write|consider|a\s+student|the\s+following|based\s+on)\b",
    re.I,
)


def _rect(value: Any) -> fitz.Rect | None:
    if value is None:
        return None
    try:
        box = fitz.Rect(value)
        if not box.is_empty and box.is_valid:
            return box
    except (TypeError, ValueError):
        pass
    return None


def _text_lines(page: fitz.Page) -> list[dict[str, Any]]:
    """Return line-level text and boxes in PyMuPDF's unrotated page coordinates."""
    result = []
    data = page.get_text("dict", sort=True)
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
            box = _rect(line.get("bbox"))
            if text and box:
                result.append({"text": text, "rect": box})
    return result


def _ocr_scanned_lines(page: fitz.Page, scale: float = 2.0,
                       clip: fitz.Rect | None = None, psm: int = 11) -> list[dict[str, Any]]:
    """Use bounded local OCR to estimate content boxes on image-only pages.

    OCR supports geometry only: low-native-text pages remain manual-review cases.
    The timeout and graceful fallback prevent a scan from stalling an audit batch.
    """
    if not shutil.which("tesseract"):
        return []
    try:
        png = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip, alpha=False).tobytes("png")
        run = subprocess.run(
            ["tesseract", "stdin", "stdout", "tsv", "--psm", str(psm)],
            input=png, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=15, check=True,
        )
    except (OSError, subprocess.SubprocessError, RuntimeError):
        return []
    grouped: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in run.stdout.decode("utf-8", errors="replace").splitlines()[1:]:
        fields = row.split("\t", 11)
        if len(fields) != 12 or fields[0] != "5" or not fields[11].strip():
            continue
        try:
            confidence = float(fields[10])
            x, y, w, h = (float(fields[i]) / scale for i in (6, 7, 8, 9))
            if clip:
                x += clip.x0
                y += clip.y0
        except ValueError:
            continue
        if confidence < 35 or w <= 0 or h <= 0:
            continue
        key = tuple(fields[i] for i in (2, 3, 4))
        grouped[key].append({"text": fields[11].strip(), "rect": fitz.Rect(x, y, x + w, y + h),
                             "confidence": confidence})
    # Tesseract can assign text from separate columns to one line. Split a
    # nominal OCR line at a page-scale horizontal gutter before recombining
    # words; otherwise stems and answer choices from neighboring questions can
    # become one unbounded line and defeat column detection.
    result = []
    gutter = max(32.0, page.rect.width * .055)
    for words in grouped.values():
        words.sort(key=lambda item: (item["rect"].x0, item["rect"].y0))
        clusters: list[list[dict[str, Any]]] = []
        for word in words:
            if not clusters or word["rect"].x0 - clusters[-1][-1]["rect"].x1 > gutter:
                clusters.append([word])
            else:
                clusters[-1].append(word)
        for cluster in clusters:
            box = cluster[0]["rect"]
            for word in cluster[1:]:
                box |= word["rect"]
            result.append({"text": " ".join(word["text"] for word in cluster), "rect": box,
                           "ocrConfidence": round(sum(word["confidence"] for word in cluster) / len(cluster), 1)})
    return result


def _raster_dependency_above(page: fitz.Page, anchor: dict[str, Any],
                             column: tuple[float, float], lines: list[dict[str, Any]],
                             requested: bool) -> fitz.Rect | None:
    """Measure a compact raster-content band above a referenced question stem.

    A full-page scan is not itself a graphic boundary. This projection-based
    estimate looks only in the target column and only above its numbered stem;
    it is used as a candidate region and always retains manual review.
    """
    if not requested or not _is_full_page_raster(page):
        return None
    x0, x1 = column
    y1 = anchor["rect"].y0 - 5
    prior_anchors = [item for item in _anchors(lines, "MCQ")
                     if item["rect"].y0 < anchor["rect"].y0
                     and x0 <= (item["rect"].x0 + item["rect"].x1) / 2 <= x1]
    y0 = max((item["rect"].y1 for item in prior_anchors), default=page.rect.y0) + (8 if prior_anchors else 0)
    if y1 - y0 < 18:
        return None
    scale = 1.0
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=fitz.Rect(x0, y0, x1, y1),
                          colorspace=fitz.csGRAY, alpha=False)
    samples = memoryview(pix.samples)
    row_counts = []
    for y in range(pix.height):
        start = y * pix.width
        row_counts.append(sum(samples[start + x] < 150 for x in range(pix.width)))
    threshold = max(4, int(pix.width * 0.012))
    active = [count >= threshold for count in row_counts]
    runs: list[tuple[int, int]] = []
    start = None
    last = None
    for i, value in enumerate(active):
        if value:
            if start is None:
                start = i
            last = i
        elif start is not None and i - last > 5:
            if last - start >= 12:
                runs.append((start, last))
            start = last = None
    if start is not None and last is not None and last - start >= 12:
        runs.append((start, last))
    if not runs:
        return None
    # Select the last compact content band before the stem; this avoids pulling
    # unrelated material from another column or a distant page header.
    top_px, bottom_px = runs[-1]
    active_cols = []
    for x in range(pix.width):
        count = sum(samples[y * pix.width + x] < 150 for y in range(top_px, bottom_px + 1))
        if count >= max(3, int((bottom_px - top_px + 1) * 0.025)):
            active_cols.append(x)
    if not active_cols:
        return None
    return fitz.Rect(x0 + active_cols[0] - 8, y0 + top_px - 8,
                     x0 + active_cols[-1] + 9, y0 + bottom_px + 9) & page.rect


def _content_lines(page: fitz.Page) -> tuple[list[dict[str, Any]], int, bool]:
    """Use OCR when native text is absent or consists mostly of page furniture."""
    native = _text_lines(page)
    native_chars = sum(len(line["text"]) for line in native)
    meaningful_chars = sum(len(line["text"]) for line in native
                           if not PAGE_BOILERPLATE.search(line["text"])
                           and not PAGE_HEADER.search(line["text"])
                           and not PAGE_FOOTER.search(line["text"]))
    if native_chars < 25 or meaningful_chars < 40:
        ocr = _ocr_scanned_lines(page)
        if ocr:
            return ocr, native_chars, True
    return native, native_chars, False


def _is_full_page_raster(page: fitz.Page) -> bool:
    bounds = page.rect * page.derotation_matrix if page.rotation else page.rect
    return any((box := _rect(image.get("bbox")))
               and box.width >= bounds.width * .90
               and box.height >= bounds.height * .90
               for image in page.get_image_info())


def _visual_rects(page: fitz.Page) -> list[fitz.Rect]:
    """Collect image placements and non-trivial vector drawing bounds."""
    found: list[fitz.Rect] = []
    try:
        for image in page.get_image_info(xrefs=True):
            box = _rect(image.get("bbox"))
            if box and box.width > 2 and box.height > 2:
                bounds = page.rect * page.derotation_matrix if page.rotation else page.rect
                # The scan itself is a page-sized image, not a measured
                # question graphic. Its pixel content is retained by the final
                # crop rectangle, but its page-wide bbox must not expand that
                # rectangle through response space and footer material.
                if box.width >= bounds.width * .90 and box.height >= bounds.height * .90:
                    continue
                found.append(box)
    except (AttributeError, RuntimeError):
        pass
    try:
        for drawing in page.get_drawings():
            box = _rect(drawing.get("rect"))
            if box and box.width > 4 and box.height > 4:
                found.append(box)
    except (AttributeError, RuntimeError):
        pass
    return found


def _columns(lines: list[dict[str, Any]], page_width: float,
             page_questions: list[dict[str, Any]] | None = None) -> list[tuple[float, float]]:
    """Infer one or two content columns from a large horizontal gutter."""
    # Existing crop metadata is a location estimate, not a final boundary. Across
    # the questions on a page, however, its repeated left/right placement is a
    # useful column signal and is more stable than line-center gaps on equations.
    hints = []
    hint_rects = []
    for item in page_questions or []:
        for region in item.get("sourceRegions", []):
            box = _rect(region.get("rect")) if region.get("rect") else None
            if box and box.width <= page_width * 0.68:
                hints.append((box.x0 + box.x1) / 2)
                hint_rects.append(box)
    # A lone catalog crop that occupies approximately one half-page is a
    # useful one-sided column prior. It prevents paragraph indents from
    # inventing a gutter through a long answer line when validation runs on a
    # bounded subset containing only the target question.
    if len(hint_rects) == 1 and page_width * .42 <= hint_rects[0].width <= page_width * .58:
        hint = hint_rects[0]
        split = page_width / 2
        overlap = min(16.0, page_width * .025)
        if hint.x1 <= split + page_width * .06:
            return [(0.0, split + overlap), (split - overlap, page_width)]
        if hint.x0 >= split - page_width * .06:
            return [(0.0, split + overlap), (split - overlap, page_width)]
    anchor_x = []
    for item in page_questions or []:
        number = int(item.get("number") or 0)
        kind = item.get("type", "MCQ")
        matching_anchors = [anchor for anchor in _anchors(lines, kind) if anchor["number"] == number]
        if matching_anchors:
            # Question numbers are often extracted as a tiny separate line at
            # the left margin while the stem begins at an indented x position.
            # Using the line midpoint can mistake those indents for columns.
            anchor_x.append(matching_anchors[0]["rect"].x0)
    positions = hints or anchor_x
    # On scans, a long stem line can create a false gutter inside a real
    # column. Numbered-question anchors provide a better split than arbitrary
    # OCR line extents (which vary with wrapping and interleaved columns).
    if not hints:
        detected = _anchors(lines, "MCQ")
        centers = sorted((item["rect"].x0 + item["rect"].x1) / 2 for item in detected)
        if len(centers) >= 2:
            gap, index = max(((centers[i + 1] - centers[i], i) for i in range(len(centers) - 1)),
                             default=(0.0, 0))
            split = (centers[index] + centers[index + 1]) / 2
            if gap >= page_width * .20 and page_width * .25 <= split <= page_width * .75:
                overlap = min(20.0, page_width * .025)
                return [(0.0, min(page_width, split + overlap)),
                        (max(0.0, split - overlap), page_width)]
    # If multiple cataloged question numbers begin at the same page margin,
    # treat that as positive evidence for one column. Paragraph indentation
    # gaps later on the page must not override the stable numbered anchors.
    if len(anchor_x) >= 2 and max(anchor_x) - min(anchor_x) <= page_width * .12 and not hints:
        return [(0.0, page_width)]
    if len(positions) >= 2:
        centers = sorted(positions)
        gap, index = max(((centers[i + 1] - centers[i], i) for i in range(len(centers) - 1)), default=(0, 0))
        if gap >= page_width * 0.20:
            split = (centers[index] + centers[index + 1]) / 2
            if page_width * 0.25 <= split <= page_width * 0.75:
                overlap = min(20.0, page_width * 0.025)
                return [(0.0, min(page_width, split + overlap)), (max(0.0, split - overlap), page_width)]
        # Several tight stored regions all on one side indicate a column even
        # when the opposite column has no catalog question on this page.
        if len(hints) >= 2 and max(centers) - min(centers) <= page_width * 0.20:
            center = sum(hints) / len(hints)
            if center < page_width * 0.45:
                return [(0.0, page_width / 2), (page_width / 2, page_width)]
            if center > page_width * 0.55:
                return [(0.0, page_width / 2), (page_width / 2, page_width)]
    # Paragraph starts form more reliable column clusters than line centers,
    # which vary with wrapping and can put a false gutter inside a long line.
    starts = sorted(line["rect"].x0 for line in lines if len(line["text"]) > 12)
    if len(starts) >= 8:
        gaps = [(starts[i + 1] - starts[i], i) for i in range(len(starts) - 1)]
        gap, index = max(gaps, default=(0, 0))
        left_count, right_count = index + 1, len(starts) - index - 1
        split = (starts[index] + starts[index + 1]) / 2
        if gap >= page_width * 0.18 and min(left_count, right_count) >= 3 and page_width * .24 <= split <= page_width * .76:
            overlap = min(20.0, page_width * 0.025)
            return [(0.0, min(page_width, split + overlap)), (max(0.0, split - overlap), page_width)]
    centers = sorted(line["rect"].x0 + line["rect"].width / 2 for line in lines if len(line["text"]) > 2)
    if len(centers) < 8:
        return [(0.0, page_width)]
    gaps = [(centers[i + 1] - centers[i], i) for i in range(len(centers) - 1)]
    gap, index = max(gaps, default=(0.0, 0))
    if gap < page_width * 0.16:
        return [(0.0, page_width)]
    split = (centers[index] + centers[index + 1]) / 2
    left, right = centers[: index + 1], centers[index + 1 :]
    # Reject a split that merely separates a short equation/table row from the page body.
    if min(len(left), len(right)) < 4 or right[0] - left[-1] < page_width * 0.16:
        return [(0.0, page_width)]
    return [(0.0, split), (split, page_width)]


def _column_for(x: float, columns: list[tuple[float, float]]) -> int:
    return min(range(len(columns)), key=lambda i: 0 if columns[i][0] <= x <= columns[i][1] else min(abs(x-columns[i][0]), abs(x-columns[i][1])))


def _source_quality_flags(page: fitz.Page, lines: list[dict[str, Any]]) -> list[str]:
    """Detect source markup that may reveal answers, independently of crop geometry."""
    choice_boxes = [line["rect"] for line in lines
                    if CHOICE.match(line["text"])
                    or re.match(r"^\s*\(?[A-E]\)?\s*[.)]?\s*$", line["text"], re.I)]
    flags: set[str] = set()
    try:
        for annot in page.annots() or []:
            kind = annot.type[1].lower()
            if kind in {"highlight", "underline", "strikeout", "squiggly", "ink", "freetext", "circle", "square", "polygon", "polyline"}:
                flags.add("answer_revealing_annotation")
                break
    except (AttributeError, RuntimeError):
        pass

    # Test-bank scoring keys use pale green bands over correct answer rows. Those
    # are vector fills rather than PDF annotations, so inspect filled rectangles too.
    try:
        for drawing in page.get_drawings():
            fill = drawing.get("fill")
            box = _rect(drawing.get("rect"))
            if not fill or not box or box.width < 80 or not 5 <= box.height <= 55:
                continue
            red, green, blue = (list(fill) + [0, 0, 0])[:3]
            is_answer_band = green >= 0.6 and green > red * 1.08 and green > blue * 1.08
            if is_answer_band and (not choice_boxes or any(box.intersects(choice) for choice in choice_boxes)):
                flags.add("colored_answer_key_marking")
                break
    except (AttributeError, RuntimeError):
        pass
    return sorted(flags)


def _source_years(lines: list[dict[str, Any]]) -> list[int]:
    years = set()
    for line in lines:
        source_line = re.search(r"(?:AP\s+CHEMISTRY|COLLEGE\s+BOARD|FREE[- ]RESPONSE|AP\s+EXAM)", line["text"], re.I)
        for match in (re.finditer(r"20\d{2}", line["text"]) if source_line else []):
            years.add(int(match.group(0)))
    return sorted(years)


def _is_page_number(line: dict[str, Any], bounds: fitz.Rect) -> bool:
    return (line["rect"].y0 >= bounds.y1 - 85
            and bool(re.fullmatch(r"\s*(?:\d{1,3}|-\d{1,3}-)\s*", line["text"])))


def _above_table_dependency(question: dict[str, Any], anchor: dict[str, Any],
                            lines: list[dict[str, Any]], visual: list[fitz.Rect],
                            columns: list[tuple[float, float]], column_index: int,
                            context_floor: float, page_width: float) -> dict[str, Any]:
    """Locate a table immediately above a stem that explicitly depends on it."""
    text = str(question.get("fullText") or "")
    if not re.search(r"\btable\s+(?:above|shown\s+above|on\s+the\s+previous\s+page)\b", text, re.I):
        return {"boxes": [], "lines": [], "resolved": False}
    col_x0, col_x1 = columns[column_index]
    center = (anchor["rect"].x0 + anchor["rect"].x1) / 2
    candidates = [box for box in visual
                  if box.width < page_width * .85
                  and box.height > 18
                  and box.y1 < anchor["rect"].y0
                  and box.y0 >= context_floor
                  and anchor["rect"].y0 - box.y1 <= 360
                  and col_x0 - 12 <= (box.x0 + box.x1) / 2 <= col_x1 + 12
                  and abs((box.x0 + box.x1) / 2 - center) <= page_width * .32]
    candidates.sort(key=lambda box: (box.y0, box.x0))
    clusters: list[list[fitz.Rect]] = []
    for box in candidates:
        if clusters:
            previous = clusters[-1][-1]
            same_column = abs((box.x0 + box.x1 - previous.x0 - previous.x1) / 2) <= 48
            if same_column and box.y0 - previous.y1 <= 46:
                clusters[-1].append(box)
                continue
        clusters.append([box])
    eligible = [cluster for cluster in clusters
                if len(cluster) >= 2
                and anchor["rect"].y0 - max(box.y1 for box in cluster) <= 100]
    if not eligible:
        return {"boxes": [], "lines": [], "resolved": False}
    cluster = max(eligible, key=lambda items: (len(items), max(box.y1 for box in items)))
    top = min(box.y0 for box in cluster) - 42
    bottom = max(box.y1 for box in cluster) + 5
    table_lines = [line for line in lines
                   if top <= line["rect"].y0 <= bottom
                   and col_x0 - 12 <= line["rect"].x0 + line["rect"].width / 2 <= col_x1 + 12
                   and not PAGE_BOILERPLATE.search(line["text"])
                   and not PAGE_HEADER.search(line["text"])]
    return {"boxes": cluster, "lines": table_lines, "resolved": True}


def _shared_group_segments(page: fitz.Page, question: dict[str, Any],
                           lines: list[dict[str, Any]], visual: list[fitz.Rect],
                           anchors: list[dict[str, Any]],
                           columns: list[tuple[float, float]], page_number: int,
                           source_quality_flags: list[str], source_years: list[int],
                           metadata_year: int | None, metadata_year_mismatch: bool) -> dict[str, Any] | None:
    """Split shared stimulus/choices from one target in a multi-question group."""
    expected = int(question.get("number") or 0)
    for line in lines:
        match = SHARED_GROUP.match(line["text"])
        if not match or not int(match.group(1)) <= expected <= int(match.group(2)):
            continue
        anchor = next((item for item in anchors if item["number"] == expected), None)
        if not anchor:
            continue
        column_index = _column_for((anchor["rect"].x0 + anchor["rect"].x1) / 2, columns)
        col_x0, col_x1 = columns[column_index]
        group_first, group_last = int(match.group(1)), int(match.group(2))
        group_anchors = sorted((item for item in anchors
                                if group_first <= item["number"] <= group_last
                                and _column_for((item["rect"].x0 + item["rect"].x1) / 2, columns) == column_index),
                               key=lambda item: item["rect"].y0)
        if not group_anchors:
            continue
        first_group_y = group_anchors[0]["rect"].y0
        context_lines = [item for item in lines
                         if line["rect"].y0 - 3 <= item["rect"].y0 < first_group_y - 2
                         and col_x0 - 16 <= item["rect"].x0 + item["rect"].width / 2 <= col_x1 + 16
                         and not PAGE_BOILERPLATE.search(item["text"])
                         and not PAGE_HEADER.search(item["text"])]
        shared_choices = [item for item in context_lines if _choice_match(item["text"])]
        shared_labels = []
        for item in shared_choices:
            choice = _choice_match(item["text"])
            if choice and choice.group(1).upper() not in shared_labels:
                shared_labels.append(choice.group(1).upper())
        context_visual = [box for box in visual
                          if line["rect"].y0 <= box.y0 < first_group_y
                          and box.y1 < first_group_y
                          and box.width < page.rect.width * .97
                          and col_x0 - 12 <= (box.x0 + box.x1) / 2 <= col_x1 + 12]
        shared_context_text = " ".join(item["text"] for item in context_lines)
        graphics_dependency = bool(re.search(
            r"\b(graph|figure|diagram|curve|spectrum|shown|illustrat)\b", shared_context_text, re.I
        ))
        raster_context = None
        if graphics_dependency and _is_full_page_raster(page):
            raster_context = _raster_dependency_above(
                page, group_anchors[0], columns[column_index], lines, requested=True
            )
            if raster_context:
                context_visual.append(raster_context)
        context_boxes = [item["rect"] for item in context_lines] + context_visual
        if not context_boxes:
            continue
        context_union = context_boxes[0]
        for box in context_boxes[1:]:
            context_union |= box
        context_rect = fitz.Rect(max(col_x0, context_union.x0 - 12),
                                 max(page.rect.y0, line["rect"].y0 - 8),
                                 min(col_x1, context_union.x1 + 26),
                                 min(page.rect.y1, context_union.y1 + 8))

        later_group = next((item for item in group_anchors if item["rect"].y0 > anchor["rect"].y0), None)
        stop_y = later_group["rect"].y0 - 4 if later_group else page.rect.y1 - 24
        footer_y = min((item["rect"].y0 for item in lines
                        if PAGE_FOOTER.search(item["text"]) and item["rect"].y0 > page.rect.y1 - 170),
                       default=page.rect.y1 - 40)
        stop_y = min(stop_y, footer_y)
        catalog_words = set(re.findall(r"[a-z0-9]+", str(question.get("fullText") or "").lower()))
        body_lines = [item for item in lines
                      if anchor["rect"].y0 - 3 <= item["rect"].y0 < stop_y
                      and col_x0 - 16 <= item["rect"].x0 + item["rect"].width / 2 <= col_x1 + 16
                      and not PAGE_BOILERPLATE.search(item["text"])
                      and not _is_page_number(item, page.rect)
                      and (lambda words: bool(words) and len(words & catalog_words) / len(words) >= .55)(
                          set(re.findall(r"[a-z0-9]+", item["text"].lower())))]
        if not body_lines:
            continue
        body_union = body_lines[0]["rect"]
        for item in body_lines[1:]:
            body_union |= item["rect"]
        body_rect = fitz.Rect(max(col_x0, body_union.x0 - 8), max(page.rect.y0, anchor["rect"].y0 - 4),
                              min(col_x1, body_union.x1 + 8), min(page.rect.y1, stop_y - 5,
                                                                   body_union.y1 + 18))
        stimulus_id = hashlib.sha256(
            f"{question.get('source','')}:{page_number}:{group_first}-{group_last}:{match.group(0).lower()}".encode()
        ).hexdigest()[:16]
        full_page_raster = _is_full_page_raster(page)
        complete_choices = _complete_choice_sequence(shared_labels)
        unresolved = (bool(shared_choices) and not complete_choices) or (graphics_dependency and not context_visual)
        manual = (unresolved or full_page_raster or bool(source_quality_flags) or metadata_year_mismatch)
        reasons = [f"Shared context for Questions {group_first}–{group_last} is emitted as a separate ordered segment from the target stem."]
        if unresolved:
            reasons.append("The shared answer-choice set was not complete in the detected stimulus segment; manual review is required.")
        if full_page_raster:
            reasons.append("A full-page raster underlies this page; OCR estimates boundaries, but visual review remains required.")
        if source_quality_flags:
            reasons.append("The source contains answer-revealing markings; use a clean source before approval.")
        if metadata_year_mismatch:
            reasons.append(f"Source year(s) {source_years} differ from catalog year {metadata_year}; verify provenance.")
        shared_region = {
            "page": page_number, "rect": [round(v, 2) for v in context_rect],
            "segmentRole": "sharedStimulus", "sharedContextId": stimulus_id, "segmentOrder": 1,
            "confidence": 0.72 if complete_choices else 0.46,
            "confidenceBand": "medium" if complete_choices else "low", "manualReview": manual,
            "signals": {"sharedQuestionRange": [group_first, group_last],
                        "sharedChoiceLabels": shared_labels, "sharedChoiceSequence": complete_choices,
                        "graphicsExpected": graphics_dependency or bool(shared_choices),
                        "graphicsIncluded": len(context_visual),
                        "graphicsDependencyDetected": graphics_dependency,
                        "graphicsDependencyResolved": bool(context_visual) if graphics_dependency else None,
                        "fullPageRaster": full_page_raster, "questionStemContamination": False,
                        "sourceQualityFlags": source_quality_flags, "sourceYears": source_years,
                        "catalogYear": metadata_year, "sourceMetadataMismatch": metadata_year_mismatch,
                        "contentDependencyResolved": not unresolved},
            "reasons": reasons,
        }
        body_manual = (not body_lines or full_page_raster or bool(source_quality_flags) or metadata_year_mismatch)
        body_region = {
            "page": page_number, "rect": [round(v, 2) for v in body_rect],
            "segmentRole": "questionBody", "sharedContextId": stimulus_id, "segmentOrder": 2,
            "confidence": 0.68 if body_lines else 0.2,
            "confidenceBand": "medium" if body_lines else "low", "manualReview": body_manual,
            "signals": {"questionStartFound": True, "targetQuestionOnly": True,
                        "excludedGroupQuestions": [item["number"] for item in group_anchors if item["number"] != expected],
                        "textCharacters": sum(len(item["text"]) for item in body_lines),
                        "fullPageRaster": full_page_raster, "sourceQualityFlags": source_quality_flags,
                        "sourceYears": source_years, "catalogYear": metadata_year,
                        "sourceMetadataMismatch": metadata_year_mismatch,
                        "contentDependencyResolved": not unresolved},
            "reasons": reasons,
        }
        return {"region": shared_region, "additionalRegions": [body_region]}
    return None


def _subpart_sequence(labels: list[str]) -> bool:
    roman = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8, "ix": 9, "x": 10}
    values = [ord(label) if len(label) == 1 and label.isalpha() else roman.get(label) for label in labels]
    return len(values) >= 1 and all(value is not None for value in values) and all(
        right == left + 1 for left, right in zip(values, values[1:]))


def _choice_match(text: str) -> re.Match[str] | None:
    return CHOICE.match(text) or re.match(r"^\s*\(?([A-E])\)?\s*[.)]?\s*$", text, re.I)


def _complete_choice_sequence(labels: list[str], expected_count: int = 0) -> bool:
    """Check that all expected choice labels are present, independent of PDF text order.

    Some PDFs encode answer labels and answer text as separate positioned objects; the
    extracted text order can therefore be A, C, D, B even when the printed page is
    correctly laid out. Geometry handles crop boundaries, while this signal checks
    completeness rather than trusting that unreliable serialization order.
    """
    unique = set(labels)
    count = expected_count or (len(unique) if len(unique) in {4, 5} else 0)
    return count in {4, 5} and unique == set("ABCDE"[:count])


def _anchors(lines: list[dict[str, Any]], question_type: str) -> list[dict[str, Any]]:
    pattern = re.compile(r"^\s*(?:question\s*)?(\d{1,3})\s*[.)]\s*(.*)$", re.I) if question_type == "MCQ" else FRQ_START
    found = []
    for line in lines:
        match = pattern.match(line["text"])
        if not match:
            continue
        if question_type == "FRQ" and re.fullmatch(r"[_ .…-]{3,}", match.group(2).strip()):
            continue
        number = int(match.group(1))
        # A decimal table cell such as 58.1 can resemble question 58 with
        # remainder "1" because the anchor regex accepts a missing separator.
        if question_type == "MCQ" and re.fullmatch(r"\s*\d{1,3}\.\d+\s*", line["text"]):
            continue
        # AP MCQ questions usually range 1–75; open-response pages use a short sequence.
        if question_type == "MCQ" and not 1 <= number <= 100:
            continue
        if question_type == "FRQ" and not 1 <= number <= 20:
            continue
        found.append({"number": number, "rect": line["rect"], "text": line["text"]})
    return found


def _shared_context_only(page: fitz.Page, question: dict[str, Any], lines: list[dict[str, Any]],
                         anchors: list[dict[str, Any]], visual: list[fitz.Rect],
                         page_number: int, source_quality_flags: list[str],
                         source_years: list[int], metadata_year: int | None,
                         metadata_year_mismatch: bool) -> dict[str, Any] | None:
    """Bound a shared stimulus when the requested MCQ body is on another page."""
    expected = int(question.get("number") or 0)
    for line in lines:
        match = SHARED_GROUP.match(line["text"])
        if not match:
            continue
        first, last = int(match.group(1)), int(match.group(2))
        if not first <= expected <= last:
            continue
        group_anchors = sorted((a for a in anchors if first <= a["number"] <= last),
                               key=lambda a: (a["rect"].y0, a["rect"].x0))
        if not group_anchors:
            continue
        first_body = group_anchors[0]["rect"].y0
        context_lines = [item for item in lines
                         if line["rect"].y0 - 3 <= item["rect"].y0 < first_body - 2
                         and not PAGE_BOILERPLATE.search(item["text"])
                         and not PAGE_HEADER.search(item["text"])
                         and not PAGE_FOOTER.search(item["text"])
                         and not _is_page_number(item, page.rect)]
        boxes = [item["rect"] for item in context_lines]
        # Keep local vector/image content; a scanned full-page raster is not a
        # usable context boundary and must not turn this segment into a page crop.
        full_raster = _is_full_page_raster(page)
        boxes.extend(box for box in visual if not full_raster
                     and box.y0 >= line["rect"].y0 - 8 and box.y1 < first_body - 2
                     and box.width < page.rect.width * .97)
        if not boxes:
            continue
        union = boxes[0]
        for box in boxes[1:]:
            union |= box
        # The shared-table source is often a single page raster, so OCR boxes
        # stop at row text rather than table borders. Give the detected last
        # row enough visual padding to retain the closing rule.
        candidate = _expand(union, 12, 12, page.rect)
        earlier_group_questions = [a["number"] for a in group_anchors if a["number"] < expected]
        context_id = hashlib.sha256(
            f"{question.get('source','')}:{page_number}:{first}-{last}:{match.group(0).lower()}".encode()
        ).hexdigest()[:16]
        return {
            "page": page_number, "rect": [round(v, 2) for v in candidate],
            "segmentRole": "sharedStimulus", "sharedContextId": context_id, "segmentOrder": 1,
            "confidence": 0.42, "confidenceBand": "low", "manualReview": True,
            "extractionStatus": "context-only",
            "signals": {"sharedQuestionRange": [first, last], "sharedContextOnly": True,
                        "questionStartFound": False, "targetQuestionFound": False,
                        "precedingGroupQuestionNumbers": earlier_group_questions,
                        "fullPageRaster": full_raster, "sourceQualityFlags": source_quality_flags,
                        "sourceYears": source_years, "catalogYear": metadata_year,
                        "sourceMetadataMismatch": metadata_year_mismatch,
                        "pageAssociationUnresolved": True},
            "reasons": [
                f"Shared context for Questions {first}–{last} is bounded separately; the requested question body was not found on this page.",
                "Search adjacent source pages and verify the page association before approval.",
            ] + (["The scanned source requires visual review; OCR is used for geometry only."] if full_raster else []),
        }
    return None


def _mcq_stem_candidates(lines: list[dict[str, Any]], page_width: float) -> list[dict[str, Any]]:
    """Find question-like OCR/text blocks, including stems whose number OCR failed."""
    candidates = []
    for line in lines:
        text = line["text"].strip()
        if PAGE_BOILERPLATE.search(text) or PAGE_HEADER.search(text) or PAGE_FOOTER.search(text):
            continue
        if MCQ_STEM_CUE.match(text):
            number = None
            anchor_match = re.match(r"^\s*(?:question\s*)?(\d{1,3})\s*[,.)]\s*", text, re.I)
            if anchor_match:
                number = int(anchor_match.group(1))
            candidates.append({"text": text, "rect": line["rect"], "number": number})
    if len(candidates) < 2:
        return candidates
    centers = sorted((item["rect"].x0 + item["rect"].x1) / 2 for item in candidates)
    gaps = [(centers[i + 1] - centers[i], i) for i in range(len(centers) - 1)]
    gap, split_index = max(gaps, default=(0.0, 0))
    if gap >= page_width * .20:
        split = (centers[split_index] + centers[split_index + 1]) / 2
        for item in candidates:
            item["column"] = 0 if (item["rect"].x0 + item["rect"].x1) / 2 < split else 1
        candidates.sort(key=lambda item: (item["column"], item["rect"].y0, item["rect"].x0))
        candidates[0]["columnBounds"] = (0.0, split)
        candidates[0]["columnSplit"] = split
        for item in candidates[1:]:
            item["columnBounds"] = (0.0, split) if item["column"] == 0 else (split, page_width)
            item["columnSplit"] = split
    else:
        candidates.sort(key=lambda item: (item["rect"].y0, item["rect"].x0))
        for item in candidates:
            item["column"] = 0
            item["columnBounds"] = (0.0, page_width)
            item["columnSplit"] = None
    return candidates


def _adjacent_shared_question_candidate(page: fitz.Page, question: dict[str, Any],
                                        group_region: dict[str, Any], page_number: int,
                                        page_questions: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Propose a manual-only body crop by sequence when shared-group OCR spans pages."""
    lines, native_chars, ocr_used = _content_lines(page)
    if not lines:
        return None
    expected = int(question.get("number") or 0)
    group_first, group_last = group_region["signals"]["sharedQuestionRange"]
    prior_numbers = group_region["signals"].get("precedingGroupQuestionNumbers", [])
    ordinal = expected - group_first - len(prior_numbers)
    if ordinal < 0 or expected > group_last:
        return None
    candidates = _mcq_stem_candidates(lines, page.rect.width)
    if ordinal >= len(candidates):
        return None
    chosen = candidates[ordinal]
    same_column = [item for item in candidates if item["column"] == chosen["column"]]
    later = [item for item in same_column if item["rect"].y0 > chosen["rect"].y0 + 3]
    next_y = min((item["rect"].y0 for item in later), default=page.rect.y1 - 35)
    col_x0, col_x1 = chosen["columnBounds"]
    start_y = max(page.rect.y0, chosen["rect"].y0 - 7)
    body_lines = [line for line in lines
                  if col_x0 - 6 <= (line["rect"].x0 + line["rect"].x1) / 2 <= col_x1 + 6
                  and start_y <= line["rect"].y0 < next_y - 3
                  and not PAGE_BOILERPLATE.search(line["text"])
                  and not PAGE_HEADER.search(line["text"])
                  and not PAGE_FOOTER.search(line["text"])
                  and not _is_page_number(line, page.rect)]
    if not body_lines:
        return None
    footer_y = min((line["rect"].y0 for line in lines
                    if PAGE_FOOTER.search(line["text"]) and line["rect"].y0 > page.rect.y1 - 220),
                   default=page.rect.y1 - 35)
    bottom = min(next_y - 7, footer_y - 5)
    body_lines = [line for line in body_lines if line["rect"].y0 < bottom]
    if not body_lines:
        return None
    union = body_lines[0]["rect"]
    for line in body_lines[1:]:
        union |= line["rect"]
    # Full-page scan imagery carries the diagrams, if any. Bound its retained
    # area to this question column. Trim its bottom edge to measured content
    # rather than carrying blank answer space or the page footer along. Since
    # raster graphics cannot be separated safely from the scan here, keep the
    # proposal manual and report that limitation explicitly.
    if _is_full_page_raster(page):
        content_bottom = min(bottom, union.y1 + 12)
        # The right-column stem number may sit close to the inferred gutter;
        # use a smaller gutter inset there so the first digit is retained.
        column_inset = 24 if chosen.get("column", 0) == 0 else 4
        candidate = fitz.Rect(max(page.rect.x0, col_x0 + column_inset), start_y,
                              min(page.rect.x1, col_x1 - 5), max(start_y + 12, content_bottom))
    else:
        local_visual = [box for box in _visual_rects(page)
                        if box.y1 >= start_y and box.y0 < bottom
                        and col_x0 <= (box.x0 + box.x1) / 2 <= col_x1]
        for box in local_visual:
            union |= box
        candidate = _expand(union, 10, 7, page.rect)
    crop_text = " ".join(line["text"] for line in body_lines)
    choice_rows = []
    for line in body_lines:
        label_match = re.match(r"^\s*\(?([A-E])\s*[).]\s*\S", line["text"], re.I)
        sample_match = re.match(r"^\s*Sample\s*(?:([1-5])\b|([|Il])(?=\s|$))", line["text"], re.I)
        if label_match or sample_match:
            choice_rows.append((line, label_match.group(1).upper() if label_match else None,
                                (sample_match.group(1) or sample_match.group(2)) if sample_match else None))
    # Preserve source order; OCR occasionally loses a B label while retaining
    # its answer text, so a four-row A, unlabeled, C, D sequence is represented
    # as A–D but remains manual because the page is scanned.
    choice_rows.sort(key=lambda item: (item[0]["rect"].y0, item[0]["rect"].x0))
    labels = [item[1] for item in choice_rows if item[1]]
    if len(choice_rows) == 4 and labels == ["A", "C", "D"]:
        labels = ["A", "B", "C", "D"]
    option_content = []
    for _, label, sample in choice_rows:
        if sample:
            option_content.append("1" if sample in {"|", "I", "l"} and label == "A" else sample)
    option_content_complete = option_content[:4] == ["1", "2", "3", "4"]
    choice_sequence = labels[:4] == list("ABCD") or option_content_complete
    catalog_text = str(question.get("fullText") or "")
    catalog_tokens = set(re.findall(r"[a-z0-9]+", catalog_text.lower()))
    stem_tokens = set(re.findall(r"[a-z0-9]+", chosen["text"].lower()))
    stem_match = bool(stem_tokens) and len(stem_tokens & catalog_tokens) / len(stem_tokens) >= .60
    expected_number_exact = chosen.get("number") == expected
    group_context_verified = bool(group_first <= expected <= group_last and prior_numbers)
    metadata_matches = expected_number_exact and stem_match
    manual = True  # OCR/scanned-page and association candidates are never auto-approved.
    confidence = 0.36 if metadata_matches and choice_sequence and group_context_verified else 0.18
    return {
        "page": page_number, "rect": [round(v, 2) for v in candidate],
        "segmentRole": "questionBody", "sharedContextId": group_region.get("sharedContextId"),
        "segmentOrder": 2, "confidence": confidence, "confidenceBand": "low",
        "manualReview": manual, "extractionStatus": "candidate-needs-manual-verification",
        "priorRect": None,
        "signals": {
            "questionStartFound": expected_number_exact, "questionNumberExactMatch": expected_number_exact,
            "candidateQuestionNumber": chosen.get("number"), "groupOrderCandidate": True,
            "groupSequenceOrdinal": ordinal, "sharedQuestionRange": [group_first, group_last],
            "neighboringQuestionContextVerified": group_context_verified,
            "catalogStemContentMatch": stem_match, "catalogStemTokenCoverage": round(
                len(stem_tokens & catalog_tokens) / len(stem_tokens), 3) if stem_tokens else 0.0,
            "answerChoiceMarkers": len(choice_rows), "answerChoiceLabels": labels,
            "answerChoiceSequence": choice_sequence, "answerOptionContent": option_content[:4],
            "textCharacters": sum(len(line["text"]) for line in body_lines),
            "nativeTextCharacters": native_chars, "ocrUsed": ocr_used,
            "fullPageRaster": _is_full_page_raster(page), "columnCount": 2 if chosen.get("columnSplit") else 1,
            "rasterGraphicsUnverified": _is_full_page_raster(page),
            "sourceQualityFlags": _source_quality_flags(page, lines),
            # No source-year conflict was observed here; the discrepancy is
            # specifically the catalog page association (tracked separately).
            "sourceMetadataMismatch": False, "catalogPageAssociationMismatch": True,
            "catalogSourcePages": sorted({int(p) for p in (question.get("pages") or [])}),
            "detectedSourcePage": page_number,
        },
        "reasons": [
            "The target body is absent from its catalog page; this adjacent-page proposal follows the declared shared-question sequence.",
            "The scan/OCR or catalog text did not independently confirm the target number and stem; manual verification is required.",
        ] + (["The page is a full-page raster; inspect the original scan for any non-text graphics not measured by OCR."]
             if _is_full_page_raster(page) else []) + (["All four answer-option contents were detected in order."] if option_content_complete else
             (["OCR did not confirm a complete A–D answer-choice sequence; inspect the scan manually."] if not choice_sequence else [])),
    }


def _stimulus_context(question: dict[str, Any], stimuli: dict[str, Any], page_number: int) -> list[fitz.Rect]:
    rects = []
    for stimulus_id in question.get("stimulusIds", []):
        stimulus = stimuli.get(stimulus_id, {})
        for region in stimulus.get("regions", []):
            if region.get("page") == page_number:
                box = _rect(region.get("rect"))
                if box:
                    rects.append(box)
    return rects


def _expand(box: fitz.Rect, dx: float, dy: float, bounds: fitz.Rect) -> fitz.Rect:
    return fitz.Rect(max(bounds.x0, box.x0 - dx), max(bounds.y0, box.y0 - dy), min(bounds.x1, box.x1 + dx), min(bounds.y1, box.y1 + dy))


def _previous_page_shared_group(page: fitz.Page, expected: int, page_number: int) -> dict[str, Any] | None:
    """Return a measured prior-page stimulus region when a numbered group spans pages."""
    bounds = page.rect * page.derotation_matrix if page.rotation else page.rect
    lines = _text_lines(page)
    groups = []
    for line in lines:
        match = SHARED_GROUP.match(line["text"])
        if match and int(match.group(1)) <= expected <= int(match.group(2)):
            groups.append({"first": int(match.group(1)), "last": int(match.group(2)), "rect": line["rect"]})
    if not groups:
        return None
    group = max(groups, key=lambda item: item["rect"].y0)
    anchors = [anchor for anchor in _anchors(lines, "MCQ")
               if group["first"] <= anchor["number"] <= group["last"]
               and anchor["rect"].y0 > group["rect"].y0]
    stop_y = min((anchor["rect"].y0 for anchor in anchors), default=bounds.y1 - 48) - 8
    footer_y = min((line["rect"].y0 for line in lines
                    if PAGE_FOOTER.search(line["text"]) and line["rect"].y0 > group["rect"].y0),
                   default=bounds.y1 - 32)
    stop_y = min(stop_y, footer_y - 4)
    band = fitz.Rect(bounds.x0, max(bounds.y0, group["rect"].y0 - 8), bounds.x1, max(group["rect"].y1 + 1, stop_y))
    content = [line["rect"] for line in lines
               if line["rect"].intersects(band) and not PAGE_BOILERPLATE.search(line["text"])]
    graphics = [box for box in _visual_rects(page)
                if box.intersects(band) and box.width < bounds.width * .98]
    boxes = content + graphics
    if not boxes:
        return None
    union = boxes[0]
    for box in boxes[1:]:
        union |= box
    candidate = _expand(union, 18, 10, bounds)
    return {
        "page": page_number,
        "rect": [round(value, 2) for value in candidate],
        "confidence": 0.58,
        "confidenceBand": "medium",
        "manualReview": True,
        "signals": {
            "textCharacters": sum(len(line["text"]) for line in lines if line["rect"].intersects(candidate)),
            "pageTextCharacters": sum(len(line["text"]) for line in lines),
            "questionStartFound": False,
            "nextQuestionBoundaryFound": bool(anchors),
            "graphicsIncluded": len(graphics),
            "linkedStimulusRegions": 1,
            "sharedQuestionGroupDetected": True,
            "previousPageSharedGroupDetected": True,
            "sharedQuestionRange": [group["first"], group["last"]],
            "pageRotation": int(page.rotation),
        },
        "reasons": [
            f"A shared context block for Questions {group['first']}–{group['last']} was measured on the immediately preceding catalog page.",
            "The cross-page context is retained as a separate segment and requires manual review.",
        ],
    }


def analyze_page(page: fitz.Page, question: dict[str, Any], region: dict[str, Any] | None,
                 page_questions: list[dict[str, Any]], stimuli: dict[str, Any],
                 page_number: int) -> dict[str, Any]:
    bounds = page.rect * page.derotation_matrix if page.rotation else page.rect
    lines, native_text_chars, ocr_used = _content_lines(page)
    visual = _visual_rects(page)
    text_chars = sum(len(line["text"]) for line in lines)
    question_type = question.get("type", "MCQ")
    qid = str(question.get("id") or "").lower()
    id_type_prefix = "MCQ" if qid.startswith("mcq-") else ("FRQ" if qid.startswith("frq-") else None)
    question_id_type_mismatch = bool(id_type_prefix and id_type_prefix != str(question_type).upper())
    source_quality_flags = _source_quality_flags(page, lines)
    source_years = _source_years(lines)
    try:
        metadata_year = int(question.get("year")) if question.get("year") else None
    except (TypeError, ValueError):
        metadata_year = None
    metadata_year_mismatch = bool(metadata_year and source_years and metadata_year not in source_years)
    prior = _rect((region or {}).get("rect"))
    anchors = _anchors(lines, question_type)
    columns = _columns(lines, bounds.width, page_questions)
    single_frq_anchor_wide_source = bool(
        question_type == "FRQ" and prior and prior.width >= bounds.width * .80
        and sum(1 for item in anchors if 1 <= item["number"] <= 20) == 1
    )
    if single_frq_anchor_wide_source:
        # A single FRQ question can use both sides of the sheet for equations,
        # boxed statements, or diagrams. Paragraph indentation can look like a
        # false column split, so trust the one numbered anchor plus the broad prior.
        columns = [(bounds.x0, bounds.x1)]
    prior_center = (prior.x0 + prior.x1) / 2 if prior else bounds.width / 2
    expected = int(question.get("number") or 0)
    matching = [a for a in anchors if a["number"] == expected]
    if prior:
        matching.sort(key=lambda a: abs(a["rect"].y0 - prior.y0) + abs((a["rect"].x0+a["rect"].x1)/2-prior_center))
    elif matching:
        matching.sort(key=lambda a: abs((a["rect"].x0+a["rect"].x1)/2-prior_center))
    anchor = matching[0] if matching else None

    # Sparse OCR over a two-column scan often interleaves words from both
    # columns. Once the target column is known, OCR that column as a text block
    # so stems and answer choices are measured together and not clipped by a
    # false gutter inferred from individual OCR lines.
    if (anchor and question_type == "MCQ" and ocr_used and _is_full_page_raster(page)):
        target_column = _column_for((anchor["rect"].x0 + anchor["rect"].x1) / 2, columns)
        clip = fitz.Rect(columns[target_column][0], bounds.y0,
                         columns[target_column][1], bounds.y1)
        column_ocr = _ocr_scanned_lines(page, scale=3.0, clip=clip, psm=6)
        if column_ocr:
            lines = [line for line in lines
                     if not columns[target_column][0] <= line["rect"].x0 + line["rect"].width / 2 <= columns[target_column][1]]
            lines.extend(column_ocr)
            anchors = _anchors(lines, question_type)
            columns = _columns(lines, bounds.width, page_questions)
            matching = [item for item in anchors if item["number"] == expected]
            if prior:
                matching.sort(key=lambda item: abs(item["rect"].y0 - prior.y0)
                              + abs((item["rect"].x0 + item["rect"].x1) / 2 - prior_center))
            anchor = matching[0] if matching else None
            text_chars = sum(len(line["text"]) for line in lines)
            source_quality_flags = _source_quality_flags(page, lines)
            source_years = _source_years(lines)

    # If catalog metadata is incomplete, accept a numbered line only when uniquely inside
    # the stored estimate. This avoids guessing from page-wide numbering in tables.
    if anchor is None and prior:
        nearby = [a for a in anchors if prior.x0 - 30 <= a["rect"].x0 <= prior.x1 + 30 and prior.y0 - 100 <= a["rect"].y0 <= prior.y1]
        if len(nearby) == 1 and (not expected or nearby[0]["number"] == expected):
            anchor = nearby[0]
    # A correctly recognized stem on a scanned response sheet still needs the
    # same gap-based segmentation as a continuation page.
    response_start = None
    if anchor and question_type == "FRQ" and prior and ocr_used and _is_full_page_raster(page):
        response_start = next((line for line in lines
                               if line["rect"].y1 <= anchor["rect"].y0
                               and re.match(rf"^\s*begin\s+your\s+response\s+to\s+question\s+{anchor['number']}\b",
                                            line["text"], re.I)), None)
    if anchor is None or response_start:
        if question_type == "MCQ":
            shared_only = _shared_context_only(page, question, lines, anchors, visual, page_number,
                                               source_quality_flags, source_years, metadata_year,
                                               metadata_year_mismatch)
            if shared_only:
                shared_only["signals"].update({"nativeTextCharacters": native_text_chars,
                                               "ocrUsed": ocr_used})
                shared_only["priorRect"] = list(prior) if prior else None
                return shared_only
        # Multi-page FRQs commonly continue with (c), (d), etc. and do not
        # repeat the numbered question heading. Refine a broad stored estimate
        # from those measurable subpart markers and nearby graphics, but keep
        # the result manual because the missing question heading is unverified.
        continuation_parts = []
        continuation_header = None
        if question_type == "FRQ" and prior:
            continuation_parts = [line for line in lines
                                  if SUBPART_CONTINUATION.match(line["text"])
                                  and prior.x0 - 40 <= line["rect"].x0 + line["rect"].width / 2 <= prior.x1 + 40]
            continuation_header = response_start or next((line for line in lines
                                         if re.search(r"(?:begin|continue)\s+your\s+response\s+to\s+question", line["text"], re.I)), None)
        if continuation_parts or continuation_header:
            first_part = min(continuation_parts, key=lambda line: line["rect"].y0) if continuation_parts else continuation_header
            # Continuation pages can place setup, tables, and graphs well above
            # the first lettered part, and some continue with roman subparts only.
            # Use the explicit continuation heading when available and preserve
            # all content below it, while still removing the examination footer.
            start_line = continuation_header or first_part
            continuation_top = max(bounds.y0, start_line["rect"].y0 - 4)
            if not continuation_header and continuation_parts:
                # Some continuation pages omit the standard banner and put
                # setup prose or a shared diagram above the first part (for
                # example, a page beginning with B. after a mass-spectrum
                # prompt). Retain preceding body content after the page header
                # instead of treating the first part as the upper boundary.
                preceding_context = [line for line in lines
                                     if line["rect"].y0 < first_part["rect"].y0
                                     and not PAGE_BOILERPLATE.search(line["text"])
                                     and not PAGE_HEADER.search(line["text"])
                                     and not PAGE_FOOTER.search(line["text"])]
                if preceding_context:
                    continuation_top = max(bounds.y0, min(line["rect"].y0 for line in preceding_context) - 4)
            continuation_context = [line for line in lines
                                    if continuation_top <= line["rect"].y0 < first_part["rect"].y0
                                    and not PAGE_BOILERPLATE.search(line["text"])
                                    and not PAGE_HEADER.search(line["text"])]
            footer_top = min((line["rect"].y0 for line in lines
                              if PAGE_FOOTER.search(line["text"]) and line["rect"].y0 > bounds.y1 - 220),
                             default=bounds.y1 - 48)
            later_questions = [a for a in anchors if a["number"] > expected and a["rect"].y0 > first_part["rect"].y0]
            stop_y = min([footer_top] + [a["rect"].y0 - 10 for a in later_questions])
            continuation_text = [line for line in lines
                                 if line["rect"].y1 >= continuation_top
                                 and line["rect"].y0 < stop_y - 3
                                 and not PAGE_BOILERPLATE.search(line["text"])
                                 and not PAGE_HEADER.search(line["text"])
                                 and not PAGE_FOOTER.search(line["text"])
                                 and line is not continuation_header]
            labels = []
            for line in continuation_parts:
                match = SUBPART_CONTINUATION.match(line["text"])
                label = (match.group(1) or match.group(2)).lower()
                if label not in labels:
                    labels.append(label)
            if any(label in "abcdefgh" for label in labels):
                labels = [label for label in labels if label in "abcdefgh"]
            visual_continuation = [box for box in visual
                                   if box.y1 >= continuation_top
                                   and box.y0 < stop_y - 4
                                   and box.width < bounds.width * .97]
            raster_graphics_unverified = _is_full_page_raster(page)
            if raster_graphics_unverified:
                # A single page image is not a useful graphic boundary. OCR
                # text defines ordered question segments; a human must check
                # the source scan for diagrams that OCR cannot bound.
                visual_continuation = []
            ordered_text = sorted(continuation_text, key=lambda line: (line["rect"].y0, line["rect"].x0))
            text_groups: list[list[dict[str, Any]]] = []
            if ordered_text and not raster_graphics_unverified:
                # Text PDFs can place essential plots/tables between subparts;
                # keep their continuation as one measured region with its
                # detected graphics. Split only scanned pages, where a single
                # raster bbox would otherwise include the entire response page.
                text_groups = [ordered_text]
            else:
                for line in ordered_text:
                    if not text_groups or line["rect"].y0 - max(item["rect"].y1 for item in text_groups[-1]) > 120:
                        text_groups.append([line])
                    else:
                        text_groups[-1].append(line)
            if not text_groups:
                # A prior rectangle is a diagnostic hint, not evidence that a
                # continuation-page extraction succeeded. Never emit it as a
                # crop when this page contains no measurable question content.
                return {"page": page_number, "rect": None,
                        "priorRect": [round(v, 2) for v in prior] if prior else None,
                        "confidence": 0.0, "confidenceBand": "low", "manualReview": True,
                        "extractionStatus": "unresolved",
                        "signals": {"textCharacters": sum(len(line["text"]) for line in continuation_text),
                                    "pageTextCharacters": text_chars, "questionStartFound": False,
                                    "continuationPageDetected": True, "targetQuestionFound": False,
                                    "priorRegionRejected": bool(prior), "graphicsIncluded": 0,
                                    "sourceQualityFlags": source_quality_flags,
                                    "sourceYears": source_years, "catalogYear": metadata_year,
                                    "sourceMetadataMismatch": metadata_year_mismatch},
                        "reasons": ["Continuation markers were present but no measurable text or graphic content was found; stored coordinates are retained only as diagnostics."]}
            score = 0.36 if text_chars >= 25 else 0.08
            continuation_reasons = [
                "The numbered FRQ stem was found below its response banner; scanned prompt segments require manual review."
                if response_start else
                "No repeated numbered FRQ heading was found; the page continuation was bounded from its explicit continuation heading and remains manual-review only."
            ]
            if continuation_context:
                continuation_reasons.append("Setup text above the first detected subpart was retained with the continuation page.")
            if source_quality_flags:
                continuation_reasons.append("The source contains answer-revealing annotations or answer-key markings; use a clean exam source before approval.")
            if metadata_year_mismatch:
                continuation_reasons.append(f"Source text identifies year(s) {source_years}, which do not match catalog year {metadata_year}; verify source provenance before approval.")
            segment_regions = []
            for segment_index, group in enumerate(text_groups):
                group_boxes = [line["rect"] for line in group]
                group_boxes.extend(box for box in visual_continuation
                                   if min(item["rect"].y0 for item in group) - 8 <= box.y1
                                   and max(item["rect"].y1 for item in group) + 8 >= box.y0)
                union = group_boxes[0]
                for box in group_boxes[1:]:
                    union |= box
                candidate = _expand(union, 18, 12, bounds)
                segment_lines = [line for line in group]
                segment_text = sum(len(line["text"]) for line in segment_lines)
                segment_labels = []
                for line in segment_lines:
                    match = SUBPART_CONTINUATION.match(line["text"])
                    if match:
                        label = (match.group(1) or match.group(2)).lower()
                        if label not in segment_labels:
                            segment_labels.append(label)
                segment_regions.append({
                    "page": page_number, "rect": [round(v, 2) for v in candidate],
                    "confidence": 0.36 if segment_text >= 25 else 0.08,
                    "confidenceBand": "low", "manualReview": True,
                    "segmentRole": "questionBody", "extractionStatus": "continuation-segment-needs-manual-verification",
                    "signals": {"textCharacters": segment_text,
                                "questionStartFound": bool(anchor and any(line["rect"] == anchor["rect"] and line["text"] == anchor["text"] for line in group)),
                                "continuationPageDetected": anchor is None, "continuationSegmentIndex": segment_index + 1,
                                "continuationSegmentCount": len(text_groups), "frqSubpartLabels": segment_labels,
                                "graphicsIncluded": len(visual_continuation),
                                "rasterGraphicsUnverified": raster_graphics_unverified,
                                "priorRegionRejected": bool(prior), "sourceQualityFlags": source_quality_flags,
                                "sourceYears": source_years, "catalogYear": metadata_year,
                                "sourceMetadataMismatch": metadata_year_mismatch},
                    "reasons": continuation_reasons + (["Blank response space and page furniture were excluded; check the original scan for any non-text figure that OCR cannot bound."]
                                                          if raster_graphics_unverified else [])
                })
            primary = segment_regions[0]
            primary["signals"].update({"pageTextCharacters": text_chars, "questionStartMatches": len(matching),
                                      "answerChoiceMarkers": 0, "answerChoiceSequence": False,
                                      "pageSubpartLabels": labels,
                                      "linkedStimulusRegions": 0, "columnCount": len(columns),
                                      "pageRotation": int(page.rotation), "introContextLinesIncluded": len(continuation_context)})
            if not raster_graphics_unverified:
                # Preserve the existing whole-page signal contract for text
                # PDFs, where the continuation remains one region.
                primary["signals"].update({"frqSubpartMarkers": len(labels),
                                           "frqSubpartLabels": labels,
                                           "frqSubpartSequence": _subpart_sequence(labels)})
            if len(segment_regions) > 1:
                primary["additionalRegions"] = segment_regions[1:]
            return {**primary,
                    "confidence": score, "confidenceBand": "low", "manualReview": True,
                    "signals": primary["signals"], "reasons": continuation_reasons}
        return {"page": page_number, "rect": None, "priorRect": [round(v, 2) for v in prior] if prior else None,
                "confidence": 0.08 if prior else 0.0, "confidenceBand": "low", "manualReview": True,
                "extractionStatus": "unresolved", "signals": {"textCharacters": text_chars, "questionStartFound": False,
                            "questionStartMatches": len(matching), "nextQuestionBoundaryFound": False,
                            "priorRegionRejected": bool(prior), "targetQuestionFound": False,
                            "answerChoiceMarkers": 0, "answerChoiceSequence": False,
                            "frqSubpartMarkers": 0, "frqSubpartLabels": [], "frqSubpartSequence": False,
                            "graphicsIncluded": 0, "linkedStimulusRegions": len(_stimulus_context(question, stimuli, page_number)),
                            "columnCount": 0, "pageRotation": int(page.rotation),
                            "sourceQualityFlags": source_quality_flags,
                            "sourceYears": source_years,
                            "catalogYear": metadata_year,
                            "sourceMetadataMismatch": metadata_year_mismatch},
                "reasons": ["Expected numbered question start was not located; no crop is emitted. Prior coordinates are retained only as diagnostic metadata." ]
                           + (["Sparse extractable text; likely scanned or image-only page."] if text_chars < 25 else [])
                           + (["The source contains answer-revealing annotations or answer-key markings; use a clean exam source before approval."] if source_quality_flags else [])
                           + ([f"Source text identifies year(s) {source_years}, which do not match catalog year {metadata_year}; verify source provenance before approval."] if metadata_year_mismatch else [])}

    center_x = (anchor["rect"].x0 + anchor["rect"].x1) / 2 if anchor else prior_center
    column_index = _column_for(center_x, columns)
    col_x0, col_x1 = columns[column_index]
    page_anchor_numbers = {int(q.get("number") or -1) for q in page_questions if q.get("type", question_type) == question_type}
    starts = [a for a in anchors if (a["number"] in page_anchor_numbers or expected < a["number"] <= expected + 3)
              and _column_for((a["rect"].x0+a["rect"].x1)/2, columns) == column_index]
    next_starts = [a for a in starts if anchor and a["rect"].y0 > anchor["rect"].y0 + 4 and a["number"] != expected]
    next_start = min(next_starts, key=lambda a:a["rect"].y0) if next_starts else None
    shared_groups = []
    for line in lines:
        group = SHARED_GROUP.match(line["text"])
        if group:
            shared_groups.append({"first": int(group.group(1)), "last": int(group.group(2)), "rect": line["rect"], "text": line["text"]})
    target_groups = [group for group in shared_groups if group["first"] <= expected <= group["last"]]
    target_group = min(target_groups, key=lambda group: abs(group["rect"].y0 - anchor["rect"].y0)) if target_groups else None
    next_group = min((group for group in shared_groups if group["rect"].y0 > anchor["rect"].y0 and group is not target_group), key=lambda group: group["rect"].y0, default=None)

    if target_group:
        segmented = _shared_group_segments(page, question, lines, visual, anchors, columns,
                                           page_number, source_quality_flags, source_years,
                                           metadata_year, metadata_year_mismatch)
        if segmented:
            primary = segmented["region"]
            primary["signals"].update({"nativeTextCharacters": native_text_chars,
                                       "ocrUsed": ocr_used})
            primary["additionalRegions"] = segmented["additionalRegions"]
            return primary

    # The prior remains the spatial anchor. A modest context lead includes equations or
    # shared setup printed immediately before the number without taking the previous item.
    intro_context = []
    dependency_cue_detected = False
    dependency_lines = []
    context_visual = []
    table_dependency = {"boxes": [], "lines": [], "resolved": False}
    if anchor:
        earlier_questions = [a for a in anchors if a["number"] != expected
                             and a["rect"].y1 < anchor["rect"].y0
                             and _column_for((a["rect"].x0+a["rect"].x1)/2, columns) == column_index]
        prior_question_bottom = max((a["rect"].y1 for a in earlier_questions), default=-1)
        instruction_bottom = max(
            (line["rect"].y1 for line in lines
             if line["rect"].y1 < anchor["rect"].y0
             and _column_for(line["rect"].x0 + line["rect"].width / 2, columns) == column_index
             and QUESTION_INSTRUCTION.search(line["text"])),
            default=-1,
        )
        direction_lines = [line for line in lines
                           if line["rect"].y1 < anchor["rect"].y0
                           and re.search(r"\bDirections\s*:", line["text"], re.I)]
        direction_bottom = -1
        if direction_lines:
            first_direction = min(direction_lines, key=lambda line: line["rect"].y0)
            ordered_before_anchor = sorted((line for line in lines
                                            if first_direction["rect"].y0 <= line["rect"].y0 < anchor["rect"].y0),
                                           key=lambda line: line["rect"].y0)
            last_instruction = first_direction
            for line in ordered_before_anchor[1:]:
                if (line["rect"].y0 - last_instruction["rect"].y1 > 8
                        or re.search(r"^\s*write\s+your\s+response", line["text"], re.I)):
                    break
                last_instruction = line
            direction_bottom = last_instruction["rect"].y1
        context_floor = max(prior_question_bottom, instruction_bottom, direction_bottom)
        page_header_bottom = max((line["rect"].y1 for line in lines
                                  if line["rect"].y1 < anchor["rect"].y0 and PAGE_HEADER.search(line["text"])),
                                 default=-1)
        context_floor = max(context_floor, page_header_bottom)
        previous_choice_bottom = -1.0
        previous_anchor = max(earlier_questions, key=lambda item: item["rect"].y0, default=None)
        if previous_anchor and not target_group:
            previous_choices = [line for line in lines
                                if previous_anchor["rect"].y0 <= line["rect"].y0 < anchor["rect"].y0
                                and _choice_match(line["text"])]
            previous_labels = []
            for line in previous_choices:
                match = _choice_match(line["text"])
                if match and match.group(1).upper() not in previous_labels:
                    previous_labels.append(match.group(1).upper())
            if _complete_choice_sequence(previous_labels):
                previous_choice_bottom = max(line["rect"].y1 for line in previous_choices)
                context_floor = max(context_floor, previous_choice_bottom)
        preceding = [line for line in lines
                     if 0 < anchor["rect"].y0 - line["rect"].y1 <= 130
                     and _column_for(line["rect"].x0 + line["rect"].width / 2, columns) == column_index
                     and line["rect"].y0 >= context_floor
                     and not QUESTION_INSTRUCTION.search(line["text"])
                     and not PAGE_HEADER.search(line["text"])
                     and CONTEXT_CUE.search(line["text"])]
        full_text = str(question.get("fullText") or "")
        dependency_cue_detected = bool(UPSTREAM_DEPENDENCY_CUE.search(full_text))
        dependency_lines = []
        if dependency_cue_detected:
            dependency_lines = [line for line in lines
                                if 0 < anchor["rect"].y0 - line["rect"].y1 <= 180
                                and line["rect"].y0 >= context_floor
                                and _column_for(line["rect"].x0 + line["rect"].width / 2, columns) == column_index
                                and not PAGE_BOILERPLATE.search(line["text"])
                                and not PAGE_HEADER.search(line["text"])
                                and not GENERIC_EXAM_INSTRUCTION.search(line["text"])
                                and (CHEMICAL_EXPRESSION.search(line["text"])
                                     or re.search(r"\b(?:given|provided|shown|following|use|based on)\b", line["text"], re.I))]
            # Equations are often split into multiple text boxes (for example,
            # reaction, ΔH label, and value). Keep nearby aligned fragments as
            # one dependency group, but never cross the prior-question boundary.
            expression_lines = [line for line in dependency_lines if CHEMICAL_EXPRESSION.search(line["text"])]
            if expression_lines:
                expression_top = min(line["rect"].y0 for line in expression_lines)
                expression_bottom = max(line["rect"].y1 for line in expression_lines)
                dependency_lines = list({id(line): line for line in expression_lines + [
                    line for line in lines
                    if expression_top - 5 <= line["rect"].y0 <= expression_bottom + 5
                    and _column_for(line["rect"].x0 + line["rect"].width / 2, columns) == column_index
                    and line["rect"].y0 >= context_floor
                    and not PAGE_BOILERPLATE.search(line["text"])
                    and not PAGE_HEADER.search(line["text"])
                    and not GENERIC_EXAM_INSTRUCTION.search(line["text"])
                ]}.values())
        context_selection = dependency_lines if dependency_lines else preceding[-3:]
        intro_context = list({id(line): line for line in context_selection}.values())
        intro_context.sort(key=lambda line: (line["rect"].y0, line["rect"].x0))
        visual_context_requested = bool(re.search(
            r"\b(graph|figure|diagram|table|shown|illustrat|curve|structure|spectrum|in the box)\b",
            str(question.get("fullText") or ""), re.I))
        context_visual = [box for box in visual
                          if 0 < anchor["rect"].y0 - box.y1 <= 140
                          and _column_for((box.x0+box.x1)/2, columns) == column_index
                          and box.y0 >= context_floor
                          and box.y0 >= page_header_bottom
                          and visual_context_requested
                          and box.width >= 30 and box.height >= 12
                          and box.width < bounds.width * .85]
        visual_cue_text = (str(question.get("textPreview") or "") + " "
                           + str(question.get("fullText") or ""))
        raster_context = _raster_dependency_above(
            page, anchor, columns[column_index], lines,
            bool(re.search(r"\b(graph|figure|diagram|particle model|table|shown|illustrat|curve|structure)\b",
                           visual_cue_text, re.I)),
        )
        if raster_context:
            context_visual.append(raster_context)
        table_dependency = _above_table_dependency(question, anchor, lines, visual, columns,
                                                   column_index, context_floor, bounds.width)
        if table_dependency["resolved"]:
            context_visual.extend(box for box in table_dependency["boxes"] if box not in context_visual)
        top = anchor["rect"].y0 - 14
        if target_group and target_group["rect"].y0 < anchor["rect"].y0:
            top = min(top, target_group["rect"].y0 - 12)
        if context_visual:
            top = min(top, min(box.y0 for box in context_visual) - 12)
        if intro_context:
            top = min(top, min(line["rect"].y0 for line in intro_context) - 12)
        if (prior and native_text_chars >= 25 and anchor["rect"].y0 - prior.y0 <= 150
                and prior.y0 >= context_floor):
            top = min(top, prior.y0)
        if previous_choice_bottom >= 0:
            top = max(top, previous_choice_bottom + 4)
        top = max(bounds.y0, top)
        if next_start:
            bottom = next_start["rect"].y0 - 10
        else:
            # Existing coordinates are only an estimate. They must not extend a
            # measured question back into a broad exam-header/page crop.
            bottom = min(bounds.y1 - 28, anchor["rect"].y1 + 120)
    elif prior:
        top, bottom = prior.y0, prior.y1
    else:
        return {"page": page_number, "rect": None, "confidence": 0.0, "confidenceBand": "low",
                "manualReview": True, "signals": {"textCharacters": text_chars, "questionStartFound": False},
                "reasons": ["No usable stored crop or numbered question start was found; no page-sized crop was generated."]}

    # Bound the question using extracted content in its column. Ignore standard
    # page furniture and do not union broad legacy crop coordinates back into it.
    footer_start = min((line["rect"].y0 for line in lines
                        if PAGE_FOOTER.search(line["text"]) and line["rect"].y0 > bounds.y1 - 170),
                       default=bounds.y1 - 44)
    body_lines = [line for line in lines
                  if anchor and line["rect"].y1 >= anchor["rect"].y0 - 3
                  and line["rect"].x0 >= col_x0 - 18
                  and col_x0 <= line["rect"].x0 + line["rect"].width / 2 <= col_x1
                  and line["rect"].y0 < footer_start - 4
                  and not PAGE_BOILERPLATE.search(line["text"])
                  and not _is_page_number(line, bounds)]
    if next_start:
        body_lines = [line for line in body_lines if line["rect"].y0 < next_start["rect"].y0 - 4]
    if next_group:
        body_lines = [line for line in body_lines if line["rect"].y0 < next_group["rect"].y0 - 6]
    last_choice_bottom = -1.0
    if question_type == "MCQ" and next_start:
        target_choice_lines = [line for line in body_lines
                               if anchor and anchor["rect"].y0 <= line["rect"].y0 < next_start["rect"].y0
                               and _choice_match(line["text"])]
        labels = []
        for line in target_choice_lines:
            match = _choice_match(line["text"])
            if match and match.group(1).upper() not in labels:
                labels.append(match.group(1).upper())
        if _complete_choice_sequence(labels):
            last_choice_bottom = max(line["rect"].y1 for line in target_choice_lines)
            bottom = min(bottom, last_choice_bottom + 18)
    if body_lines and not next_start:
        bottom = min(bounds.y1 - 24, max(line["rect"].y1 for line in body_lines) + 18)
    if next_group:
        bottom = min(bottom, next_group["rect"].y0 - 8)
    band = fitz.Rect(col_x0, top, col_x1, max(top + 1, bottom))
    included_text = [line for line in lines if line["rect"].intersects(band)
                     and line["rect"].x0 >= col_x0 - 18
                     and col_x0 <= line["rect"].x0 + line["rect"].width / 2 <= col_x1
                     and line["rect"].y0 < footer_start - 4
                     and not PAGE_BOILERPLATE.search(line["text"])
                     and (not next_group or line["rect"].y0 < next_group["rect"].y0 - 6)
                     and not _is_page_number(line, bounds)
                     and (line["rect"].y1 >= anchor["rect"].y0 - 3 or line in intro_context
                          or (target_group and target_group["rect"].y0 <= line["rect"].y0 < anchor["rect"].y0))]
    if table_dependency["resolved"]:
        included_text.extend(line for line in table_dependency["lines"] if line not in included_text)

    # FRQs sometimes place an explicitly referenced boxed statement after the
    # final lettered subpart. Recover only source lines that match the catalog stem,
    # and only before page furniture, rather than extending to an arbitrary y value.
    full_text = str(question.get("fullText") or "")
    box_cue = bool(re.search(r"\b(?:statement|claim)\b.{0,100}\b(?:box|below)\b|\b(?:box|below)\b.{0,100}\b(?:statement|claim)\b", full_text, re.I))
    semantic_tail: list[dict[str, Any]] = []
    if question_type == "FRQ" and box_cue and included_text:
        normalized_catalog = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", full_text.lower())).strip()
        box_reference_lines = [line for line in lines
                               if re.search(r"\b(?:statement|claim)\b.{0,80}\b(?:box|below)\b", line["text"], re.I)]
        reference_y = max((line["rect"].y1 for line in box_reference_lines),
                          default=max(line["rect"].y1 for line in included_text))
        for line in lines:
            normalized_line = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", line["text"].lower())).strip()
            if (reference_y - 2 <= line["rect"].y0 <= reference_y + 160
                    and len(normalized_line) >= 22
                    and normalized_line in normalized_catalog
                    and line["rect"].y0 < footer_start - 4
                    and not PAGE_BOILERPLATE.search(line["text"])
                    and not PAGE_FOOTER.search(line["text"])):
                semantic_tail.append(line)
        included_text.extend(line for line in semantic_tail if line not in included_text)
    if question_type == "MCQ" and next_start and last_choice_bottom >= 0:
        # Content such as the next question's equation can appear between the
        # final choice and its numbered stem. Once every expected choice is
        # present, it is a safer lower boundary than that later question marker.
        included_text = [line for line in included_text
                         if line["rect"].y0 <= last_choice_bottom + 5]
    catalog_tokens = {word for word in re.findall(r"[a-z]{3,}", str(question.get("fullText") or "").lower())
                      if word not in {"the", "and", "for", "that", "with", "which", "from", "into", "this", "are", "was", "were", "each", "following", "above", "below"}}
    crop_tokens = {word for line in included_text for word in re.findall(r"[a-z]{3,}", line["text"].lower())}
    catalog_text_coverage = round(len(catalog_tokens & crop_tokens) / len(catalog_tokens), 2) if catalog_tokens else None
    leading_catalog_number = re.match(r"\s*(?:question\s*)?(\d{1,3})\s*[.)]", str(question.get("fullText") or ""), re.I)
    catalog_question_number_mismatch = bool(
        leading_catalog_number and int(leading_catalog_number.group(1)) != expected
    )
    visual = _visual_rects(page)
    included_visual = [box for box in visual if box.intersects(band)]
    linked = _stimulus_context(question, stimuli, page_number)
    interposed_questions = [a for a in anchors if linked and a["number"] != expected
                            and min(item.y1 for item in linked) < a["rect"].y0 < anchor["rect"].y0
                            and _column_for((a["rect"].x0+a["rect"].x1)/2, columns) == column_index]
    ambiguous_linked_context = bool(interposed_questions)
    for box in linked:
        top = min(top, box.y0)
        bottom = max(bottom, box.y1)
    if next_start:
        bottom = min(bottom, next_start["rect"].y0 - 10)
    if next_group:
        bottom = min(bottom, next_group["rect"].y0 - 8)
    if prior and next_start and anchor and 0 <= anchor["rect"].y0 - prior.y0 <= 150 and prior.y0 >= context_floor:
        top = min(top, prior.y0)
    body_text = [line for line in included_text
                 if anchor and line["rect"].y1 >= anchor["rect"].y0 - 3
                 and (not next_start or line["rect"].y0 < next_start["rect"].y0 - 4)]
    visual_in_band = []
    graphics_expected = False
    if body_text:
        text_top = min(line["rect"].y0 for line in body_text)
        text_bottom = max(line["rect"].y1 for line in body_text)
        question_visual_cue = bool(re.search(r"\b(graph|figure|diagram|table|shown|illustrat|curve|structure|in the box)\b",
                                             (str(question.get("fullText") or "") + " " + " ".join(line["text"] for line in body_text)), re.I))
        graphics_expected = bool(re.search(
            r"\b(graph|figure|diagram|table|structural formulas?|curve|illustration|in the box)\b",
            str(question.get("fullText") or "") + " " + " ".join(line["text"] for line in body_text),
            re.I,
        ))
        for box in visual:
            if not box.intersects(fitz.Rect(col_x0, top, col_x1, max(top + 1, bottom))):
                continue
            # Skip page-wide decorative rules and distant objects; retain graphics
            # overlapping the question body, or explicitly requested by its text.
            # Mere proximity can pull in a neighboring question's table/diagram.
            overlaps_text = box.y1 >= text_top - 8 and box.y0 <= text_bottom + 8
            requested_context = question_visual_cue and box.y1 >= text_top - 110 and box.y0 <= text_bottom + 36
            if box.width / max(1, bounds.width) < .96 and box.x0 >= col_x0 - 18 and box.y0 < footer_start - 4 and (overlaps_text or requested_context):
                visual_in_band.append(box)
    elif linked:
        visual_in_band = [box for box in visual if any(box.intersects(item) for item in linked)]
    # Choice labels and their wrapped answer text are sometimes separate PDF
    # text boxes. Keep short continuation lines after the final marker in the
    # target column so a complete-looking A–E marker sequence cannot hide a
    # clipped final answer.
    choice_tail_lines = []
    target_markers = [line for line in body_lines if _choice_match(line["text"])] if question_type == "MCQ" else []
    if target_markers:
        final_marker = max(target_markers, key=lambda line: line["rect"].y0)
        target_end = next_start["rect"].y0 - 4 if next_start else footer_start - 4
        choice_tail_lines = [line for line in body_lines
                             if final_marker["rect"].y0 <= line["rect"].y0 <= final_marker["rect"].y0 + 40
                             and line["rect"].y0 < target_end
                             and line["rect"].x0 >= col_x0 - 8
                             and _column_for(line["rect"].x0 + line["rect"].width / 2, columns) == column_index
                             and not _choice_match(line["text"])
                             and not PAGE_BOILERPLATE.search(line["text"])]
    completeness_text = list({id(line): line for line in included_text + choice_tail_lines}.values())
    content_boxes = [line["rect"] for line in completeness_text] + visual_in_band + linked + context_visual
    if anchor:
        content_boxes.append(anchor["rect"])
    if content_boxes:
        content_top = min(box.y0 for box in content_boxes)
        content_bottom = max(box.y1 for box in content_boxes)
        top = min(top, content_top - 12)
        bottom = max(bottom, content_bottom + 14)
    if next_start:
        content_bottom = max((box.y1 for box in content_boxes), default=anchor["rect"].y1 if anchor else top)
        safe_bottom = next_start["rect"].y0 - 10
        if question_type == "MCQ" and last_choice_bottom >= 0:
            safe_bottom = min(safe_bottom, last_choice_bottom + 8)
            relevant_visual_bottom = max((box.y1 for box in visual_in_band), default=-1)
            if relevant_visual_bottom >= 0:
                safe_bottom = min(next_start["rect"].y0 - 10,
                                  max(safe_bottom, relevant_visual_bottom + 8))
        bottom = min(safe_bottom, max(content_bottom + 26, anchor["rect"].y1 + 26 if anchor else top + 40))
        if prior and 0 <= prior.y1 - content_bottom <= 72:
            bottom = min(safe_bottom, max(bottom, prior.y1))
    # Tighten to the measured content width with a generous horizontal margin. This keeps
    # unrelated neighboring columns out while retaining diagrams, tables, and equations.
    content_x = [box for box in content_boxes if box.intersects(fitz.Rect(col_x0, top, col_x1, max(top+1,bottom)))]
    if content_x:
        left = max(col_x0, min(box.x0 for box in content_x) - 22)
        right = min(col_x1, max(box.x1 for box in content_x) + 22)
    else:
        left, right = col_x0, col_x1
    candidate = _expand(fitz.Rect(left, max(bounds.y0, top), right, min(bounds.y1, max(top+1,bottom))),
                        0, 0, bounds)
    horizontally_clipped_lines = [line for line in completeness_text
                                  if line["rect"].x0 < candidate.x0 - 0.5
                                  or line["rect"].x1 > candidate.x1 + 0.5]
    # Do not grow through the middle of a neighboring column. If a required
    # text box crosses that safe edge, retain a diagnostic and require review.
    if len(columns) > 1:
        gutter_edge = (columns[0][1] + columns[1][0]) / 2
        crosses_gutter = any(line["rect"].x1 > gutter_edge + 1 for line in completeness_text
                             if column_index == 0)
        if column_index == 1:
            crosses_gutter = any(line["rect"].x0 < gutter_edge - 1 for line in completeness_text)
    else:
        crosses_gutter = False
    # Where a crop estimate is tighter than inferred content, include the full union.
    # A broad prior rectangle is evidence to inspect, not an automatic reason to
    # re-expand a measured crop. Nearby PDF graphics are handled above.

    region_text_chars = sum(len(line["text"]) for line in included_text)
    choice_labels = []
    if question_type == "MCQ":
        for line in included_text:
            if anchor and line["rect"].y0 < anchor["rect"].y0 - 2 and not (
                target_group and target_group["rect"].y0 <= line["rect"].y0 < anchor["rect"].y0
            ):
                continue
            if next_start and line["rect"].y0 >= next_start["rect"].y0 - 4:
                continue
            # PyMuPDF often emits the label ("A)") and its answer text as
            # separate lines/spans. Accept both joined and standalone labels.
            match = _choice_match(line["text"])
            if match and match.group(1).upper() not in choice_labels:
                choice_labels.append(match.group(1).upper())
    choices = len(choice_labels)
    expected_choice_count = 0
    if question_type == "MCQ":
        full_text = str(question.get("fullText") or "")
        expected_choice_count = len(set(re.findall(r"(?m)^\s*\(?([A-E])(?:\)|[.)])\s+", full_text)))
        if expected_choice_count < 3:
            expected_choice_count = 0
    choice_sequence = _complete_choice_sequence(choice_labels, expected_choice_count)
    subpart_labels = []
    if question_type == "FRQ":
        for line in included_text:
            match = SUBPART.match(line["text"])
            if match:
                label = (match.group(1) or match.group(2)).lower()
                if label not in subpart_labels:
                    subpart_labels.append(label)
    subparts = len(subpart_labels)
    subpart_sequence = _subpart_sequence(subpart_labels)
    signals = {
        "textCharacters": region_text_chars,
        "catalogTextCoverage": catalog_text_coverage,
        "pageTextCharacters": text_chars,
        "questionStartFound": bool(anchor),
        "questionStartMatches": len(matching),
        "nextQuestionBoundaryFound": bool(next_start),
        "answerChoiceMarkers": choices,
        "answerChoiceLabels": choice_labels,
        "answerChoiceSequence": choice_sequence,
        "expectedAnswerChoiceMarkers": expected_choice_count,
        "answerChoiceCoverage": choices >= expected_choice_count if expected_choice_count else None,
        "frqSubpartMarkers": subparts,
        "frqSubpartLabels": subpart_labels,
        "frqSubpartSequence": subpart_sequence,
        "graphicsIncluded": len(visual_in_band) + int(bool(raster_context)),
        "graphicsExpected": graphics_expected,
        "linkedStimulusRegions": len(linked),
        "independentQuestionStartsBetweenStimulusAndTarget": len(interposed_questions),
        "sharedQuestionGroupDetected": bool(target_group),
        "followingSharedQuestionGroupBoundary": bool(next_group),
        "introContextLinesIncluded": len(intro_context),
        "previousQuestionChoiceBoundaryY": round(previous_choice_bottom, 2) if previous_choice_bottom >= 0 else None,
        "columnCount": len(columns),
        "suspiciousColumnGeometry": bool(prior and prior.width >= bounds.width * .90 and len(columns) > 1),
        "pageRotation": int(page.rotation),
        "sourceQualityFlags": source_quality_flags,
        "sourceYears": source_years,
        "catalogYear": metadata_year,
        "sourceMetadataMismatch": metadata_year_mismatch,
        "nativeTextCharacters": native_text_chars,
        "ocrUsed": ocr_used,
        "singleQuestionFullWidthOverride": single_frq_anchor_wide_source,
        "tableDependencyDetected": bool(re.search(r"\btable\s+(?:above|shown\s+above|on\s+the\s+previous\s+page)\b", full_text, re.I)),
        "tableDependencyResolved": table_dependency["resolved"],
        "tableDependencyGraphics": len(table_dependency["boxes"]),
        "boxedStatementDependencyDetected": box_cue,
        "boxedStatementDependencyResolved": bool(semantic_tail) if box_cue and question_type == "FRQ" else None,
        "questionIdTypeMismatch": question_id_type_mismatch,
        "questionIdTypePrefix": id_type_prefix,
        "semanticTailLinesIncluded": len(semantic_tail),
        "rasterGraphicsContextIncluded": bool(raster_context),
        "catalogQuestionNumberMismatch": catalog_question_number_mismatch,
        "fullPageRaster": _is_full_page_raster(page),
        "horizontalTextClippingDetected": bool(horizontally_clipped_lines or crosses_gutter),
        "horizontalTextBoundingBoxesChecked": len(completeness_text),
        "referencedUpstreamDependencyDetected": dependency_cue_detected,
        "referencedUpstreamDependencyResolved": bool(dependency_lines) if dependency_cue_detected else None,
    }
    # This is an evidence score, not a model-confidence claim. Text-poor scans are always
    # routed to manual review, even when a prior rectangle exists.
    score = 0.0
    score += 0.32 if anchor else 0
    score += 0.18 if next_start else 0
    score += 0.18 if region_text_chars >= 80 else (0.08 if region_text_chars >= 25 else 0)
    score += 0.14 if (choice_sequence if question_type == "MCQ" else subparts >= 1) else 0
    score += 0.10 if visual_in_band or linked else 0
    score += 0.08 if prior else 0
    score = round(min(1.0, score), 2)
    choices_incomplete = bool(expected_choice_count and (choices < expected_choice_count or not choice_sequence))
    text_mismatch = catalog_text_coverage is not None and len(catalog_tokens) >= 5 and catalog_text_coverage < .20
    graphics_missing = graphics_expected and not visual_in_band and not linked and not raster_context
    suspicious_column_geometry = signals["suspiciousColumnGeometry"]
    unresolved_dependency = (signals["tableDependencyDetected"] and not signals["tableDependencyResolved"])
    unresolved_boxed_statement = (signals["boxedStatementDependencyDetected"]
                                  and question_type == "FRQ"
                                  and not signals["boxedStatementDependencyResolved"])
    manual = (region_text_chars < 25 or not anchor or score < 0.58 or choices_incomplete
              or ambiguous_linked_context or text_mismatch or graphics_missing
              or bool(source_quality_flags) or metadata_year_mismatch or suspicious_column_geometry
              or unresolved_dependency or unresolved_boxed_statement or native_text_chars < 25
              or question_id_type_mismatch or catalog_question_number_mismatch
              or horizontally_clipped_lines or crosses_gutter
              or (dependency_cue_detected and not dependency_lines)
              or _is_full_page_raster(page))
    reasons = []
    if text_chars < 25:
        reasons.append("Sparse extractable text on the page; likely scanned or image-only. OCR/manual boundary review is required.")
    elif region_text_chars < 25:
        reasons.append("Very little extractable text falls inside this question crop; manual boundary review is required.")
    if not anchor:
        reasons.append("Expected numbered question start was not located near the metadata estimate.")
    if not next_start:
        reasons.append("No subsequent question boundary was found; the bottom follows extracted question content and nearby graphics, excluding page boilerplate.")
    if prior and (prior.y0 < candidate.y0 - 40 or prior.y1 > candidate.y1 + 40 or prior.width > candidate.width * 1.8):
        reasons.append("Stored crop differs materially from the measured content region; inspect the proposal for image-only content.")
    if question_type == "MCQ" and choices < 3 and not expected_choice_count:
        reasons.append(f"Only {choices} distinct answer-choice markers were detected.")
    if choices_incomplete:
        reasons.append(f"Detected {choices} of {expected_choice_count} answer-choice markers recorded in the question text; manual review is required to avoid a clipped MCQ.")
    if text_mismatch:
        reasons.append(f"Only {catalog_text_coverage:.0%} of distinctive catalog terms appear in the proposed crop; verify that the detected page region matches this question.")
    if catalog_question_number_mismatch:
        reasons.append(f"Catalog fullText begins with Question {leading_catalog_number.group(1)}, but this record identifies Question {expected}; catalog/source text provenance requires manual review.")
    if horizontally_clipped_lines or crosses_gutter:
        reasons.append("One or more required text boxes cross the crop or safe column boundary; horizontal content completeness is unresolved and manual review is required.")
    if dependency_cue_detected and not dependency_lines:
        reasons.append("The question explicitly references material above the stem, but no matching source text was localized; manual review is required.")
    if dependency_lines:
        reasons.append("Referenced setup or equation text above the stem was localized and included.")
    if _is_full_page_raster(page):
        reasons.append("The page is a raster scan; OCR can propose boundaries but cannot certify all graphical content, so manual review is required.")
    if graphics_missing:
        reasons.append("The question explicitly references a graph, table, diagram, or structural formula, but no graphical region was measured inside the crop; manual context review is required.")
    if unresolved_dependency:
        reasons.append("The question depends on a table above, but a complete aligned table graphic cluster was not resolved; the crop is incomplete until reviewed.")
    if signals["boxedStatementDependencyDetected"] and signals["boxedStatementDependencyResolved"]:
        reasons.append("An explicitly referenced boxed statement below the subparts was matched to catalog text and included.")
    if unresolved_boxed_statement:
        reasons.append("The question references a statement in a box below, but the matching source text was not recovered; the crop is incomplete and requires review.")
    if native_text_chars < 25:
        reasons.append("The source page is scanned/image-only. OCR supplied a boundary estimate, but manual visual approval is required.")
    if source_quality_flags:
        reasons.append("The source contains answer-revealing annotations or answer-key markings; use a clean exam source before approval.")
    if metadata_year_mismatch:
        reasons.append(f"Source text identifies year(s) {source_years}, which do not match catalog year {metadata_year}; verify source provenance before approval.")
    if question_id_type_mismatch:
        reasons.append(f"Question ID prefix identifies {id_type_prefix}, while catalog type is {question_type}; verify record provenance without rewriting the ID.")
    if suspicious_column_geometry:
        reasons.append("Stored crop spans almost the full page while text analysis found multiple columns; verify the column boundary manually.")
    if question_type == "FRQ" and subparts == 0:
        reasons.append("No lettered FRQ subparts were detected in the candidate region.")
    if signals["columnCount"] > 1:
        reasons.append("A multi-column page layout was detected; the crop is constrained to the nearest column.")
    if signals["pageRotation"]:
        reasons.append(f"Page rotation of {signals['pageRotation']} degrees was detected and retained in the source page geometry.")
    if linked:
        reasons.append("Linked shared-stimulus source regions were included as required context.")
    if target_group:
        reasons.append(f"Shared context for Questions {target_group['first']}–{target_group['last']} was located from the PDF text.")
    if ambiguous_linked_context:
        reasons.append("Independent question starts fall between the linked shared stimulus and this question; separating the shared context requires manual review.")
    if context_visual:
        reasons.append("Nearby diagram/table/image content above the question number was included as context.")
    if intro_context:
        reasons.append("Nearby equation/setup text above the question number was included as introductory context.")
    return {"page": page_number, "rect": [round(v, 2) for v in candidate], "confidence": score,
            "confidenceBand": "high" if score >= .78 else ("medium" if score >= .58 else "low"),
            "manualReview": manual, "signals": signals, "reasons": reasons}


def detect(catalog: dict[str, Any], pdf_root: Path, stimuli_doc: dict[str, Any] | None = None) -> dict[str, Any]:
    stimuli = (stimuli_doc or {}).get("stimuli", {})
    questions = catalog.get("questions", [])
    by_page: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for q in questions:
        for page in set(q.get("pages", []) or q.get("sourcePagesOriginal", [])):
            by_page[int(page)].append(q)
    cache: dict[str, fitz.Document] = {}
    results = []
    try:
        for q in questions:
            regions = list(q.get("sourceRegions") or [])
            pages = sorted({int(r["page"]) for r in regions} | {int(p) for p in (q.get("pages") or q.get("sourcePagesOriginal") or [])})
            if not pages:
                results.append({"id": q.get("id"), "manualReview": True, "regions": [], "reasons": ["Question metadata contains no source page."]})
                continue
            out_regions = []
            for page_number in pages:
                source = next((entry for entry in catalog.get("sourceFiles", []) if int(entry["from"]) <= page_number <= int(entry["to"])), None)
                if not source:
                    out_regions.append({"page": page_number, "rect": None, "confidence": 0, "confidenceBand": "low", "manualReview": True, "signals": {}, "reasons": ["No source PDF mapping exists for this page."]})
                    continue
                path = pdf_root / source["url"].lstrip("/")
                if not path.exists():
                    out_regions.append({"page": page_number, "rect": None, "confidence": 0, "confidenceBand": "low", "manualReview": True, "signals": {}, "reasons": [f"Source PDF is not available locally: {path}"]})
                    continue
                if str(path) not in cache:
                    cache[str(path)] = fitz.open(path)
                doc = cache[str(path)]
                source_page = page_number - int(source["from"])
                if source_page < 0 or source_page >= doc.page_count:
                    out_regions.append({"page": page_number, "rect": None, "confidence": 0, "confidenceBand": "low", "manualReview": True, "signals": {}, "reasons": ["Catalog page offset is outside the source PDF."]})
                    continue
                # PyMuPDF text blocks and graphics are expressed in unrotated page points.
                source_page_obj = doc.load_page(source_page)
                page_regions = [r for r in regions if int(r["page"]) == page_number]
                if page_regions:
                    prior_rects = [_rect(r.get("rect")) for r in page_regions]
                    prior_rects = [r for r in prior_rects if r]
                    region = {"page": page_number, "rect": list(prior_rects[0])} if prior_rects else page_regions[0]
                    for prior_rect in prior_rects[1:]:
                        merged = fitz.Rect(region["rect"]) | prior_rect
                        region["rect"] = list(merged)
                    if source_page_obj.rotation and region.get("rect"):
                        unrotated_prior = fitz.Rect(region["rect"]) * source_page_obj.derotation_matrix
                        region = {**region, "rect": list(unrotated_prior)}
                else:
                    region = None
                proposal = analyze_page(source_page_obj, q, region, by_page[page_number], stimuli, page_number)
                additional_regions = proposal.pop("additionalRegions", [])
                # Transform proposed rectangles through the page's rotation matrix so output
                # coordinates match the displayed PDF page used by the crop editor.
                if proposal.get("rect") and source_page_obj.rotation:
                    rotated = fitz.Rect(proposal["rect"]) * source_page_obj.rotation_matrix
                    proposal["rect"] = [round(v, 2) for v in rotated]
                out_regions.append(proposal)
                for additional_region in additional_regions:
                    if additional_region.get("rect") and source_page_obj.rotation:
                        rotated = fitz.Rect(additional_region["rect"]) * source_page_obj.rotation_matrix
                        additional_region["rect"] = [round(v, 2) for v in rotated]
                    out_regions.append(additional_region)
            if q.get("type") == "FRQ" and pages:
                # Catalog page ranges can stop before a continuation that starts
                # with the next lettered subpart. Inspect only the immediately
                # adjacent page in the same PDF and require a sequential marker.
                last_page = max(pages)
                last_region = next((r for r in reversed(out_regions)
                                    if int(r.get("page", -1)) == last_page
                                    and r.get("signals", {}).get("frqSubpartLabels")), None)
                labels = last_region.get("signals", {}).get("frqSubpartLabels", []) if last_region else []
                alpha_labels = [label for label in labels if len(label) == 1 and label in "abcdefgh"]
                next_label = chr(ord(alpha_labels[-1]) + 1) if alpha_labels else None
                catalog_subparts = set()
                for text_line in str(q.get("fullText") or "").splitlines():
                    match = SUBPART_CONTINUATION.match(text_line)
                    if match:
                        catalog_subparts.add((match.group(1) or match.group(2)).lower())
                next_page = last_page + 1
                current_source = next((entry for entry in catalog.get("sourceFiles", [])
                                       if int(entry["from"]) <= last_page <= int(entry["to"])), None)
                next_source = next((entry for entry in catalog.get("sourceFiles", [])
                                    if int(entry["from"]) <= next_page <= int(entry["to"])), None)
                if (next_label and next_label <= "h" and next_label not in catalog_subparts
                        and current_source and next_source
                        and current_source.get("url") == next_source.get("url") and next_page not in pages):
                    adjacent_path = pdf_root / next_source["url"].lstrip("/")
                    if adjacent_path.exists():
                        if str(adjacent_path) not in cache:
                            cache[str(adjacent_path)] = fitz.open(adjacent_path)
                        adjacent_doc = cache[str(adjacent_path)]
                        adjacent_index = next_page - int(next_source["from"])
                        if 0 <= adjacent_index < adjacent_doc.page_count:
                            adjacent_obj = adjacent_doc.load_page(adjacent_index)
                            adjacent_lines, _, _ = _content_lines(adjacent_obj)
                            adjacent_labels = []
                            next_label_y = None
                            for line in adjacent_lines:
                                match = SUBPART_CONTINUATION.match(line["text"])
                                if match:
                                    label = (match.group(1) or match.group(2)).lower()
                                    if len(label) == 1 and label not in adjacent_labels:
                                        adjacent_labels.append(label)
                                    if label == next_label:
                                        next_label_y = line["rect"].y0
                            adjacent_anchors = _anchors(adjacent_lines, "FRQ")
                            competing_start = any(anchor["number"] != int(q.get("number") or 0)
                                                  and next_label_y is not None
                                                  and anchor["rect"].y0 < next_label_y
                                                  for anchor in adjacent_anchors)
                            if (next_label in adjacent_labels and not competing_start
                                    and not _is_full_page_raster(adjacent_obj)):
                                broad_prior = {"page": next_page,
                                               "rect": [0, 0, adjacent_obj.rect.width, adjacent_obj.rect.height]}
                                continuation = analyze_page(adjacent_obj, q, broad_prior,
                                                            by_page.get(next_page, []), stimuli, next_page)
                                extras = continuation.pop("additionalRegions", [])
                                continuation.setdefault("signals", {})["continuationPageInferredFromSubpartSequence"] = True
                                continuation["manualReview"] = True
                                continuation["reasons"] = continuation.get("reasons", []) + [
                                    f"Adjacent source page {next_page} was added because subpart ({next_label}) continues the target FRQ sequence; verify the catalog page mapping manually."
                                ]
                                if continuation.get("rect") and adjacent_obj.rotation:
                                    continuation["rect"] = list(fitz.Rect(continuation["rect"]) * adjacent_obj.rotation_matrix)
                                out_regions.append(continuation)
                                for extra in extras:
                                    extra.setdefault("signals", {})["continuationPageInferredFromSubpartSequence"] = True
                                    extra["manualReview"] = True
                                    if extra.get("rect") and adjacent_obj.rotation:
                                        extra["rect"] = list(fitz.Rect(extra["rect"]) * adjacent_obj.rotation_matrix)
                                    out_regions.append(extra)
            if q.get("type") == "MCQ" and pages:
                first_page = min(pages)
                previous_page = first_page - 1
                previous_source = next((entry for entry in catalog.get("sourceFiles", [])
                                        if int(entry["from"]) <= previous_page <= int(entry["to"])), None)
                if previous_source and previous_page not in pages:
                    previous_path = pdf_root / previous_source["url"].lstrip("/")
                    if previous_path.exists():
                        if str(previous_path) not in cache:
                            cache[str(previous_path)] = fitz.open(previous_path)
                        previous_doc = cache[str(previous_path)]
                        previous_index = previous_page - int(previous_source["from"])
                        if 0 <= previous_index < previous_doc.page_count:
                            shared_region = _previous_page_shared_group(
                                previous_doc.load_page(previous_index), int(q.get("number") or 0), previous_page
                            )
                            if shared_region:
                                out_regions.insert(0, shared_region)
            if q.get("type") == "MCQ" and not any(
                    r.get("segmentRole") == "questionBody" or
                    (r.get("segmentRole") is None and r.get("rect") is not None)
                    for r in out_regions):
                # If a shared-group stimulus names this question but the target
                # number/stem is absent on that page, inspect only adjacent pages
                # in the same source PDF. Candidate association remains manual.
                context_region = next((r for r in out_regions
                                       if r.get("segmentRole") == "sharedStimulus"
                                       and r.get("signals", {}).get("sharedContextOnly")), None)
                if context_region:
                    context_page = int(context_region["page"])
                    context_source = next((entry for entry in catalog.get("sourceFiles", [])
                                           if int(entry["from"]) <= context_page <= int(entry["to"])), None)
                    adjacent_page = context_page + 1
                    adjacent_source = next((entry for entry in catalog.get("sourceFiles", [])
                                            if int(entry["from"]) <= adjacent_page <= int(entry["to"])), None)
                    if (context_source and adjacent_source
                            and context_source.get("url") == adjacent_source.get("url")):
                        adjacent_path = pdf_root / adjacent_source["url"].lstrip("/")
                        if adjacent_path.exists():
                            if str(adjacent_path) not in cache:
                                cache[str(adjacent_path)] = fitz.open(adjacent_path)
                            adjacent_doc = cache[str(adjacent_path)]
                            adjacent_index = adjacent_page - int(adjacent_source["from"])
                            if 0 <= adjacent_index < adjacent_doc.page_count:
                                adjacent_obj = adjacent_doc.load_page(adjacent_index)
                                candidate = _adjacent_shared_question_candidate(
                                    adjacent_obj, q, context_region, adjacent_page,
                                    by_page.get(adjacent_page, []))
                                if candidate:
                                    if adjacent_obj.rotation and candidate.get("rect"):
                                        rotated = fitz.Rect(candidate["rect"]) * adjacent_obj.rotation_matrix
                                        candidate["rect"] = [round(v, 2) for v in rotated]
                                    out_regions.append(candidate)
            has_body = any(r.get("segmentRole") == "questionBody"
                           or (r.get("segmentRole") is None and r.get("rect") is not None)
                           for r in out_regions)
            unresolved = not has_body or any(r.get("extractionStatus") == "unresolved" for r in out_regions)
            extraction_status = ("unresolved" if unresolved else
                                 ("candidate-needs-manual-verification"
                                  if any(r.get("extractionStatus") == "candidate-needs-manual-verification"
                                         for r in out_regions) else "proposed"))
            results.append({"id": q.get("id"), "type": q.get("type"), "number": q.get("number"),
                            "sourceDocument": q.get("source"), "regions": out_regions,
                            "extractionStatus": extraction_status,
                            "automaticApplicationEligible": False,
                            "approvalStatus": "proposal-only",
                            "manualReview": unresolved or any(r.get("manualReview", True) for r in out_regions),
                            "confidence": round(min((r.get("confidence", 0) for r in out_regions), default=0), 2)})
    finally:
        for doc in cache.values():
            doc.close()
    return {"schemaVersion": 1, "method": "pymupdf-text-layout-plus-page-graphics",
            "automaticApplicationEnabled": False, "approvalStatus": "proposal-only",
            "questionCount": len(results),
            "manualReviewCount": sum(bool(q.get("manualReview")) for q in results), "questions": results}


def apply_high_confidence(catalog: dict[str, Any], proposals: dict[str, Any]) -> tuple[dict[str, Any], int]:
    """Compatibility stub: Phase 2 candidates cannot be automatically applied."""
    return catalog, 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="ChemAtlas checkout root")
    parser.add_argument("--catalog", type=Path, help="Question catalog JSON (default: ROOT/public/questions.json)")
    parser.add_argument("--stimuli", type=Path, help="Shared-stimulus metadata (default: ROOT/research/stimuli.json when present)")
    parser.add_argument("--pdf-root", type=Path, help="Root containing source PDF paths (default: ROOT/public)")
    parser.add_argument("--output", type=Path, default=Path("question-boundary-proposals.json"))
    parser.add_argument("--apply-high-confidence", action="store_true", help="disabled in Phase 2")
    parser.add_argument("--catalog-output", type=Path, help="required with --apply-high-confidence; never overwrites the input catalog")
    args = parser.parse_args()
    if args.apply_high_confidence:
        parser.error("automatic proposal application is disabled during Phase 2; review proposals manually")
    catalog_path = args.catalog or args.root / "public/questions.json"
    stimuli_path = args.stimuli or args.root / "research/stimuli.json"
    stimuli = json.loads(stimuli_path.read_text(encoding="utf-8")) if stimuli_path.exists() else None
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    result = detect(catalog, args.pdf_root or args.root / "public", stimuli)
    if args.apply_high_confidence and not args.catalog_output:
        parser.error("--catalog-output is required with --apply-high-confidence")
    if args.catalog_output and not args.apply_high_confidence:
        parser.error("--catalog-output requires --apply-high-confidence")
    applied = 0
    if args.apply_high_confidence:
        updated_catalog, applied = apply_high_confidence(catalog, result)
        args.catalog_output.parent.mkdir(parents=True, exist_ok=True)
        args.catalog_output.write_text(json.dumps(updated_catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"questions": result["questionCount"], "manualReview": result["manualReviewCount"], "highConfidenceApplied": applied, "output": str(args.output), "catalogOutput": str(args.catalog_output) if args.catalog_output else None}))


if __name__ == "__main__":
    main()
