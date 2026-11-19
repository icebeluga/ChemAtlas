export type ViewerZoom = "width" | "page" | number;
type Dimensions = { width: number; height: number };

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const MAX_RENDER_PIXELS = 16_000_000;

export function clampZoom(scale: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
}

export function stepZoom(scale: number, direction: -1 | 1) {
  return clampZoom((Math.round(scale * 4) + direction) / 4);
}

export function fitWidthScale(width: number, pageWidth: number) {
  return clampZoom(Math.min(2, width / pageWidth));
}

export function fitPageScale(available: Dimensions, page: Dimensions) {
  return clampZoom(Math.min(available.width / page.width, available.height / page.height));
}

export function resolveViewerScale(zoom: ViewerZoom, available: Dimensions, page: Dimensions) {
  if (zoom === "width") return fitWidthScale(available.width, page.width);
  if (zoom === "page") return fitPageScale(available, page);
  return clampZoom(zoom);
}

export function capRenderScale(page: Dimensions, scale: number, density: number) {
  const desired = scale * Math.max(1, density);
  const pixels = (factor: number) =>
    Math.max(1, Math.ceil(page.width * factor)) * Math.max(1, Math.ceil(page.height * factor));
  if (pixels(desired) <= MAX_RENDER_PIXELS) return desired;

  // Cap the backed canvas, including rounding up to whole pixels.
  let low = 0;
  let high = Math.sqrt(MAX_RENDER_PIXELS / (page.width * page.height));
  for (let i = 0; i < 32; i++) {
    const middle = (low + high) / 2;
    if (pixels(middle) <= MAX_RENDER_PIXELS) low = middle;
    else high = middle;
  }
  return low * (1 - Number.EPSILON);
}
