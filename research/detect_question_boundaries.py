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
SHARED_GROUP = re.compile(r"^\s*questions?\s+(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})\s+(?:refer|use|are|will|should|answer)\b", re.I)
PAGE_BOILERPLATE = re.compile(r"(?:GO ON TO THE NEXT PAGE|END OF EXAM|Copyright|©\s*(?:19|20)\d{2}|The College Board\. All rights reserved|(?:www\.|apcentral\.)?collegeboard\.com|^\s*Version\s+[A-Z]\s*$)", re.I)
PAGE_FOOTER = re.compile(r"(?:GO ON TO THE NEXT PAGE|END OF EXAM|S\s*T\s*O\s*P|Copyright|©\s*(?:19|20)\d{2}|The College Board\. All rights reserved|collegeboard\.com|Web or Mass distribution prohibited|Unauthorized copying or reuse)", re.I)
PAGE_HEADER = re.compile(r"(?:Unit\s+\d+\s+Progress\s+Check|Test\s+Booklet|AP\s+Chemistry\s+20\d{2}.*Free[- ]Response\s+Questions|^\s*(?:19|20)\d{2}\s+AP\s*$|^\s*®?\s*CHEMISTRY\s+FREE[- ]RESPONSE\s+QUESTIONS\s*$|^\s*FREE[- ]RESPONSE\s+QUESTIONS\s*$|^\s*CHEMISTRY\s*$|^\s*SECTION\s+[IVX]+\s*$|^\s*\d+\s+Questions\s*$)", re.I)
QUESTION_INSTRUCTION = re.compile(
    r"^\s*Answer\s+Questions?\s+\d+(?:\s*[-–]\s*\d+)?\s+(?:below|in this part)\b.*(?:score weighting|percent|minutes?)?",
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


def _ocr_scanned_lines(page: fitz.Page, scale: float = 2.0) -> list[dict[str, Any]]:
    """Use bounded local OCR to estimate content boxes on image-only pages.

    OCR supports geometry only: low-native-text pages remain manual-review cases.
    The timeout and graceful fallback prevent a scan from stalling an audit batch.
    """
    if not shutil.which("tesseract"):
        return []
    try:
        png = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False).tobytes("png")
        run = subprocess.run(
            ["tesseract", "stdin", "stdout", "tsv", "--psm", "11"],
            input=png, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=15, check=True,
        )
    except (OSError, subprocess.SubprocessError, RuntimeError):
        return []
    grouped: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for row in run.stdout.decode("utf-8", errors="replace").splitlines()[1:]:
        fields = row.split("\t", 11)
        if len(fields) != 12 or fields[0] != "5" or not fields[11].strip():
            continue
        try:
            confidence = float(fields[10])
            x, y, w, h = (float(fields[i]) / scale for i in (6, 7, 8, 9))
        except ValueError:
            continue
        if confidence < 35 or w <= 0 or h <= 0:
            continue
        key = tuple(fields[i] for i in (2, 3, 4))
        item = grouped.setdefault(key, {"words": [], "rect": fitz.Rect(x, y, x + w, y + h), "conf": []})
        item["words"].append(fields[11].strip())
        item["rect"] |= fitz.Rect(x, y, x + w, y + h)
        item["conf"].append(confidence)
    return [{"text": " ".join(item["words"]), "rect": item["rect"],
             "ocrConfidence": round(sum(item["conf"]) / len(item["conf"]), 1)}
            for item in grouped.values()]


def _is_full_page_raster(page: fitz.Page) -> bool:
    bounds = page.rect * page.derotation_matrix if page.rotation else page.rect
    return any((box := _rect(image.get("bbox")))
               and box.width >= bounds.width * .95
               and box.height >= bounds.height * .90
               for image in page.get_image_info())


