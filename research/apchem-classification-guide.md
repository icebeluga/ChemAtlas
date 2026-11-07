# AP Chemistry classification research and decision guide

Reviewed 2026-11-07 against the College Board CED effective Fall 2024. The College Board 2026–27 course-change table identifies this edition as current. The June 2026 clarification sheet describes changes to front matter, resource locations, and Progress Check language; it does not replace the chemistry topic hierarchy.

Sources:
- https://apcentral.collegeboard.org/media/pdf/ap-chemistry-course-and-exam-description.pdf
- https://apcentral.collegeboard.org/media/pdf/ap-chemistry-course-and-exam-description-clarifications.pdf
- https://apcentral.collegeboard.org/courses/how-ap-develops-courses-and-exams/course-changes-overview

## Canonical hierarchy

Use the nine units and 91 topics in `apchem-taxonomy.json`. Each topic has a concise reasoning description, current learning-objective ID, and both printed and physical PDF page references. `apchem-topic-reference.md` is a compact reference for classification. Unit 9 is **Thermodynamics and Electrochemistry**. The current learning objectives are numbered by topic (e.g. 7.6.A); older TRA/ENE/SAP identifiers or 2013 numeric objectives are useful source evidence but are not current topic IDs.

The hierarchy presented to users is unit → topic → question. For classification, identify the reasoning required by each question or part first, choose the specific matching topic, then derive its unit from that topic. Never choose a broad unit from a few words and force all parts into it.

## Evidence and record rules

1. Read the complete stem, all choices, shared stimulus, tables, diagrams, and continuation pages. Preserve original page and question numbers. Separate neighboring columns before reading. A question cannot be reliably classified if another question's stem or choices have been concatenated with it.
2. Identify the requested operation: calculate, explain, draw, identify, compare, or predict. Name the chemical relationship needed to perform it. Match that relationship to the CED topic's learning objective and essential knowledge.
3. Use official question-to-topic tables where available, checking edition and question identity. Crosswalk historical learning objectives by their meaning, not their numeric code. Scoring guides can clarify the expected reasoning, but classification need not solve a question or invent an answer key.
4. Assign the most specific directly assessed topic. Do not tag routine prerequisites unless the prompt explicitly tests them. A stoichiometric pH question does not automatically belong in all of moles, solutions, equilibrium, and acids/bases.
5. For FRQs, classify each lettered part and, where concepts differ, each roman-numeral subpart. Store the evidence span and its page/rectangle. Cross-list the full FRQ under the union of its part topics. Choose the primary topic by scoring emphasis when known, otherwise the substantive demand across parts; preserve ties in a rationale rather than pretending the choice is objective.
6. For MCQs, use the full question and choices to determine the target. Distractor concepts should not create extra topic tags. Multiple tags are justified only when distinct concepts are needed to answer the actual prompt.
7. Record short evidence-based reasons. Distinguish `source-mapped`, `content-reviewed`, `tentative`, `legacy`, and `extraction-review`. Do not turn a keyword count into a confidence percentage.
8. Unknown answer, unknown year, unreadable question, out-of-scope content, and uncertain topic are different problems. Preserve them separately. A missing answer does not prevent topic classification when the prompt is clear.
9. Preserve every source appearance and stable IDs. Store manual corrections and source-mapping evidence separately from generated suggestions so reimporting cannot erase them.
10. Validate coverage separately from accuracy: reconcile question numbering within each exam, inspect page gaps, check duplicate/split question records, and audit representative completed classifications plus all ambiguous boundaries. Report detected/processed/review counts without claiming the whole PDF is complete before this reconciliation.

## Important topic boundaries

