"""Reproduce canonical AP Chemistry topic reference from locally retained official CED."""
import fitz,re,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
p=fitz.open(ROOT/'chem-ced.pdf')
unit_names=['Atomic Structure and Properties','Compound Structure and Properties','Properties of Substances and Mixtures','Chemical Reactions','Kinetics','Thermochemistry','Equilibrium','Acids and Bases','Thermodynamics and Electrochemistry']
desc='''1.1|Convert mass, moles, and numbers of particles for a substance.
1.2|Use isotope masses and abundances to interpret an elemental mass spectrum or find average atomic mass.
1.3|Determine composition and empirical or molecular formulas for a pure compound.
1.4|Determine component proportions or purity in a mixture from composition data.
1.5|Describe atomic particles and write ground-state electron configurations of atoms and ions.
1.6|Read photoelectron peak energies and intensities to infer electron arrangement and attraction.
1.7|Explain atomic or ionic size, ionization energy, electron affinity, and electronegativity trends.
1.8|Use valence electrons and periodic position to predict ion charges, reactivity, and ionic formulas.
2.1|Distinguish ionic, covalent, and metallic bonding and relate bond polarity to electronegativity.
2.2|Relate internuclear distance and charge to interaction energy, bond length, bond strength, or lattice strength.
2.3|Represent the arrangement of cations and anions in an ionic solid.
2.4|Represent metallic bonding, delocalized electrons, and substitutional or interstitial alloys.
2.5|Construct or interpret Lewis diagrams using valence electrons and octet constraints.
2.6|Use resonance and formal charge to compare Lewis structures or explain equivalent bonds.
2.7|Use electron domains to infer geometry, angles, polarity, hybridization, or sigma/pi bonding.
3.1|Explain intermolecular attraction, boiling points, vapor pressure, or related properties from molecular interactions.
3.2|Explain macroscopic solid properties from ionic, metallic, molecular, or network structures.
3.3|Represent particle spacing, arrangement, and motion in solid, liquid, and gas phases.
3.4|Relate gas pressure, volume, temperature, and amount, including mixtures and partial pressures.
3.5|Use particle motion and speed distributions to explain gas properties or temperature effects.
3.6|Explain real-gas departures from ideal behavior using particle volume and attractions.
3.7|Calculate solution molarity, amount, volume, or dilution.
3.8|Interpret or draw particle diagrams of solutions, including concentration and solute-solvent orientation.
3.9|Explain separation methods using differences in intermolecular interactions.
3.10|Explain which solutes dissolve in which solvents using competing intermolecular interactions.
3.11|Connect spectral regions with rotational, vibrational, and electronic transitions.
3.12|Relate photon energy, frequency, wavelength, and electronic transitions.
3.13|Use absorbance, path length, and concentration relationships, including calibration curves.
4.1|Identify observations that are evidence of a physical or chemical change.
4.2|Write or balance molecular, ionic, or net ionic equations and omit spectators.
4.3|Translate between reaction equations and particulate representations.
4.4|Explain physical versus chemical changes by which interactions or bonds change.
4.5|Use reaction coefficients to calculate reactant/product quantities, limiting reagents, or yield.
4.6|Use titration equivalence and reaction stoichiometry to determine amounts or concentration.
4.7|Identify precipitation, acid-base, or redox reactions and oxidation-state changes.
4.8|Identify proton donors/acceptors and conjugate acid-base pairs.
4.9|Construct balanced redox equations using half-reactions and electron conservation.
5.1|Relate reaction rates to measured changes, stoichiometry, concentration, or experimental conditions.
5.2|Infer rate laws, reaction orders, and rate constants from initial-rate data.
5.3|Use time-dependent concentration plots, integrated laws, or chemical half-lives.
5.4|Derive the rate law of a single elementary step from its molecularity.
5.5|Explain reaction rates through collision frequency, orientation, and sufficient collision energy.
5.6|Interpret activation energy and overall energy change on a single-step reaction profile.
5.7|Identify intermediates, catalysts, and net reactions in a multistep mechanism.
5.8|Derive or test rate laws for mechanisms with the first step rate-limiting.
5.9|Derive rate laws when a fast reversible step precedes the slow step.
5.10|Interpret intermediates and activation barriers on multistep reaction profiles.
5.11|Explain how catalysts provide a different mechanism and alter reaction rates.
6.1|Infer endothermic/exothermic behavior and energy direction from observations.
6.2|Represent relative reactant/product energies for physical or chemical processes.
6.3|Explain heat transfer through collisions until thermal equilibrium is reached.
6.4|Calculate heating/cooling energy from heat capacity, mass, and temperature change; analyze calorimetry.
6.5|Calculate phase-transition energy using amount and fusion/vaporization enthalpy; interpret heating curves.
6.6|Relate reaction heat to molar reaction enthalpy and reacting amount.
6.7|Calculate reaction enthalpy using energies of bonds broken and formed.
6.8|Calculate reaction enthalpy using standard formation enthalpies.
6.9|Combine or reverse reaction steps and add their enthalpy changes using Hess's law.
7.1|Describe dynamic equilibrium and connect reversibility to observations.
7.2|Predict net reaction direction from forward and reverse rates.
7.3|Write and interpret K or Q expressions; omit pure solids and liquids.
7.4|Calculate equilibrium constants from measured equilibrium concentrations or pressures.
7.5|Use the size of K to infer whether reactants or products predominate.
7.6|Transform K when reversing, scaling, or adding chemical equations.
7.7|Calculate equilibrium concentrations or pressures from initial conditions and K.
7.8|Interpret or construct particulate representations of equilibrium composition.
7.9|Predict equilibrium shifts due to concentration, temperature, or volume changes.
7.10|Use comparison of Q with K to predict or explain reaction direction after disturbance.
7.11|Relate molar solubility and Ksp; analyze precipitation using ionic concentration products.
7.12|Explain or calculate how a common ion changes salt solubility.
8.1|Relate water autoionization, Kw, pH, pOH, and neutral conditions.
8.2|Calculate pH or pOH for strong-acid or strong-base solutions.
8.3|Use Ka or Kb to find weak-acid/base equilibrium composition, pH, or percent ionization.
8.4|Determine major species and concentrations after mixing strong/weak acids and bases, including buffer formation.
8.5|Interpret acid-base titration curves, equivalence points, half-equivalence, indicators, and species present.
8.6|Explain acid/base strength using molecular structure, bonds, polarity, or resonance.
8.7|Use pH relative to pKa to identify the predominant protonation state.
8.8|Explain how a conjugate acid-base pair resists pH change through reactions with added acid/base.
8.9|Determine buffer pH from pKa and conjugate-pair concentrations.
8.10|Compare buffer capacities using amounts and ratios of acid/base components.
8.11|Predict qualitatively how pH changes the solubility of a salt with acid/base-active ions.
9.1|Predict entropy trends or signs of entropy changes from particle dispersal.
9.2|Calculate reaction entropy using standard molar entropies.
9.3|Use Gibbs free energy, enthalpy, entropy, and temperature to determine thermodynamic favorability.
9.4|Distinguish thermodynamic favorability from the kinetic rate of a process.
9.5|Relate standard Gibbs free energy to equilibrium constant and equilibrium composition.
9.6|Explain salt dissolution favorability using competing enthalpy and entropy contributions.
9.7|Explain how coupling or external energy drives a thermodynamically unfavorable process.
9.8|Analyze electrochemical cell components, half-cell reactions, electron/ion flow, and operation.
9.9|Relate standard cell potential, Gibbs free energy, and electrochemical favorability.
9.10|Explain qualitative concentration and nonstandard-condition effects on cell potential.
9.11|Calculate charge, current, time, or deposited amount in electrolysis using electron stoichiometry.'''
desc=dict(line.split('|',1) for line in desc.splitlines())
units=[{'id':f'u{i+1}','name':name,'topics':[]} for i,name in enumerate(unit_names)]
topics=[]
for i,pg in enumerate(p):
 if not 36<=i<=184: continue
 s=pg.get_text().replace('\x03',' ')
 s=s.replace('Require\nd Course Con\ntent','Required Course Content').replace('Requir\nequired Cour\ned Course Cont\nse Content \nent','Required Course Content')
 m=re.search(r'TOPIC\s+(\d\.\d+)\s*\n(.*?)\nRequired Course Content',s,re.S)
 if not m: continue
 tid,name=m.groups();name=re.sub(r'Course Framework.*|AP Chemistry.*|Return to Table.*|©.*','',name)
 name=name.replace('continued on next page','').replace('§','')
 name=' '.join(name.split()).replace('Buf fers','Buffers').replace('Henderson- Hasselbalch','Henderson-Hasselbalch')
 continuation=[]
 for j in range(i+1,min(i+4,len(p))):
  ns=p[j].get_text()
  if re.search(r'TOPIC\s+\d\.\d+',ns) or not re.search(r'\b'+re.escape(tid)+r'\.[A-Z]',ns):break
  continuation.append(j+1)
 alltext=s+'\n'+'\n'.join(p[n-1].get_text() for n in continuation)
 los=sorted(set(x.strip() for x in re.findall(r'(?m)^'+re.escape(tid)+r'\.[A-Z]\s*$',alltext)))
 t={'id':tid,'name':name,'unit':f'u{tid[0]}','description':desc[tid],'learningObjectives':los,'pdfPages':[i+1]+continuation,'printedPages':[i-6]+[n-7 for n in continuation],'sourceUrl':'https://apcentral.collegeboard.org/media/pdf/ap-chemistry-course-and-exam-description.pdf#page='+str(i+1)}
 topics.append(t);units[int(tid[0])-1]['topics'].append([tid,name])
assert len(topics)==91,len(topics)
result={'version':'College Board AP Chemistry CED effective Fall 2024; June 2026 clarifications checked','reviewedAt':'2026-11-07','sources':['https://apcentral.collegeboard.org/media/pdf/ap-chemistry-course-and-exam-description.pdf','https://apcentral.collegeboard.org/media/pdf/ap-chemistry-course-and-exam-description-clarifications.pdf','https://apcentral.collegeboard.org/courses/how-ap-develops-courses-and-exams/course-changes-overview'],'units':units,'topics':topics}
(ROOT/'apchem-taxonomy.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
(ROOT/'apchem-topic-reference.md').write_text('\n'.join(f"{t['id']} {t['name']}: {t['description']} [CED PDF pp. {','.join(map(str,t['pdfPages']))}; LO {', '.join(t['learningObjectives'])}]" for t in topics))
print(len(topics),'topics saved.')