def _visual_rects(page: fitz.Page) -> list[fitz.Rect]:
    """Collect image placements and non-trivial vector drawing bounds."""
    found: list[fitz.Rect] = []
    try:
        for image in page.get_image_info(xrefs=True):
            box = _rect(image.get("bbox"))
            if box and box.width > 2 and box.height > 2:
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
    for item in page_questions or []:
        for region in item.get("sourceRegions", []):
            box = _rect(region.get("rect")) if region.get("rect") else None
            if box and box.width <= page_width * 0.68:
                hints.append((box.x0 + box.x1) / 2)
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
                              min(col_x1, body_union.x1 + 8), min(page.rect.y1, body_union.y1 + 18))
        stimulus_id = hashlib.sha256(
            f"{question.get('source','')}:{page_number}:{group_first}-{group_last}:{match.group(0).lower()}".encode()
        ).hexdigest()[:16]
        full_page_raster = _is_full_page_raster(page)
        complete_choices = _complete_choice_sequence(shared_labels)
        unresolved = not complete_choices
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
                        "graphicsExpected": True, "graphicsIncluded": len(context_visual),
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
    lines = _text_lines(page)
    native_text_chars = sum(len(line["text"]) for line in lines)
    ocr_used = False
    if native_text_chars < 25:
        ocr_lines = _ocr_scanned_lines(page)
        if ocr_lines:
            lines = ocr_lines
            ocr_used = True
    visual = _visual_rects(page)
    text_chars = sum(len(line["text"]) for line in lines)
    question_type = question.get("type", "MCQ")
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

    # If catalog metadata is incomplete, accept a numbered line only when uniquely inside
    # the stored estimate. This avoids guessing from page-wide numbering in tables.
    if anchor is None and prior:
        nearby = [a for a in anchors if prior.x0 - 30 <= a["rect"].x0 <= prior.x1 + 30 and prior.y0 - 100 <= a["rect"].y0 <= prior.y1]
        if len(nearby) == 1 and (not expected or nearby[0]["number"] == expected):
            anchor = nearby[0]
    if anchor is None:
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
            continuation_header = next((line for line in lines
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
                                 and not PAGE_BOILERPLATE.search(line["text"])]
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
            boxes = [line["rect"] for line in continuation_text] + visual_continuation
            if boxes:
                union = boxes[0]
                for box in boxes[1:]:
                    union |= box
                candidate = _expand(union, 20, 16, bounds)
            else:
                candidate = prior
            score = 0.36 if text_chars >= 25 else 0.08
            continuation_reasons = ["No repeated numbered FRQ heading was found; the page continuation was bounded from its explicit continuation heading and remains manual-review only."]
            if continuation_context:
                continuation_reasons.append("Setup text above the first detected subpart was retained with the continuation page.")
            if source_quality_flags:
                continuation_reasons.append("The source contains answer-revealing annotations or answer-key markings; use a clean exam source before approval.")
            if metadata_year_mismatch:
                continuation_reasons.append(f"Source text identifies year(s) {source_years}, which do not match catalog year {metadata_year}; verify source provenance before approval.")
            return {"page": page_number, "rect": [round(v, 2) for v in candidate],
                    "confidence": score, "confidenceBand": "low", "manualReview": True,
                    "signals": {"textCharacters": sum(len(line["text"]) for line in continuation_text),
                                "pageTextCharacters": text_chars, "questionStartFound": False,
                                "questionStartMatches": len(matching), "nextQuestionBoundaryFound": bool(later_questions),
                                "answerChoiceMarkers": 0, "answerChoiceSequence": False,
                                "frqSubpartMarkers": len(labels), "frqSubpartLabels": labels,
                                "frqSubpartSequence": _subpart_sequence(labels),
                                "graphicsIncluded": len(visual_continuation), "linkedStimulusRegions": 0,
                                "columnCount": len(columns), "pageRotation": int(page.rotation),
                                "continuationPageDetected": True,
                                "introContextLinesIncluded": len(continuation_context),
                                "sourceQualityFlags": source_quality_flags,
                                "sourceYears": source_years,
                                "catalogYear": metadata_year,
                                "sourceMetadataMismatch": metadata_year_mismatch},
                    "reasons": continuation_reasons}
        return {"page": page_number, "rect": [round(v, 2) for v in prior] if prior else None,
                "confidence": 0.08 if prior else 0.0, "confidenceBand": "low", "manualReview": True,
                "signals": {"textCharacters": text_chars, "questionStartFound": False,
                            "questionStartMatches": len(matching), "nextQuestionBoundaryFound": False,
                            "answerChoiceMarkers": 0, "answerChoiceSequence": False,
                            "frqSubpartMarkers": 0, "frqSubpartLabels": [], "frqSubpartSequence": False,
                            "graphicsIncluded": 0, "linkedStimulusRegions": len(_stimulus_context(question, stimuli, page_number)),
                            "columnCount": 0, "pageRotation": int(page.rotation),
                            "sourceQualityFlags": source_quality_flags,
                            "sourceYears": source_years,
                            "catalogYear": metadata_year,
                            "sourceMetadataMismatch": metadata_year_mismatch},
                "reasons": ["Expected numbered question start was not located; the prior crop is retained unchanged for manual review." ]
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
                if line["rect"].y0 - last_instruction["rect"].y1 > 20:
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
        intro_context = preceding[-3:]
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
    content_boxes = [line["rect"] for line in included_text] + visual_in_band + linked + context_visual
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
        "answerChoiceSequence": choice_sequence,
        "expectedAnswerChoiceMarkers": expected_choice_count,
        "answerChoiceCoverage": choices >= expected_choice_count if expected_choice_count else None,
        "frqSubpartMarkers": subparts,
        "frqSubpartLabels": subpart_labels,
        "frqSubpartSequence": subpart_sequence,
        "graphicsIncluded": len(visual_in_band),
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
        "fullPageRaster": _is_full_page_raster(page),
        "singleQuestionFullWidthOverride": single_frq_anchor_wide_source,
        "tableDependencyDetected": bool(re.search(r"\btable\s+(?:above|shown\s+above|on\s+the\s+previous\s+page)\b", full_text, re.I)),
        "tableDependencyResolved": table_dependency["resolved"],
        "tableDependencyGraphics": len(table_dependency["boxes"]),
        "boxedStatementDependencyDetected": box_cue,
        "boxedStatementDependencyResolved": bool(semantic_tail) if box_cue and question_type == "FRQ" else None,
        "semanticTailLinesIncluded": len(semantic_tail),
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
    graphics_missing = graphics_expected and not visual_in_band and not linked
    suspicious_column_geometry = signals["suspiciousColumnGeometry"]
    unresolved_dependency = (signals["tableDependencyDetected"] and not signals["tableDependencyResolved"])
    unresolved_boxed_statement = (signals["boxedStatementDependencyDetected"]
                                  and question_type == "FRQ"
                                  and not signals["boxedStatementDependencyResolved"])
    manual = (region_text_chars < 25 or not anchor or score < 0.58 or choices_incomplete
              or ambiguous_linked_context or text_mismatch or graphics_missing
              or bool(source_quality_flags) or metadata_year_mismatch or suspicious_column_geometry
              or unresolved_dependency or unresolved_boxed_statement or native_text_chars < 25)
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
            results.append({"id": q.get("id"), "type": q.get("type"), "number": q.get("number"),
                            "sourceDocument": q.get("source"), "regions": out_regions,
                            "manualReview": any(r.get("manualReview", True) for r in out_regions),
                            "confidence": round(min((r.get("confidence", 0) for r in out_regions), default=0), 2)})
    finally:
        for doc in cache.values():
            doc.close()
    return {"schemaVersion": 1, "method": "pymupdf-text-layout-plus-page-graphics", "questionCount": len(results),
            "manualReviewCount": sum(bool(q.get("manualReview")) for q in results), "questions": results}


def apply_high_confidence(catalog: dict[str, Any], proposals: dict[str, Any]) -> tuple[dict[str, Any], int]:
    """Return a separate catalog value with only fully high-confidence crops replaced."""
    by_id = {item.get("id"): item for item in proposals.get("questions", [])}
    output_questions = []
    applied = 0
    for original in catalog.get("questions", []):
        question = dict(original)
        proposal = by_id.get(question.get("id"))
        regions = proposal.get("regions", []) if proposal else []
        eligible = bool(regions) and all(
            not region.get("manualReview") and region.get("confidenceBand") == "high" and region.get("rect")
            for region in regions
        )
        if eligible:
            question["sourceRegions"] = [{"page": region["page"], "rect": region["rect"]} for region in regions]
            applied += 1
        output_questions.append(question)
    return {**catalog, "questions": output_questions}, applied


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="ChemAtlas checkout root")
    parser.add_argument("--catalog", type=Path, help="Question catalog JSON (default: ROOT/public/questions.json)")
    parser.add_argument("--stimuli", type=Path, help="Shared-stimulus metadata (default: ROOT/research/stimuli.json when present)")
    parser.add_argument("--pdf-root", type=Path, help="Root containing source PDF paths (default: ROOT/public)")
    parser.add_argument("--output", type=Path, default=Path("question-boundary-proposals.json"))
    parser.add_argument("--apply-high-confidence", action="store_true", help="write a separate catalog with only non-manual high-confidence regions applied")
    parser.add_argument("--catalog-output", type=Path, help="required with --apply-high-confidence; never overwrites the input catalog")
    args = parser.parse_args()
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
