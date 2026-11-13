#!/usr/bin/env python3
"""Render source-page and proposal-crop comparisons for a bounded audit batch."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--proposals", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--contact-sheet", type=Path, required=True)
    parser.add_argument("question_ids", nargs="+")
    return parser.parse_args()


def pil_image(pixmap: fitz.Pixmap) -> Image.Image:
    mode = "RGBA" if pixmap.alpha else "RGB"
    return Image.frombytes(mode, (pixmap.width, pixmap.height), pixmap.samples).convert("RGB")


def fit_contain(image: Image.Image, width: int, height: int) -> Image.Image:
    copy = image.copy()
    copy.thumbnail((width, height), Image.Resampling.LANCZOS)
    return copy


def source_for_page(source_files: list[dict], page_number: int) -> tuple[str, int]:
    for source in source_files:
        if source["from"] <= page_number <= source["to"]:
            return source["url"].lstrip("/"), page_number - source["from"]
    raise ValueError(f"No source mapping for catalog page {page_number}")


def render_panel(
    root: Path,
    source_files: list[dict],
    question: dict,
    region: dict,
    region_index: int,
) -> Image.Image:
    page_number = int(region["page"])
    source_path, local_index = source_for_page(source_files, page_number)
    with fitz.open(root / "public" / source_path) as document:
        page = document.load_page(local_index)
        scale = 2.0
        matrix = fitz.Matrix(scale, scale)
        full = pil_image(page.get_pixmap(matrix=matrix, alpha=False))
        rect = fitz.Rect(region["rect"])
        crop = pil_image(page.get_pixmap(matrix=matrix, clip=rect, alpha=False))

    draw = ImageDraw.Draw(full)
    draw.rectangle(
        tuple(round(value * scale) for value in rect),
        outline=(220, 30, 30),
        width=6,
    )

    panel_width, panel_height = 2300, 1550
    header_height = 120
    margin = 30
    column_width = (panel_width - margin * 3) // 2
    body_height = panel_height - header_height - margin
    full_display = fit_contain(full, column_width, body_height)
    crop_display = fit_contain(crop, column_width, body_height)

    panel = Image.new("RGB", (panel_width, panel_height), "white")
    panel.paste(full_display, (margin, header_height))
    panel.paste(crop_display, (margin * 2 + column_width, header_height))
    heading = (
        f"{question['id']} | {question['type']} | source page {page_number} | "
        f"segment {region_index + 1}/{len(question['regions'])} | "
        f"confidence {region['confidence']:.2f} ({region['confidenceBand']}) | "
        f"manual={region['manualReview']}"
    )
    ImageDraw.Draw(panel).text((margin, 22), heading, fill="black", font=ImageFont.load_default(size=28))
    ImageDraw.Draw(panel).text((margin, 72), "Original page with proposed boundary", fill=(160, 0, 0), font=ImageFont.load_default(size=22))
    ImageDraw.Draw(panel).text((margin * 2 + column_width, 72), "Proposed crop", fill=(0, 80, 0), font=ImageFont.load_default(size=22))
    return panel


def main() -> None:
    args = parse_args()
    root = args.root.resolve()
    catalog = json.loads((root / "public/questions.json").read_text())
    proposals = json.loads((root / args.proposals).read_text())
    by_id = {question["id"]: question for question in proposals["questions"]}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.contact_sheet.parent.mkdir(parents=True, exist_ok=True)

    panels: list[Image.Image] = []
    for question_id in args.question_ids:
        question = by_id[question_id]
        for region_index, region in enumerate(question["regions"]):
            panel = render_panel(root, catalog["sourceFiles"], question, region, region_index)
            panel_path = args.output_dir / f"{question_id}-segment-{region_index + 1}.png"
            panel.save(panel_path, optimize=True)
            panels.append(panel)

    if not panels:
        raise ValueError("No audit panels were generated")
    panels[0].save(args.contact_sheet, "PDF", resolution=150, save_all=True, append_images=panels[1:])
    print(json.dumps({"questions": len(args.question_ids), "panels": len(panels), "contactSheet": str(args.contact_sheet)}))


if __name__ == "__main__":
    main()
