const motions = new WeakMap<HTMLElement, Animation>();
const pointerHover = "(hover:hover) and (pointer:fine) and (min-width:701px)";

/** Visual-only top-layer faces escape the workspace clip without changing card slots. */
export function unitHighlight(button: HTMLElement, show: boolean, immediate = false) {
  const face = button.querySelector<HTMLElement>(".ca-unit-highlight");
  if (!face || !face.showPopover || (show && !matchMedia(pointerHover).matches)) return;
  const open = face.matches(":popover-open");
  if (!show && !open) return;
  if (!show && face.style.opacity === "0" && !immediate) return;

  if (show) {
    button.parentElement?.querySelectorAll<HTMLElement>(".ca-unit").forEach(other => {
      if (other !== button) unitHighlight(other, false, immediate);
    });
    if (!open) {
      const slot = button.getBoundingClientRect();
      const width = button.classList.contains("is-all") ? slot.width + 12 : Math.max(slot.width + 24, 264);
      const left = Math.max(8, Math.min(innerWidth - width - 8, slot.x + (slot.width - width) / 2));
      face.style.width = `${width}px`;
      face.style.setProperty("--unit-slot-height", `${slot.height}px`);
      face.showPopover();
      const height = face.offsetHeight;
      face.style.left = `${left}px`;
      face.style.top = `${slot.bottom - height}px`;
      face.dataset.retracted = `translate(${slot.x + slot.width / 2 - left - width / 2}px,0) scale(${slot.width / width},${slot.height / height})`;
      face.style.transform = face.dataset.retracted;
      face.style.opacity = "0";
    }
  }

  // Read the in-flight pose before canceling, so reversing a tab never restarts
  // from a fully closed/open pose. Each neighbor can retract while the next rises.
  const current = getComputedStyle(face);
  const from = { transform: current.transform, opacity: current.opacity };
  motions.get(face)?.cancel();
  motions.delete(face);
  const to = { transform: show ? "translateY(-6px)" : face.dataset.retracted!, opacity: show ? "1" : "0" };
  Object.assign(face.style, to);
  const finish = () => { if (!show && face.isConnected && face.matches(":popover-open")) face.hidePopover(); };
  if (immediate || matchMedia("(prefers-reduced-motion:reduce)").matches) {
    finish();
    return;
  }
  // Production CSS may normalize 240ms to .24s; WAAPI always takes milliseconds.
  const duration = current.getPropertyValue("--ca-unit-motion").trim();
  const animation = face.animate([from, to], { duration: parseFloat(duration) * (duration.endsWith("ms") ? 1 : 1000), easing: current.getPropertyValue("--ca-out").trim() });
  motions.set(face, animation);
  void animation.finished.then(() => {
    if (motions.get(face) !== animation) return;
    motions.delete(face);
    finish();
  }, () => {});
}

export const unitHighlightEvents = {
  onPointerEnter: (event: { currentTarget: HTMLElement; pointerType: string }) => {
    if (event.pointerType === "mouse" || event.pointerType === "pen") unitHighlight(event.currentTarget, true);
  },
  onPointerLeave: (event: { currentTarget: HTMLElement }) => unitHighlight(event.currentTarget, false),
  onFocus: (event: { currentTarget: HTMLElement }) => {
    if (event.currentTarget.matches(":focus-visible")) unitHighlight(event.currentTarget, true, true);
  },
  onBlur: (event: { currentTarget: HTMLElement }) => unitHighlight(event.currentTarget, false, true),
};
