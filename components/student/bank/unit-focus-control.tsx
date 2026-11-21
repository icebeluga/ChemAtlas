"use client";

import { useId, type RefObject } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Scan } from "lucide-react";

/** A sibling of the unit selector, never an interactive child of that button. */
export function UnitFocusControl({ label, onActivate, container, placement = "card", unit }: {
  label: string; onActivate: () => void; container: RefObject<HTMLElement | null>;
  placement?: "card" | "mobile" | "header"; unit?: string;
}) {
  const description = useId();
  return <Tooltip.Root>
    <Tooltip.Trigger type="button" className={`ca-unit-focus is-${placement}`} data-u={unit}
      aria-label={label} aria-describedby={description} delay={250} onClick={event => { event.stopPropagation(); onActivate(); }}>
      <Scan size={16} aria-hidden="true" />
    </Tooltip.Trigger>
    <Tooltip.Portal container={container}>
      <Tooltip.Positioner className="ca-unit-focus-tip-positioner" side="bottom" align="end"
        positionMethod="fixed" sideOffset={5} collisionPadding={8}>
        <Tooltip.Popup id={description} role="tooltip" className="ca-unit-focus-tip">{label}</Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>;
}
