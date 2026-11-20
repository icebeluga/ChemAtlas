const controllers = new WeakMap<HTMLElement, { stop: () => void }>();
const hoverQuery = "(hover:hover) and (pointer:fine) and (min-width:701px)";
const smooth = (low: number, high: number, value: number) => {
  const x = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return x * x * (3 - 2 * x);
};

type Tab = {
  button: HTMLElement; face: HTMLElement; sheets: HTMLElement[]; headers: HTMLElement[];
  numbers: HTMLElement[]; counts: HTMLElement[]; title: HTMLElement; restTitle?: HTMLElement;
  bars: HTMLElement[]; slot: DOMRect; extra: number; gain: number; shift: number;
  titleTop: number; titleHeight: number; barBottom: number; selected: boolean; all: boolean;
  value: number; target: number; painted?: number;
};

export function resetUnitWave(row: HTMLElement | null) { if (row) controllers.get(row)?.stop(); }

/** One proximity field and one frame loop for the whole row; no React frame updates. */
export function connectUnitWave(row: HTMLElement) {
  if (!HTMLElement.prototype.showPopover) return () => {};
  let stage: HTMLElement | undefined, tabs: Tab[] = [], frame = 0, last = 0, pointer = false;
  const hover = matchMedia(hoverQuery), reduced = matchMedia("(prefers-reduced-motion:reduce)");
  const token = getComputedStyle(row).getPropertyValue("--ca-fast").trim();
  const response = parseFloat(token) * (token.endsWith("ms") ? 1 : 1000) / 4;

  function stop() {
    cancelAnimationFrame(frame); frame = 0; last = 0; pointer = false;
    tabs.forEach(tab => tab.button.removeAttribute("data-wave"));
    stage?.remove(); stage = undefined; tabs = [];
  }

  function prepare() {
    if (stage) return;
    stage = document.createElement("i");
    stage.className = "ca-unit-wave-stage"; stage.popover = "manual"; stage.setAttribute("aria-hidden", "true");
    row.appendChild(stage); stage.showPopover();
    // Geometry and text layout are measured once per entry, never in the frame loop.
    tabs = [...row.querySelectorAll<HTMLElement>(":scope>.ca-unit")].map(button => {
      const slot = button.getBoundingClientRect(), style = getComputedStyle(button);
      const all = button.classList.contains("is-all"), selected = button.getAttribute("aria-pressed") === "true";
      const peakWidth = all ? slot.width + 8 : Math.max(slot.width + 12, 224);
      const peakHeight = all ? slot.height + 4 : Math.max(slot.height + 6, 66);
      const peakLeft = Math.max(8, Math.min(innerWidth - peakWidth - 8, slot.x + (slot.width - peakWidth) / 2));
      const face = button.querySelector<HTMLElement>(".ca-unit-highlight")!.cloneNode(true) as HTMLElement;
      face.removeAttribute("popover");
      if (button.dataset.u) face.dataset.u = button.dataset.u;
      if (all) face.dataset.all = "";
      Object.assign(face.style, { left: `${slot.x}px`, top: `${slot.y}px`, width: `${slot.width}px`, height: `${slot.height}px` });
      const sheets = ["rest", "deep"].map(tone => {
        const sheet = document.createElement("i"); sheet.className = `ca-unit-sheet is-${tone}`;
        if (tone === "rest") Object.assign(sheet.style, { background: style.backgroundColor, borderRadius: style.borderRadius, borderBottom: `${style.borderBottomWidth} solid ${style.borderBottomColor}` });
        face.insertBefore(sheet, face.firstChild); return sheet;
      });
      const header = face.querySelector<HTMLElement>(":scope>b")!;
      const baseHeader = button.querySelector<HTMLElement>(":scope>b")!;
      const headerBox = baseHeader.getBoundingClientRect();
      const restHeader = header.cloneNode(true) as HTMLElement;
      restHeader.classList.add("is-rest-content");
      restHeader.style.color = getComputedStyle(baseHeader).color;
      const baseCount = baseHeader.querySelector("small"), restCount = restHeader.querySelector<HTMLElement>("small");
      if (baseCount && restCount) restCount.style.color = getComputedStyle(baseCount).color;
      const headers = [restHeader, header];
      headers.forEach(el => Object.assign(el.style, { top: `${headerBox.y - slot.y}px`, font: getComputedStyle(baseHeader).font }));
      face.appendChild(restHeader);
      const title = face.querySelector<HTMLElement>(":scope>span")!;
      const baseTitle = button.querySelector<HTMLElement>(":scope>span:not(.ca-sr)");
      const titleTop = baseTitle ? baseTitle.getBoundingClientRect().y - slot.y : 25;
      const restTitle = baseTitle ? title.cloneNode(true) as HTMLElement : undefined;
      title.style.width = `${peakWidth - 16}px`;
      if (restTitle && baseTitle) {
        restTitle.classList.add("is-rest-content");
        Object.assign(restTitle.style, { width: `${slot.width - 16}px`, color: getComputedStyle(baseTitle).color });
        face.appendChild(restTitle);
      }
      const bar = face.querySelector<HTMLElement>(":scope>.ca-heat");
      const baseBar = button.querySelector<HTMLElement>(":scope>.ca-heat");
      const bars: HTMLElement[] = [];
      let barBottom = 9;
      if (bar && baseBar) {
        barBottom = slot.bottom - baseBar.getBoundingClientRect().bottom;
        const restBar = bar.cloneNode(true) as HTMLElement;
        restBar.classList.add("is-rest-content");
        [...restBar.children].forEach((segment, index) => { (segment as HTMLElement).style.background = getComputedStyle(baseBar.children[index]).backgroundColor; });
        bars.push(restBar, bar); face.appendChild(restBar);
        bars.forEach(el => { el.style.bottom = `${barBottom}px`; });
      }
      stage!.appendChild(face);
      return { button, face, sheets, headers, title, restTitle, bars, slot,
        numbers: headers.map(el => el.querySelector<HTMLElement>(".ca-unit-number")!),
        counts: headers.flatMap(el => [...el.querySelectorAll<HTMLElement>("small")]),
        extra: peakWidth - slot.width, gain: peakHeight - slot.height,
        shift: peakLeft + peakWidth / 2 - slot.x - slot.width / 2,
        titleTop, titleHeight: title.getBoundingClientRect().height, barBottom, selected, all, value: 0, target: 0 };
    });
    tabs.forEach(tab => { tab.button.dataset.wave = ""; draw(tab); });
  }

  function draw(tab: Tab) {
    tab.painted = tab.value;
    const p = tab.value, width = tab.slot.width + tab.extra * p, height = tab.slot.height + tab.gain * p;
    const dark = smooth(.15, .85, p);
    tab.face.style.transform = `translate(${tab.shift * p}px,${-2 * p}px)`;
    tab.sheets.forEach(el => { el.style.transform = `scale(${width / tab.slot.width},${height / tab.slot.height})`; });
    tab.sheets[1].style.opacity = `${dark}`;
    tab.headers.forEach((el, i) => { el.style.transform = `translateY(${-tab.gain * p}px)`; if (i) el.style.opacity = `${dark}`; });
    tab.numbers.forEach(el => { el.style.transform = `translateX(${-tab.extra * p / 2}px)`; });
    tab.counts.forEach(el => { el.style.transform = `translateX(${tab.extra * p / 2}px)`; });
    const nameY = tab.titleTop + ((tab.all ? tab.titleTop : 25) - tab.gain - tab.titleTop) * p;
    const available = Math.max(0, height - (tab.all ? tab.titleTop : 25) - (tab.barBottom + (6 - tab.barBottom) * p) - 5);
    const scale = tab.all || tab.selected ? 1 : Math.min(1, (width - 16) / (tab.slot.width + tab.extra - 16), available / tab.titleHeight);
    tab.title.style.transform = `translate(${-tab.extra * p / 2}px,${nameY}px) scale(${scale})`;
    tab.title.style.opacity = `${dark}`;
    if (tab.restTitle) {
      tab.restTitle.style.transform = `translate(${-tab.extra * p / 2}px,${nameY}px)`;
    }
    tab.bars.forEach((el, i) => {
      el.style.transform = `translateY(${(tab.barBottom - 6) * p}px) scaleX(${(width - 16) / (tab.slot.width - 16)})`;
      if (i) el.style.opacity = `${dark}`;
    });
  }

  function paint() {
    tabs.forEach(tab => { if (tab.value !== tab.painted) draw(tab); });
    [...tabs].sort((a, b) => a.value - b.value).forEach((tab, rank) => {
      const z = `${rank + 1}`; if (tab.face.style.zIndex !== z) tab.face.style.zIndex = z;
    });
  }

  function tick(time: number) {
    frame = 0;
    const alpha = 1 - Math.exp(-Math.min(32, last ? time - last : 16) / response);
    last = time;
    let moving = false;
    tabs.forEach(tab => {
      tab.value += (tab.target - tab.value) * alpha;
      if (Math.abs(tab.target - tab.value) < .0001) tab.value = tab.target;
      else moving = true;
    });
    paint();
    if (moving) frame = requestAnimationFrame(tick);
    else { last = 0; if (!pointer && tabs.every(tab => tab.value === 0)) stop(); }
  }

  function move(event: PointerEvent) {
    if (!hover.matches || !["mouse", "pen"].includes(event.pointerType)) return;
    prepare(); pointer = true;
    const centers = tabs.map(tab => tab.slot.x + tab.slot.width / 2);
    const nearest = centers.reduce((best, center, i) => Math.abs(center - event.clientX) < Math.abs(centers[best] - event.clientX) ? i : best, 0);
    tabs.forEach((tab, i) => {
      const neighbor = event.clientX < centers[i] ? centers[i - 1] : centers[i + 1];
      const pitch = (neighbor === undefined ? Math.abs(centers[i] - centers[i ? i - 1 : i + 1]) : Math.abs(neighbor - centers[i])) || tab.slot.width + 4;
      tab.target = reduced.matches ? Number(i === nearest) : Math.exp(-1.5 * ((event.clientX - centers[i]) / pitch) ** 2);
    });
    if (reduced.matches) { cancelAnimationFrame(frame); frame = 0; tabs.forEach(tab => { tab.value = tab.target; }); paint(); }
    else if (!frame) frame = requestAnimationFrame(tick);
  }

  function leave() {
    pointer = false;
    if (reduced.matches) { stop(); return; }
    tabs.forEach(tab => { tab.target = 0; });
    if (stage && !frame) frame = requestAnimationFrame(tick);
  }
  function focus(event: FocusEvent) {
    const button = (event.target as HTMLElement).closest<HTMLElement>(".ca-unit");
    if (!button?.matches(":focus-visible") || !hover.matches) return;
    stop(); prepare();
    tabs.forEach(tab => { tab.value = tab.target = Number(tab.button === button); }); paint();
  }
  const blur = () => { if (!pointer) stop(); };
  row.addEventListener("pointermove", move); row.addEventListener("pointerleave", leave);
  row.addEventListener("focusin", focus); row.addEventListener("focusout", blur);
  window.addEventListener("resize", stop); window.addEventListener("scroll", stop, true);
  hover.addEventListener("change", stop); reduced.addEventListener("change", stop);
  controllers.set(row, { stop });
  row.dataset.waveReady = "";
  return () => {
    stop(); controllers.delete(row); row.removeAttribute("data-wave-ready");
    row.removeEventListener("pointermove", move); row.removeEventListener("pointerleave", leave);
    row.removeEventListener("focusin", focus); row.removeEventListener("focusout", blur);
    window.removeEventListener("resize", stop); window.removeEventListener("scroll", stop, true);
    hover.removeEventListener("change", stop); reduced.removeEventListener("change", stop);
  };
}
