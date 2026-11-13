import type { PDFPageProxy } from "pdfjs-dist";

export type Region = { page: number; rect: number[] };
export type SourceFile = { url: string; from: number; to: number };
export type QuestionSource = { pages: number[]; sourcePagesOriginal?: number[]; sourceBank?: string };

export function originalSourcePages(question: QuestionSource): number[] {
  if (question.sourceBank && question.sourceBank !== "mega") return question.pages;
  return question.sourcePagesOriginal?.length ? question.sourcePagesOriginal : question.pages;
}

export function sourcePageLocation(page: number, files: SourceFile[], bankId?: string) {
  if (bankId && bankId !== "mega") return { page, bankId, url: undefined };
  const file = files.find(item => page >= item.from && page <= item.to);
  return { page: file ? page - file.from + 1 : page, bankId: undefined, url: file?.url ?? "/ap-chemistry-mega.pdf" };
}

export function sourceBounds(page: PDFPageProxy, regions: Region[] = [], padding = 0) {
  const { width, height } = page.getViewport({ scale: 1 });
  const rects = regions.map(region => region.rect).filter(rect =>
    rect.length === 4 && rect.every(Number.isFinite) && rect[0] < rect[2] && rect[1] < rect[3]);
  if (!rects.length) return { x: 0, y: 0, width, height };
  const x = Math.max(0, Math.min(...rects.map(rect => rect[0])) - padding);
  const y = Math.max(0, Math.min(...rects.map(rect => rect[1])) - padding);
  const right = Math.min(width, Math.max(...rects.map(rect => rect[2])) + padding);
  const bottom = Math.min(height, Math.max(...rects.map(rect => rect[3])) + padding);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : { x: 0, y: 0, width, height };
}

export function renderSourceCanvas(page: PDFPageProxy, canvas: HTMLCanvasElement, bounds: ReturnType<typeof sourceBounds>, scale: number, density = 1) {
  canvas.width = Math.ceil(bounds.width * scale * density);
  canvas.height = Math.ceil(bounds.height * scale * density);
  return page.render({
    canvas, viewport: page.getViewport({ scale }), background: "#fff",
    transform: [density, 0, 0, density, -bounds.x * scale * density, -bounds.y * scale * density],
  });
}
