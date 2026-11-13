# Practice Builder design

Problem-Attic's public tour separates question selection, organization, formatting and actual PDF generation. ChemAtlas uses the same task order in a standalone route inside its existing app shell. Drafts store stable catalog IDs and layout settings separately from progress and classification. Persistent browser storage supports reopening, and JSON backups support moving worksheets between browsers.

The catalog references split source PDFs and includes estimated crop coordinates. These can omit shared prompts, figures, and continuations. Export uses a separate conservative source registry. Known booklet crops must contain exactly one matching number and five answer labels. Shared contexts require explicit review. Released 2005 FRQ continuations are taken from their original bundled pages. The printed key on compiled page 2064 applies to its own 2008 practice booklet, even though those records currently use a different catalog year.

PDF.js renders approved source regions at 300 DPI and PDF-LIB composes the print document from lossless PNGs. This preserves the printed glyphs and excludes invisible PDF content outside the crop. Source references remain attached. Layout keeps each image intact, labels continuation pages, reserves response space when it fits, and rejects missing sources or unverified crops. Preview renders the exact exported bytes.

References

- https://www.problem-attic.com/help/intro
- https://pdf-lib.js.org/docs/api/classes/pdfdocument
