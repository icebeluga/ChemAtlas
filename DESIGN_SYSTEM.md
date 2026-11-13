# ChemAtlas design system

ChemAtlas uses an academic editorial style for headings and a compact scientific workspace for navigation, forms, and documents. The system uses native controls, React, and CSS. Lucide supplies icons used in the shared navigation, card, and document controls.

## Tokens

`app/atlas-tokens.css` owns the palette, typography, spacing, and motion values. `app/atlas-workspace.css` applies them to the shared shell, directories, catalog, worksheet workflow, and document workspaces. Existing supporting tools keep their established markup and inherit these tokens.

| Role | Tokens | Ink / soft fill |
| --- | --- | --- |
| Brand, current navigation, primary action, success | `--ca-brand`, `--ca-brand-soft` | `#005C48` / `#E7F3ED` |
| MCQ and document information | `--ca-blue`, `--ca-blue-soft` | `#315A92` / `#EAF2FF` |
| FRQ, classification and multi-concept evidence | `--ca-purple`, `--ca-purple-soft` | `#70469B` / `#F1EBFA` |
| Topic codes and curriculum exploration | `--ca-teal`, `--ca-teal-soft` | `#236B82` / `#E3F2F4` |
| Review and attention | `--ca-amber`, `--ca-amber-soft` | `#955310` / `#FFF0DB` |
| Errors and destructive actions | `--ca-coral`, `--ca-coral-soft` | `#AA453E` / `#FBECE9` |
| Neutral canvas and panel | `--ca-canvas`, `--ca-surface` | `#F6F8F5` / `#FFFFFF` |
| Warm educational and cool utility surfaces | `--ca-surface-warm`, `--ca-surface-cool` | `#F8F5EE` / `#F1F5F8` |
| Primary and supporting text | `--ca-text`, `--ca-text-muted` | `#1B2A24` / `#56675D` |
| Divider and control boundaries | `--ca-border`, `--ca-control-border` | `#D9E3DB` / `#7C9487` |

The existing `--color-*` aliases reference these palette primitives. Brand hover stays `#004B3C`. The stronger amber accent `#B36A1B` is reserved for non-text accents.

Green, teal and blue form the analogous core. Purple and amber separate question classification and attention from the brand. Coral is reserved for errors and destructive actions. Apply 60–30–10 as a balance of neutral space, supporting surfaces and small points of emphasis.

Use blue MCQ and purple FRQ badges alongside their text labels. Use teal topic codes, pale ivory educational notes, purple classification evidence, an amber “Needs print review” label, and a green “Added” state. Keep secondary actions and filter fields neutral, and maintain an outline or visible state marker for active controls. Avoid amber FRQ badges, multicolored primary actions, and saturated full-card fills. The source PDF canvas keeps its own colors.

Color roles are separate from category names and state labels. Text requires 4.5:1 contrast and meaningful non-text indicators 3:1. Run `node scripts/verify-color-contrast.mjs` after changing a palette primitive. Adobe’s protanopia, deuteranopia, and tritanopia simulations show that some hues converge. Badge wording, control labels, visible focus, and selected-state indicators carry the meaning in grayscale.

Headings use IBM Plex Serif at 28–32px and section headings at 20–24px. Inter handles 17px card titles, 15px body text, 14px controls, 13px supporting text, 12px labels, and 28px tabular statistics. CSS clamp scales the headings. PDF text and figures retain the original source appearance.

Spacing uses 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64px. Standard controls are 44px high. Compact document and filter controls are generally 36px high. Inputs and actions have an 8px radius, cards 10px, and workspace panels 14px.

## Components and layout

- `AtlasButton` provides primary, secondary, tertiary, ghost, destructive, and icon variants. It supports disabled and busy states. Use a text label or an accessible name for every action.
- `DirectoryCard` makes one keyboard-operable destination from its label, title, and supporting data. `FilterChip` names the exact filter it removes.
- Browse by Unit uses `UnitDirectoryCard` for nine individually navigable curriculum destinations. The card keeps the unit label, title and live counts together, uses Lucide line icons, and assigns only the icon tile and identifier a restrained brand/teal/amber/blue accent. Hover elevates the card by 2px; keyboard focus uses the shared focus token.
- Question details expose a Previous/Next sequence bar above the PDF workspace. It uses neutral surfaces and brand-green controls, with a centered position label; disabled boundaries remain visibly labeled. The same control uses a compact three-column layout on mobile.
- The Browse by Unit introduction uses a mint-neutral gradient and a narrow brand rule instead of illustrative hero artwork. Its four independent metrics use brand green for records, blue for curriculum topics, amber for MCQ count, and teal for FRQ count. These accents identify metric categories; primary navigation and primary actions remain brand green.
- Browse by Unit uses a 3-column unit grid on wide screens, 2 columns on tablet, and one column on mobile. Its metrics use four columns on wide screens and two columns below 1,200px. The directory follows natural page scrolling rather than compressing nine cards into a fixed-height viewport.
- The shared page measure uses fluid gutters and caps ordinary pages at 1,600px. Document workspaces can use 1,760px. Unit and topic grids use intrinsic tracks with 340px and 260px preferred minimums. The question viewer and its collapsible classification panel share a row from 1,100px up. Below that, the viewer takes the full width and classification follows it.
- Question Bank keeps controls above a single scrolling results pane when the viewport is at least 48rem wide and 42rem tall. Smaller viewports use page scrolling. Container queries adapt result cards, PDF toolbars and the Practice Builder draft controls to their available space. The draft header uses twelve equal tracks and lets its fields and actions span more tracks as space shrinks.
- Hover uses 150ms color and border transitions. The unit disclosure and step selection use 180ms. The shared scale also defines a 220ms expansion role. Reduced motion removes added transitions. Content and PDF pages remain stationary.
- The shell includes a skip link. Unit navigation opens on desktop hover and has a separate disclosure for keyboard and touch. Selection and status always include visible text or a distinguishable control state. Use native selects for the existing topic and unit options and preserve their platform keyboard behavior.

## References

- Semantic surfaces and spacing — [Carbon color](https://www.carbondesignsystem.com/building-blocks/foundations/color/overview), [Carbon spacing](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview), [Geist colors](https://vercel.com/geist/colors)
- Typography and reflow — [Geist typography](https://vercel.com/geist/typography), [Utopia](https://utopia.fyi/type/calculator/), [MDN CSS Grid](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Grids)
- Action hierarchy and filters — [Carbon buttons](https://www.carbondesignsystem.com/building-blocks/core/components/button/guidelines), [Spectrum action button](https://spectrum.adobe.com/web/swc/components/action-button), [PatternFly filters](https://www.patternfly.org/patterns/filters/design-guidelines/)
- Implementation and accessibility — [shadcn theming](https://ui.shadcn.com/docs/theming), [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility), [PDF.js examples](https://mozilla.github.io/pdf.js/examples/), [Vercel interface guidelines](https://vercel.com/design/guidelines), [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
