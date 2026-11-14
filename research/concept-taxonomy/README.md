# Concept taxonomy research inputs

These two files are the original research inputs for the ChemAtlas concept-classification project. They were copied unchanged on 2026-11-14 from the owner's `Downloads/ChemAtlas_Concept_Research_Files` folder. Do not edit them; corrections belong in the normalized taxonomy (`research/concepts/concepts.v1.source.json`).

| File | SHA-256 |
| --- | --- |
| `ChemAtlas_AP_Chemistry_Concept_Research.md` | `57f8425e7b94d79ed1d9071e4859884f59da1492d31be62e75af886371ff0a1d` |
| `ChemAtlas_AP_Chemistry_Concept_Taxonomy.json` | `0261a26b815c1777732e4c4b96af0c21a335d9535344c86857b58e46309bd378` |

`node scripts/concepts/cli.mjs build-taxonomy` re-validates these inputs (hashes, the 9/91/814/810/57 counts, topic IDs against the live catalog) and records how every research micro-concept label maps to a canonical concept in `research/concepts/taxonomy.v1.json`. `tests/concept-taxonomy.test.mjs` fails if either file changes.

Status: research candidates, not an official College Board list and not a tagging of any ChemAtlas question.
