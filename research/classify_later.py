import json,re
from pathlib import Path
root=Path(__file__).parent
corpus=json.loads((root/'apchem-corpus-staged.json').read_text())
path=root/'mcq-later-classified.json'
results={r['id']:r for r in json.loads(path.read_text())} if path.exists() else {}
def batch(lo,hi,rows):
 for line in rows.strip().splitlines():
  num,topics,why=line.split('|',2); topics=topics.split(',') if topics!='?' else []
  matches=[q for q in corpus if q['type']=='MCQ' and lo<=q['sourcePagesOriginal'][0]<=hi and q['number']==int(num)]
  if not matches: print('MISSING',lo,num)
  for q in matches:
   results[q['id']]={'id':q['id'],'primaryTopic':topics[0] if topics else None,'relatedTopics':topics,'rationale':why,'status':'classified' if topics else 'review','evidencePages':q['sourcePagesOriginal']}
  path.write_text(json.dumps(list(results.values()),ensure_ascii=False,indent=2))
batch(1053,1074,'''1|3.1|Identify dipole–dipole attractions from molecular polarity.
2|5.5|Explain the temperature dependence of reaction rate through collision energies.
3|3.2,2.1|Infer an ionic solid from hardness and conductivity in solid versus aqueous states.
4|7.9|Predict which change shifts an ammonia equilibrium toward products.
5|2.2|Rank diatomic bond strengths using bond multiplicity.
6|3.1|Compare ion–dipole attractions using ionic charge and radius.
7|2.1|Rank bond polarity from electronegativity differences.
8|1.7,1.5|Explain a large successive-ionization-energy jump using core versus valence electrons.
9|8.5|Interpret a titration curve and its equivalence-point pH.
10|5.1,5.5|Explain how exposed solid surface area changes initial reaction rate.
11|1.3|Determine empirical formula from elemental masses.
12|7.11|Relate solubility-product constants and dissolution stoichiometry to chloride concentration.
13|3.5|Compare molecular-speed distributions at equal temperature for different molar masses.
14|9.8|Calculate an unknown half-cell reduction potential from the overall cell potential.
15|9.9,9.5|Connect cell-potential sign with standard free energy and equilibrium constant.
16|5.11|Recognize how a heterogeneous catalyst increases reaction rate.
17|3.10|Predict molecular solubility in water from structure and intermolecular interactions.
18|3.2|Explain electrical conductivity and other properties of a molecular solid.
19|3.1|Relate dispersion-force strength to vapor pressure and boiling point.
20|8.4|Infer relative acid strength from the direction favored in a proton-transfer equilibrium.
21|1.4|Evaluate a gravimetric-analysis error caused by contamination of a collected precipitate.
22|8.5|Determine the species remaining at a labeled position on an acid–base titration curve.
23|8.5|Predict how titrant concentration changes the titration curve.
24|6.6,4.5|Compare reaction heat using the reacting amounts and limiting reactant.
25|6.4,6.6|Use calorimetry and reacted moles to calculate molar reaction enthalpy.
26|5.8|Choose an elementary rate-determining step consistent with an observed rate law.
27|2.7|Use electron-domain geometry to compare bond angles.
28|3.9,3.1|Explain distillation separation through molecular structure and dispersion forces.
29|5.3,3.13|Infer reaction progress over time from absorbance proportional to concentration.
30|5.2|Predict how dilution changes rate for a first-order reactant.
31|3.13|Choose a spectrophotometric wavelength that selectively measures the absorbing reactant.
32|7.5|Use the magnitude of an equilibrium constant to compare equilibrium abundances.
33|7.11|Compare ion products with solubility-product constants to predict precipitation.
34|8.3|Estimate weak-acid pH from its analytical concentration and acid dissociation constant.
35|1.6|Interpret photoelectron binding energies for isoelectronic species using nuclear charge.
36|3.6|Explain nonideal gas pressure through finite particle volume at high pressure.
37|4.5,6.6|Identify a limiting reactant and scale reaction heat by reacting moles.
38|4.9|Identify reduction by changes in oxidation state and electron gain.
39|9.3|Determine thermodynamic favorability from enthalpy and entropy contributions.
40|6.7,6.2|Use bond energies to select an energy diagram with the correct reaction enthalpy.
41|1.7,1.8|Use successive ionization energies to infer cation charge and oxide stoichiometry.
42|7.2|Compare initial reaction quotient with equilibrium constant to infer the direction and relative concentrations.
43|6.5,9.1|Connect a heating-curve phase change with enthalpy and entropy signs.
44|6.1|Relate endothermic reaction energy absorption to temperature change in an insulated vessel.
45|3.4,4.5|Relate stoichiometric change in gas moles to pressure at constant temperature and volume.
46|9.3|Infer entropy sign from favorable free energy despite positive reaction enthalpy.
47|6.7|Compare total bond enthalpies in reactants and products for an endothermic reaction.
48|8.3|Compare acid dissociation using measured pH and starting acid concentrations.
49|1.8|Predict related oxide formulas from recurring valence-electron patterns within an element group.
50|4.5,3.4|Determine limiting reactant, excess material and gas yield from reaction stoichiometry.''')
print('classified',len(results))
