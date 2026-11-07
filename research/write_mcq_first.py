import json
from pathlib import Path
ROOT=Path(__file__).parent
qs=json.load(open(ROOT/'mcq-first-input.json'))
p=ROOT/'mcq-first-classified.json'
existing=json.load(open(p)) if p.exists() else []
byid={x['id']:x for x in existing}
def add(i,t,r,legacy=None):
 q=qs[i];ts=t.split(',') if t else []
 d=dict(id=q['id'],primaryTopic=ts[0] if ts else None,relatedTopics=ts,rationale=r,status='classified' if ts else 'legacy',evidencePages=q['sourcePagesOriginal'])
 if legacy:d['legacyConcepts']=[legacy];d['reviewReason']='Legacy content outside the current AP Chemistry framework: '+legacy+'.'
 byid[q['id']]=d

def batch(start,lines):
 for i,line in enumerate(lines.strip().split('\n'),start):
  t,r=line.split('|',1);add(i,'' if t.startswith('L:') else t,r,t[2:] if t.startswith('L:') else None)
def save():p.write_text(json.dumps(list(byid.values()),ensure_ascii=False,indent=2));print(len(byid))
if __name__=='__main__':
 batch(0,'''1.7|Compare ease of removing electrons across periodic families.
L:Nuclear chemistry|Identify the element family whose members are radioactive.
1.8|Use valence-shell patterns to identify elements likely to gain electrons and form anions.
8.5|Locate the equivalence point on a weak-acid/strong-base titration curve.
8.5|Identify the excess-titrant region where pH approaches the added strong base.
8.5,8.7|Locate half-equivalence where weak acid and conjugate base concentrations are equal.
2.7|Infer molecular geometry from bonding and lone pairs.
8.1|Recognize complete ionization of a strong acid among molecular gases dissolved in water.
3.5|Compare molecular speeds and relative effusion rates using molecular masses at equal temperature.
9.2|Apply the zero-entropy reference for a perfect crystal at absolute zero.
5.5|Connect temperature-dependent reaction rates to activation energy.
9.3|Determine enthalpy and entropy signs that make Gibbs free energy negative at all temperatures.
6.5,9.1|Identify energy absorption and increased dispersal during liquid-to-gas phase change.
6.1,9.1|Identify heat release and the entropy trend for combustion producing gaseous products.
4.7|Recognize precipitation as formation of an insoluble solid from aqueous ions.
L:Coordination chemistry and Lewis acid-base complexes|Identify a Lewis acid-base reaction forming a coordination complex.
4.9|Identify electron transfer in a synthesis reaction from oxidation-state changes.
1.5|Count electrons in ions to identify isoelectronic species.
3.1|Identify dispersion forces between nonpolar methane molecules.
1.5|Distinguish an excited electron configuration from a ground-state configuration.
2.7,2.1|Combine polar bonds with molecular symmetry to determine overall polarity.
1.8|Recognize common charges of metal ions.
1.5|Determine protons, neutrons, and electrons from atomic number and isotope mass number.
3.4|Set up pressure using PV=nRT and temperature in kelvin.
L:Nuclear reaction balancing|Balance nuclear reactions by mass and atomic numbers.
2.5|Use molecular structures and valence to distinguish single from multiple covalent bonds.
L:Molality|Calculate solute moles per kilogram of solvent.
1.3|Convert mass percentages into the simplest atom ratio of a compound.
5.3|Determine first-order half-life from repeated fractional decreases in reactant pressure.
4.5|Identify the limiting reactant and calculate excess reactant remaining.
1.1|Convert sample mass to molecules and then number of carbon atoms.
3.2|Recognize silicon dioxide as a covalent-network solid.
3.7|Use conservation of solute during dilution to calculate stock solution volume.
4.7|Use observed precipitation comparisons to identify the insoluble ionic product.
3.1|Compare dispersion force strength to explain melting-point differences.
3.4|Calculate mole fractions and partial pressures in an ideal-gas mixture.
3.3|Relate boiling to equality of vapor pressure and external pressure.
3.7|Express solution composition as solute mole fraction.
6.3|Explain dilution safety through heat transfer into the larger water sample.
4.8|Identify a conjugate acid by addition of a proton.
3.10|Identify relative solubility of ionic salts in water.
3.6|Identify conditions minimizing intermolecular attraction and finite-particle-volume deviations.
3.7|Distinguish volume-dependent molarity from other composition measures.
3.7|Identify the volume measurement needed to determine solution molarity.
L:Colligative properties and Raoult’s law|Calculate solvent vapor-pressure lowering from solute mole fraction.
3.1|Compare polarizability and dispersion-force strength of gaseous species.
3.7|Calculate solution molarity and recognize it is unchanged in a smaller aliquot.
L:Coordination complex formation|Explain precipitate dissolution through formation of an ammine complex.
3.7|Choose volumetric glassware for an accurate solution aliquot.
1.7|Explain ionic radius differences in an isoelectronic series using nuclear charge.''')
 save()
