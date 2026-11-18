import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFEmbeddedPage, PDFPage } from "pdf-lib";
import { getStimuli } from "#student-content";
import { planWorksheet } from "./worksheet.mjs";
import { originalSourcePages } from "./question-source";
import type { QuestionSource } from "./question-source";
import type { ContentBlock, WorksheetContent } from "./worksheet-content";
import type { Draft, ExportMode, Region, Registry } from "./worksheet";

export type WorksheetQuestion = QuestionSource & { id: string; type: "MCQ" | "FRQ"; number: number; exam: string; source: string; displayTopic?: string; displayName?: string; stimulusIds?: string[] };
export type Crop = { png: Uint8Array; width: number; height: number };

export function orderedEntries(draft: Draft, questions: Map<string, WorksheetQuestion>) {
  const group = (id: string) => {
    const q = questions.get(id);
    return draft.format.grouping === "type" ? q?.type === "MCQ" ? "0" : "1" :
      draft.format.grouping === "topic" ? q?.displayTopic ?? "~" : "";
  };
  return [...draft.entries].sort((a, b) => group(a.id).localeCompare(group(b.id), "en", { numeric: true }));
}

export async function composeWorksheet(draft: Draft, catalog: WorksheetQuestion[], registry: Registry,
  mode: ExportMode, content: WorksheetContent, loadFragments: () => Promise<Uint8Array>, render: (region: Region, question?: WorksheetQuestion) => Promise<Crop>) {
  const stimuli = getStimuli();
  const questions = new Map(catalog.map(q => [q.id, q]));
  const entries = orderedEntries(draft, questions).map(e => {
    const q = questions.get(e.id);
    if (!q) throw new Error(`Question ${e.id} is missing from this catalog.`);
    const printable = !q.sourceBank || q.sourceBank === "mega" ? content.questions[q.id] : undefined;
    return { ...e, q, printable, source: !q.sourceBank || q.sourceBank === "mega" ? registry.questions[q.id] : undefined };
  });
  // If an unreviewed source page contains a shared stimulus or a reviewed
  // prompt, render that page once for the whole set. Never trust draft crops.
  const fallbackPages = new Set<string>();
  const pageKey = (q: WorksheetQuestion, page: number) => `${q.sourceBank || "mega"}:${page}`;
  const useFallback = new Set<string>();
  for (const { q, printable } of entries) {
    if (!printable?.blocks.length || (q.stimulusIds?.length && !printable.context)) useFallback.add(q.id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const { q } of entries) {
      const pages = [...originalSourcePages(q), ...(q.stimulusIds ?? []).flatMap(id =>
        (stimuli.stimuli[id as keyof typeof stimuli.stimuli]?.regions ?? []).map(region => region.page))];
      if (useFallback.has(q.id) || pages.some(page => fallbackPages.has(pageKey(q, page)))) {
        useFallback.add(q.id);
        for (const page of pages) {
          const key = pageKey(q, page);
          if (!fallbackPages.has(key)) { fallbackPages.add(key); changed = true; }
        }
      }
    }
  }
  const fallback = new Map(planWorksheet(entries.filter(({ q }) => useFallback.has(q.id)).map(({ q }) => ({ ...q, sourceRegions: undefined })),
    stimuli.stimuli, originalSourcePages).map(({ question, segments }) => [question.id, segments]));
  const usedContexts = new Set<string>();
  if (draft.format.references && mode !== "answers" && !registry.references.length) throw new Error("The reference tables are unavailable. Turn off AP reference tables to export the questions.");
  if (!entries.length) throw new Error("Add at least one question to generate a PDF.");
  if (mode !== "questions" && !entries.some(e => e.source?.answer)) throw new Error("This worksheet has no verified answers.");

  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const symbols = await pdf.embedFont(StandardFonts.Symbol);
  const heading = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const f = draft.format;
  const paper = f.paper === "A4" ? [595.28, 841.89] : [612, 792];
  const [width, height] = f.landscape ? [...paper].reverse() : paper;
  const margin = f.margin, available = width - 2 * margin, floor = margin + (f.pageNumbers ? 12 : 0);
  const ink = rgb(.14, .21, .18), forest = rgb(.06, .31, .24), rule = rgb(.72, .76, .74);
  pdf.setTitle(f.title || draft.name);
  let page: PDFPage, y = 0;
  function addPage() { page = pdf.addPage([width, height]); y = height - margin; }
  function ensure(space: number) { if (y - space < floor - .001) addPage(); }
  function safe(text: string) {
    return Array.from(text).map(char => {
      try { body.encodeText(char); return char; } catch { return "?"; }
    }).join("");
  }
  function wrap(value: string, size: number, face = body) {
    const lines: string[] = [];
    for (const paragraph of safe(value).split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        if (current && face.widthOfTextAtSize(`${current} ${word}`, size) > available) {
          lines.push(current); current = "";
        }
        for (const char of (current ? " " : "") + word) {
          if (current && face.widthOfTextAtSize(current + char, size) > available) {
            lines.push(current); current = "";
          }
          current += char;
        }
      }
      lines.push(current);
    }
    return lines;
  }
  function write(text: string, size = f.font, face = body, color = ink) {
    for (const line of wrap(text, size, face)) {
      ensure(size + 4);
      page.drawText(line, { x: margin, y: y - size, size, font: face, color });
      y -= size + 4;
    }
  }
  type PrintableBlock = { height: number; draw: (top: number, scale: number) => void };
  type Run = { text: string; shift: number };
  const inlineRuns = (word: string): Run[] => word.split(/([_^]\{[^{}]*\})/).filter(Boolean)
    .map(text => /^[\^_]\{/.test(text)
      ? { text: text.slice(2, -1), shift: text[0] === "^" ? 1 : -1 }
      : { text, shift: 0 });
  const fontFor = (char: string) => /[αβγΔδμλπσΩ→←⇌−]/.test(char) ? symbols : body;
  function glyph(char: string) {
    const font = fontFor(char);
    try { font.encodeText(char); return { font, char }; }
    catch { return { font: body, char: safe(char) }; }
  }
  const runSize = (run: Run) => f.font * (run.shift ? .73 : 1);
  const runWidth = (run: Run) => Array.from(run.text).reduce((sum, char) => {
    const g = glyph(char);
    return sum + g.font.widthOfTextAtSize(g.char, runSize(run));
  }, 0);
  function paragraph(text: string, inset = 0, maxWidth = available - inset): PrintableBlock {
    const lines: Run[][] = [[]];
    let used = 0;
    const space = { text: " ", shift: 0 };
    for (const word of text.split(/\s+/)) {
      const runs = inlineRuns(word);
      const width = runs.reduce((sum, run) => sum + runWidth(run), 0);
      if (used && used + runWidth(space) + width > maxWidth) { lines.push([]); used = 0; }
      if (used) { lines.at(-1)!.push(space); used += runWidth(space); }
      lines.at(-1)!.push(...runs); used += width;
    }
    const leading = f.font + 4;
    return { height: lines.length * leading, draw(top, scale) {
      lines.forEach((line, i) => {
        let x = margin + inset * scale;
        for (const run of line) for (const char of run.text) {
          const g = glyph(char);
          const size = runSize(run) * scale;
          page.drawText(g.char, { x, y: top - ((i * leading) + f.font - run.shift * f.font * .28) * scale, size, font: g.font, color: ink });
          x += g.font.widthOfTextAtSize(g.char, size);
        }
      });
    } };
  }
  function answerChoices(choices: string[]): PrintableBlock {
    return stack(choices.map((text, index) => paragraph(`(${String.fromCharCode(65 + index)})  ${text}`, 13)), 1);
  }
  function stack(blocks: PrintableBlock[], gap = 4): PrintableBlock {
    return { height: blocks.reduce((sum, block) => sum + block.height, 0) + Math.max(0, blocks.length - 1) * gap,
      draw(top, scale) { for (const block of blocks) { block.draw(top, scale); top -= (block.height + gap) * scale; } } };
  }
  let fragmentDocument: Promise<PDFDocument> | undefined;
  const fragments = new Map<number, PDFEmbeddedPage>();
  async function diagramBlock(index: number): Promise<PrintableBlock> {
    let fragment = fragments.get(index);
    if (!fragment) {
      fragmentDocument ??= loadFragments().then(bytes => PDFDocument.load(bytes));
      const source = (await fragmentDocument).getPage(index);
      const box = source.getCropBox();
      fragment = await pdf.embedPage(source, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height });
      fragments.set(index, fragment);
    }
    const vector = fragment;
    const fit = Math.min(1.2, available / vector.width);
    return { height: vector.height * fit, draw(top, scale) {
      const s = fit * scale;
      page.drawPage(vector, { x: margin, y: top - vector.height * s, width: vector.width * s, height: vector.height * s });
    } };
  }
  async function questionBlock(block: ContentBlock): Promise<PrintableBlock> {
    switch (block.kind) {
      case "region": return diagramBlock(block.fragment);
      case "paragraph": return paragraph(block.text);
      case "choices": return answerChoices(block.choices);
      case "table": return stack(block.rows.map(row => paragraph(row.join("   |   "), 8)), 2);
    }
  }
  function placeBlock(block: PrintableBlock, label: string, citation: string, instructions = "", continuation = "") {
    const headingHeight = (text: string) => text ? wrap(text, f.font, heading).length * (f.font + 4) : 0;
    let labelHeight = headingHeight(label)
      + (citation ? wrap(citation, 9).length * 13 : 0)
      + (instructions ? wrap(instructions, f.font).length * (f.font + 4) : 0) + 4;
    const fit = Math.min(1, (height - margin - floor - labelHeight) / block.height);
    const remaining = (y - floor - labelHeight) / block.height;
    let scale = remaining < fit && remaining >= fit * .92 ? remaining : fit;
    if (y - labelHeight - block.height * scale < floor - .001) {
      if (continuation) { label = continuation; labelHeight += headingHeight(label); }
      addPage();
      scale = Math.min(1, (y - floor - labelHeight) / block.height);
    }
    if (label) write(label, f.font, heading, forest);
    if (instructions) write(instructions);
    if (citation) write(citation, 9);
    y -= 4;
    block.draw(y, scale);
    y -= block.height * scale;
  }

  async function place(region: Region, label: string, citation: string, options: { reserve?: number; instructions?: string; question?: WorksheetQuestion } = {}) {
    const crop = await render(region, options.question);
    const labelHeight = (label ? wrap(label, f.font, heading).length * (f.font + 4) : 0)
      + (citation ? wrap(citation, 9).length * 13 : 0)
      + (options.instructions ? wrap(options.instructions, f.font).length * (f.font + 4) : 0) + 5;
    const full = height - margin - floor - labelHeight;
    const widthScale = Math.min(1.2, available / crop.width);
    const fit = Math.min(widthScale, full / crop.height);
    const room = options.reserve ?? 0;
    const reservedScale = Math.min(widthScale, (full - room) / crop.height);
    const reserve = room > 0 && reservedScale >= Math.min(fit * .90, .72) ? room : 0;
    let scale = reserve ? reservedScale : fit;
    const current = (y - floor - labelHeight - reserve) / crop.height;
    if (current < scale && current >= scale * .87) scale = current;
    ensure(labelHeight + crop.height * scale + reserve);
    if (label) write(label, f.font, heading, forest);
    if (options.instructions) write(options.instructions);
    if (citation) write(citation, 9);
    y -= 5;
    const image = await pdf.embedPng(crop.png);
    const h = crop.height * scale;
    page.drawImage(image, { x: margin, y: y - h, width: crop.width * scale, height: h });
    y -= h;
  }

  if (mode !== "answers") {
    addPage();
    write(f.title || draft.name, Math.max(19, f.font + 8), heading, forest);
    if (f.subtitle) write(f.subtitle);
    const fields = [f.name && "Name ____________________", f.date && "Date ____________", f.classField && "Class ____________"].filter(Boolean).join("    ");
    if (fields) { y -= 4; write(fields, Math.min(f.font, 11)); }
    if (f.instructions) { y -= 6; write(f.instructions); }
    y -= 10;
    let previousGroup: string | undefined;
    for (const [i, entry] of entries.entries()) {
      const { q, source } = entry;
      const label = `Question ${i + 1}`;
      const group = f.grouping === "type" ? q.type === "FRQ" ? f.frqTitle : f.mcqTitle :
        f.grouping === "topic" ? [q.displayTopic, q.displayName].filter(Boolean).join(" · ") || "Other topics" : "";
      if (entry.breakBefore && i) addPage();
      const groupKey = f.grouping === "type" ? q.type : group;
      const sectionStart = groupKey !== previousGroup;
      const section = sectionStart ? group : "";
      previousGroup = groupKey;
      const sectionInstructions = f.grouping === "type" && sectionStart ? q.type === "FRQ" ? f.frqInstructions : f.mcqInstructions : "";
      const lineCount = q.type === "FRQ" ? entry.lines ?? f.lines : 0;
      const citation = f.citations ? `${source?.exam ?? q.exam} · original Q${q.number} · ${q.source} · page ${originalSourcePages(q).join(", ")}` : "";
      const segments = fallback.get(q.id);
      if (segments) {
        const title = [section, f.numbering ? label : ""].filter(Boolean).join(" — ");
        if (!segments.length) {
          write([title, "See source page included earlier."].filter(Boolean).join(" · "));
        }
        for (const [part, segment] of segments.entries()) {
          const regions = segment.regions.length ? segment.regions : [{ page: segment.page, rect: [] }];
          for (const [index, region] of regions.entries()) {
            const first = part === 0 && index === 0;
            await place(region, first ? title : f.numbering ? `${label} (continued)` : "Continued",
              [first ? citation : "", segment.regions.length ? "" : "Full source page. May contain adjacent questions or printed answers."].filter(Boolean).join(" · "),
              { instructions: first ? sectionInstructions : "", question: q });
          }
        }
      } else {
        const { blocks, context } = entry.printable!;
        const shared = context && !usedContexts.has(context) ? content.contexts[context] : [];
        if (!shared) throw new Error(`Shared context is missing for ${q.exam}, question ${q.number}.`);
        if (context) usedContexts.add(context);
        const blockGroups = q.type === "MCQ" ? [[...shared, ...blocks]] :
          [[...shared, blocks[0]], ...blocks.slice(1).map(block => [block])];
        for (const [part, groupBlocks] of blockGroups.entries()) {
          const block = stack(await Promise.all(groupBlocks.map(questionBlock)));
          const number = f.numbering ? part ? `${label} (continued)` : label : part ? "Continued" : "";
          if (part) y -= 5;
          const title = part ? "" : [section, number].filter(Boolean).join(" — ");
          placeBlock(block, title, part ? "" : citation, part ? "" : sectionInstructions, part ? number : "");
        }
      }
      for (let line = 0; line < lineCount; line++) {
        if (y - 16 < floor) { addPage(); write(f.numbering ? `${label} — response space` : "Response space", f.font, heading, forest); }
        y -= 16;
        page!.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: .5, color: rule });
      }
      y -= f.gap;
    }
    if (f.references) for (const [i, p] of registry.references.entries()) {
      addPage();
      await place({ page: p, rect: [] }, i ? "Reference tables (continued)" : "AP Chemistry reference tables", `2023 AP Chemistry exam · compiled PDF page ${p}`);
    }
  }
  if (mode !== "questions") {
    addPage();
    write("Answer key", 20, heading, forest);
    write(f.title || draft.name);
    y -= 8;
    for (const [i, { q, source }] of entries.entries()) {
      const number = f.numbering ? i + 1 : `${source?.exam ?? q.exam}, Q${q.number}`;
      write(`${number}.  ${source?.answer ?? "Verified answer unavailable"}`);
    }
    y -= 8;
    write(`Printed key source: 2008 AP Chemistry Practice Exam · compiled PDF page ${registry.answerKeyPage}.`, 9);
  }
  if (f.pageNumbers) pdf.getPages().forEach((p, i) => {
    const label = `${i + 1} / ${pdf.getPageCount()}`;
    p.drawText(label, { x: width - margin - body.widthOfTextAtSize(label, 9), y: margin - 2, size: 9, font: body, color: ink });
  });
  return pdf.save();
}