| Required reasoning | Primary topic | Distinction |
|---|---|---|
| Mass ↔ moles ↔ particles | 1.1 | A routine conversion inside another task does not require a separate tag. |
| Elemental proportions / empirical formula | 1.3 | Reaction-yield calculation is 4.5; mixture purity is 1.4. |
| Atomic configuration | 1.5 | PES peak inference is 1.6; periodic trend explanation is 1.7. |
| Ionic charge and reactivity from valence | 1.8 | Relative ionic radius is 1.7. |
| Lattice strength from charge and radius | 2.2 | Ionic-array representation is 2.3; solid macroscopic properties from structure are 3.2. |
| Bond type / bond polarity | 2.1 | Whole-molecule polarity from geometry is 2.7. |
| Lewis diagram | 2.5 | Formal-charge comparison or resonance equivalence is 2.6; geometry is 2.7. |
| Boiling/vapor-pressure differences from attractions | 3.1 | Heating-curve energy calculations are 6.5. |
| Solubility from solute/solvent interactions | 3.10 | Ksp or molar solubility is 7.11; common-ion suppression 7.12; qualitative pH dependence 8.11; entropy/enthalpy of dissolution 9.6. |
| Concentration/dilution | 3.7 | The mere word solution does not justify this tag. |
| Ordinary gas P–V–n–T relationship | 3.4 | Speed/kinetic-energy distributions are 3.5; deviations from ideality are 3.6. |
| Evidence of change | 4.1 | Explaining which interactions change is 4.4. |
| Net ionic or balanced molecular equation | 4.2 | Identifying reaction type is 4.7; redox balancing with half-reactions is 4.9. |
| Oxidation numbers / oxidized or reduced species | 4.7 | Do not map every oxidation word to electrochemical cells. |
| Titration equivalence / unknown amount | 4.6 | Acid-base curve shape, pH, species, or indicator reasoning is 8.5. |
| Initial-rate table | 5.2 | Concentration-versus-time / half-life is 5.3. |
| Slow-first-step mechanism rate law | 5.8 | Fast equilibrium before slow step is 5.9; single elementary-step molecularity is 5.4. |
| Simple reactant/product energy diagram | 6.2 | Activation barrier is 5.6; multiple kinetic barriers are 5.10. |
| Reaction heat proportional to reacting amount | 6.6 | q=mcΔT calorimetry 6.4; bond-energy calculation 6.7; formation enthalpies 6.8; combining reaction enthalpies 6.9. |
| Write K or Q | 7.3 | Find K from equilibrium composition is 7.4; solve composition from K is 7.7. |
| Reverse, multiply, or add equilibrium equations | 7.6 | **7.6 is Properties of the Equilibrium Constant**, not equilibrium shifts. |
| Predict equilibrium shift | 7.9 | Explicit Q-versus-K reasoning is 7.10. |
| Proton donor/acceptor or conjugate pair | 4.8 | Water autoionization and Kw are 8.1. |
| Weak-acid/base equilibrium pH | 8.3 | Do not use 8.2 for every occurrence of pH; 8.2 is strong-acid/base pH. |
| Species after acid/base mixing | 8.4 | Buffer resistance mechanism 8.8, buffer pH from ratio 8.9, buffer capacity 8.10. |
| Acid strength from structure | 8.6 | pH vs pKa predominant form is 8.7. |
| Entropy sign / relative entropy | 9.1 | Numerical ΔS from tabulated S° is 9.2. |
| ΔG = ΔH − TΔS and favorability | 9.3 | **9.5 is Free Energy and Equilibrium**, involving ΔG° and K; it is not “Free Energy of Formation.” |
| Electrochemical physical operation | 9.8 | Standard E° and ΔG° relation 9.9; nonstandard concentration effects 9.10; current/time/deposited mass 9.11. |

## Legacy content and explicit exclusions

These questions remain useful historical source material. Give them a descriptive legacy concept and an optional related current topic, but do not present the excluded demand as current AP-required content. A question can have both current and legacy parts.

| Excluded demand | Related current topic | CED physical PDF page |
|---|---|---|
| Multi-element mass spectra or peaks other than singly charged monatomic ions | 1.2 | 38 |
| Assigning quantum numbers | 1.5 | 41 |
| Writing configurations that are Aufbau exceptions | 1.7 | 44 |
| Specific crystal structures / unit-cell recall | 2.3 | 54 |
| Deriving or depicting hybrid orbitals; d-orbital hybridization | 2.7 | 59 |
| Molecular-orbital diagrams, filling, bonding/nonbonding/antibonding distinctions | 2.7 | 59 |
| Interpreting phase diagrams | 3.3 | 69 |
| Colligative properties; molality; solution percent-by-mass/volume calculations | 3.8 | 74 |
| Definitions of “oxidizing agent” and “reducing agent” | 4.7 | 91 |
| Memorized solubility rules beyond Na+, K+, NH4+, nitrate salts | 4.7 | 92 |
| Lewis acid-base theory | 4.8 | 93 |
| Arrhenius-equation calculations | 5.6 | 107 |
| Collecting experimental data to detect a reaction intermediate | 5.7/5.8 | 108–109 |
| Technical internal-energy versus enthalpy distinctions | 6.6 | 125 |
| State-function terminology | 6.9 | 128 |
| Converting Kc ↔ Kp | 7.3 | 137 |
| Gas–dissolved-species equilibrium calculations | 7.3 | 138 |
| Computing all species concentrations along a polyprotic titration | 8.5 | 160 |
| Computing buffer pH change after adding acid/base; deriving Henderson–Hasselbalch | 8.9 | 164 |
| Quantitative solubility as a function of pH | 8.11 | 166 |
| Labeling electrodes positive or negative | 9.8 | 181 |

Nuclear decay, radioactivity, descriptive organic functional-group identification, and coordination-complex chemistry may appear in old exams but have no dedicated current CED learning objective. Label the tested legacy demand specifically. Do not exclude an otherwise current question merely because it uses an organic molecule or isotope as context. Chemical first-order half-life reasoning is 5.3; a nuclear-transmutation task is legacy. Molecular geometry for five/six electron domains is still assessable even though d-orbital hybridization labels are excluded. Sigma/pi bonds and sp/sp²/sp³ remain current.

For electrochemistry, the current CED emphasizes qualitative nonstandard-potential reasoning rather than algorithmic Nernst substitution (PDF pp. 183–184); do not automatically mark all Nernst-related prompts as excluded. For current electrochemical explanations, the CED specifically cautions that Le Châtelier equilibrium arguments do not apply to cells operating away from equilibrium.

## Research limitations

The taxonomy is authoritative; the short descriptions and boundary rules are our classification guide, not official College Board question assignments. A matching current topic is a reasoned crosswalk for historical questions unless an official mapping supplies that assignment. Review source questions visually where text extraction omits a required diagram or equation. Do not claim a percentage accuracy without a separately reviewed sample and documented sample selection.
