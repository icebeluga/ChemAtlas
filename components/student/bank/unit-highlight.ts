const controllers = new WeakMap<HTMLElement, { stop: () => void }>();
const hoverQuery = "(hover:hover) and (pointer:fine) and (min-width:701px)";
type Card = { button: HTMLElement; face: HTMLElement; title: HTMLElement; number: HTMLElement; count: HTMLElement | null; base: number; width: number; target: number; minimum: number; peak: number; left: number };

export function resetUnitAccordion(row: HTMLElement | null) { if (row) controllers.get(row)?.stop(); }

/** The real buttons share one fixed width budget. No floating faces or hover queues. */
export function connectUnitAccordion(row: HTMLElement) {
  let cards: Card[] = [], frame = 0, last = 0, active = -1;
  let origin = 0, gap = 0, previousX = NaN, previousY = NaN;
  const hover = matchMedia(hoverQuery), reduced = matchMedia("(prefers-reduced-motion:reduce)");
  const token = getComputedStyle(row).getPropertyValue("--ca-fast").trim();
  const response = parseFloat(token) * (token.endsWith("ms") ? 1 : 1000) / 4;

  function stop() {
    cancelAnimationFrame(frame); frame = 0; last = 0; active = -1;
    cards.forEach(({ button, title }) => {
      button.style.removeProperty("flex"); button.style.removeProperty("height");
      title.style.removeProperty("opacity");
      button.removeAttribute("data-accordion-dark");
    });
    cards = []; row.removeAttribute("data-accordion"); row.style.removeProperty("height");
    previousX = previousY = NaN;
  }

  function prepare() {
    if (cards.length) return;
    const box = row.getBoundingClientRect(); origin = box.left;
    gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const buttons = [...row.querySelectorAll<HTMLElement>(":scope>.ca-unit")];
    // Read resting geometry before writing. The fixed height also bounds multiline labels.
    cards = buttons.map(button => {
      const rect = button.getBoundingClientRect(), face = button.querySelector<HTMLElement>(".ca-unit-highlight")!;
      return { button, face, title: face.querySelector<HTMLElement>(":scope>span")!, number: face.querySelector<HTMLElement>(".ca-unit-number")!, count: face.querySelector<HTMLElement>("small"), base: rect.width,
        width: rect.width, target: rect.width, minimum: Math.min(rect.width, box.width < 1000 ? 48 : Math.max(48, Math.min(56, box.height))),
        peak: Math.max(rect.width + 16, Math.min(240, box.width * .33)), left: rect.left };
    });
    row.style.height = `${box.height}px`; row.dataset.accordion = "";
    cards.forEach(card => { card.button.style.height = `${box.height}px`; });
    paint();
  }

  function allocate(index: number) {
    cards.forEach(card => { card.target = card.base; });
    if (index < 0) return;
    const chosen = cards[index];
    const desired = chosen.button.classList.contains("is-all") ? Math.max(chosen.base + 12, 88) : chosen.peak;
    const capacity = cards.reduce((sum, card, i) => sum + (i === index ? 0 : card.base - card.minimum), 0);
    const extra = Math.min(desired - chosen.base, capacity);
    // Borrow on both sides for centered growth. Near row edges, the other side
    // supplies the remainder; the first/last card never leaves the container.
    function borrow(indices: number[], amount: number) {
      let remaining = amount;
      for (let pass = 0; pass < cards.length && remaining > .001; pass++) {
        const donors = indices.filter(i => cards[i].target > cards[i].minimum + .001);
        const weights = donors.map(i => 1 / Math.abs(i - index) ** 2);
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        if (!total) break;
        let supplied = 0;
        donors.forEach((i, j) => {
          const amount = Math.min(cards[i].target - cards[i].minimum, remaining * weights[j] / total);
          cards[i].target -= amount; supplied += amount;
        });
        remaining -= supplied;
      }
      return amount - remaining;
    }
    const left = cards.map((_, i) => i).filter(i => i < index);
    const right = cards.map((_, i) => i).filter(i => i > index);
    const supplied = borrow(left, extra / 2) + borrow(right, extra / 2);
    const rest = borrow([...left, ...right], extra - supplied);
    chosen.target += supplied + rest;
  }

  function paint() {
    let left = origin;
    cards.forEach(card => {
      card.left = left; left += card.width + gap;
      card.button.style.flex = `0 0 ${card.width}px`;
      // Counts gently slide below numbers as a card becomes square-like.
      const stack = Math.max(0, Math.min(1, (90 - card.width) / 26));
      const center = Math.max(0, card.width - 16) / 2 * stack;
      card.number.style.transform = `translate(calc(${center}px - ${stack * 50}%),0)`;
      if (card.count) card.count.style.transform = `translate(calc(${-center}px + ${stack * 50}%),${14 * stack}px)`;
      const expansion = Math.max(0, (card.width - card.base) / Math.max(1, card.peak - card.base));
      const visible = card.width >= 200 ? Math.min(1, (card.width - 160) / 40) : 0;
      card.title.style.opacity = `${visible}`;
      card.button.toggleAttribute("data-accordion-dark", expansion > .15 || card.button.getAttribute("aria-pressed") === "true");
    });
  }

  function tick(time: number) {
    frame = 0;
    const alpha = 1 - Math.exp(-Math.min(32, last ? time - last : 16) / response); last = time;
    let moving = false;
    cards.forEach(card => {
      card.width += (card.target - card.width) * alpha;
      if (Math.abs(card.target - card.width) < .01) card.width = card.target;
      else moving = true;
    });
    paint();
    if (moving) frame = requestAnimationFrame(tick);
    else { last = 0; if (active < 0) stop(); }
  }

  function choose(index: number, immediate = false) {
    if (index === active) return;
    active = index; allocate(index);
    if (immediate || reduced.matches) {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      cards.forEach(card => { card.width = card.target; }); paint();
      if (index < 0) stop();
    } else if (!frame) frame = requestAnimationFrame(tick);
  }

  function move(event: PointerEvent) {
    if (!hover.matches || !["mouse", "pen"].includes(event.pointerType)) return;
    // Layout can dispatch boundary events as cards resize. Never retarget on
    // those events, nor on an unchanged coordinate; only real pointer movement.
    if (event.clientX === previousX && event.clientY === previousY) return;
    previousX = event.clientX; previousY = event.clientY;
    prepare();
    const current = cards[active];
    if (current && event.clientX >= current.left - 2 && event.clientX <= current.left + current.width + 2) return;
    const index = cards.findIndex(card => event.clientX >= card.left && event.clientX <= card.left + card.width);
    if (index >= 0) choose(index);
  }
  const leave = () => { previousX = previousY = NaN; if (cards.length) choose(-1); };
  function focus(event: FocusEvent) {
    const button = (event.target as HTMLElement).closest<HTMLElement>(".ca-unit");
    if (!button?.matches(":focus-visible") || !hover.matches) return;
    prepare(); choose(cards.findIndex(card => card.button === button), true);
  }
  const blur = () => { if (!row.matches(":hover")) stop(); };
  row.addEventListener("pointermove", move); row.addEventListener("pointerleave", leave);
  row.addEventListener("focusin", focus); row.addEventListener("focusout", blur);
  window.addEventListener("resize", stop); window.addEventListener("scroll", stop, true);
  hover.addEventListener("change", stop); reduced.addEventListener("change", stop);
  controllers.set(row, { stop });
  return () => {
    stop(); controllers.delete(row);
    row.removeEventListener("pointermove", move); row.removeEventListener("pointerleave", leave);
    row.removeEventListener("focusin", focus); row.removeEventListener("focusout", blur);
    window.removeEventListener("resize", stop); window.removeEventListener("scroll", stop, true);
    hover.removeEventListener("change", stop); reduced.removeEventListener("change", stop);
  };
}
