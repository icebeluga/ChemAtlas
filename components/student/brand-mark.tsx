import { sitePath } from "#student-content";
import "../../app/branding.css";

/** All application wordmarks use the same unmodified master SVG. */
export function BrandMark() {
  return <span className="ca-brand">
    {/* Static Pages serves the canonical SVG directly, without an image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="ca-brand-logo" src={sitePath("blueberry.svg")} width="272" height="250" alt="" aria-hidden="true" />
    <span>Blueberry</span>
  </span>;
}
