"""Recover source-provided curriculum evidence. No answer keys are exported.
Historical LO numbers are NOT modern topic IDs. All page references are to the original bank.
"""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent
pages=(ROOT/'mega-text.txt').read_text().split('\f')
records=[]
def clean(t):return re.sub(r'\s+',' ',t).strip()
practice_ids='4.5 3.1 3.1 1.7 3.1 5.1 7.3 3.5 6.3 1.2 4.8 9.3 4.3 8.7 4.3 8.5 4.6 3.5 3.4 3.1 1.4 8.3 2.7 5.9 3.1 3.4 6.1 4.3 3.5 7.1 4.5 7.4 7.2 6.6 4.5 6.1 9.3 6.9 3.5 3.2 3.11 2.4 1.6 3.1 9.9 4.9 9.10 8.3 8.1 8.3 4.6 8.8 5.11 2.3 8.8 3.8 5.3 1.7 3.1 7.4'.split()
reasons='''Identify a hydrocarbon from combustion-product mole ratios.
Compare vapor pressure using intermolecular attraction.
Compare ion–water attraction using ionic radius at fixed charge.
Relate ease of electron loss to periodic trends.
Identify intermolecular hydrogen bonding between water molecules.
Predict the effect of solid surface area on reaction rate.
Compare initial reaction quotient Q to K to predict reaction direction.
Relate molecular speeds to temperature.
Apply energy conservation between a hot metal and water.
Identify an element from an isotopic mass spectrum.
Identify conjugate acid–base pairs using proton transfer.
Use enthalpy and entropy signs for temperature-dependent favorability.
Select a particle representation that conserves atoms in reaction.
Compare acid and conjugate-base abundance using pH relative to pKa.
Represent species remaining after an acid–base reaction.
Interpret species abundance at a point on a titration curve.
Determine concentration and endpoint-error direction from titration.
Compare average kinetic energy at equal temperatures.
Compare gas densities using pressure and molar mass.
Use dispersion forces to predict condensation behavior.
Identify an impurity from its effect on percent composition.
Estimate weak-base pH from Kb and concentration.
Use electron-domain geometry to explain molecular polarity.
Derive a rate law from fast pre-equilibrium followed by a slow step.
Explain boiling-point differences using polarizability.
Calculate final pressure after combining gases.
Identify energy absorbed or released when solution particles separate or combine.
Represent particles remaining after precipitation.
Explain pressure changes using gas-particle collision frequency.
Interpret the approach to equal forward and reverse reaction rates.
Use reaction stoichiometry to predict gas pressure at completion.
Calculate K from equilibrium gas-pressure changes.
Predict immediate reverse-rate changes after adding product.
Scale reaction heat and reverse its sign when reversing a process.
Identify limiting reactant from quantities and mole ratios.
Distinguish endothermic and exothermic ionic-solid formation steps.
Explain favorability from enthalpy and entropy signs.
Combine energy steps for bond cleavage and electron attachment.
Compare gas molecular speeds using molar masses.
Explain conductivity of doped solids through mobile electrons.
Choose spectroscopy for electronic transitions.
Explain alloy hardness from unequal atomic sizes.
Explain PES binding-energy differences through nuclear attraction.
Explain boiling-point differences through dispersion forces.
Calculate cell potential from related electrochemical reactions.
Track oxidation states to identify oxidation and reduction in cells.
Predict cell-voltage changes when ion concentrations change.
Infer weak-acid strength from pH at equal concentration.
Distinguish complete strong-acid ionization from weak-acid ionization.
Identify the predominant species in a weak-acid solution.
Compare equivalence volumes for equal acid amounts.
Explain how a conjugate acid–base mixture resists added acid.
Identify a catalyst and its effect on activation energy.
Compare ionic attraction using ion radius.
Select a conjugate pair with pKa near a target buffer pH.
Interpret concentration and dilution in particle representations.
Identify a linearized first-order concentration plot.
Explain atomic size and ionization-energy trends.
Distinguish covalent bonds within molecules from hydrogen bonds between molecules.
Calculate K from equilibrium gas pressures.'''.splitlines()
for pn in range(222,254):
 t=pages[pn-1];ms=list(re.finditer(r'(?m)^\s*Question (\d+)\s*$',t))
 for i,m in enumerate(ms):
  n=int(m[1]);s=t[m.end():ms[i+1].start() if i+1<len(ms) else len(t)]
  lo=re.search(r'Learning Objective\s+(\d+\.\d+)\s+',s)
  records.append(dict(exam='2013 Practice Exam and Notes (effective Fall 2013)',examPageRange=[159,282],questionPageRange=[172,199],type='MCQ',number=n,evidencePages=[pn],sourceAuthority='College Board official practice-exam rationale',sourceFramework='2013 learning objectives',sourceLearningObjectives=[lo[1]] if lo else [],topics=[practice_ids[n-1]],mappingStatus='reasoning-reviewed against official rationale',reason=reasons[n-1]))
ids2019='9.1 3.7 7.2 1.7 3.1 3.9 7.6 5.11 2.3 4.2 9.9 4.5 5.3 1.6 4.5 6.7 3.1 6.6 3.5 9.3 8.8 4.3 5.3 2.2 3.4 3.1 8.3 4.6 8.1 6.3 1.8 8.1 9.3 7.11 4.2 1.4 3.7 5.1 8.3 9.4 8.5 2.7 2.7 3.2 2.1 6.4 7.10 3.1 7.12 7.6'.split()
for pn in [1300,1301]:
 for line in pages[pn-1].splitlines():
  m=re.match(r'^\s*(\d+)\s+\d\.[A-Z]\s+([A-Z]+-\d+\.[A-Z])\s+(.+?)\s+[A-D]\s+\d+\s*$',line)
  if m:
   n=int(m[1]);records.append(dict(exam='2019 administration practice exam',examPageRange=[1180,1301],questionPageRange=[1190,1241],type='MCQ',number=n,evidencePages=[pn],sourceAuthority='College Board official Question Descriptors and Performance Data',sourceFramework='2019 framework (legacy LO identifiers)',sourceLearningObjectives=[m[2]],sourceTopicTitle=clean(m[3]),topics=[ids2019[n-1]],mappingStatus='official topic alignment',reason='Official descriptor identifies this topic; topic number is matched to the current CED.'))
frq2019={1:['4.7','3.4','4.5','6.4','6.6','3.1','3.7','7.9'],2:['4.3','6.2','5.6','1.1','4.2','5.3'],3:['2.5','2.7','9.3','7.1','7.3','7.4','7.9'],4:['4.8','8.5','8.8'],5:['4.7','9.8','9.9'],6:['6.1','6.5','3.2'],7:['8.1','3.13']}
for n,topics in frq2019.items():records.append(dict(exam='2019 administration practice exam',examPageRange=[1180,1301],questionPageRange=[1190,1241],type='FRQ',number=n,evidencePages=[1301],sourceAuthority='College Board official Question Descriptors and Performance Data',sourceFramework='2019 framework',topics=topics,mappingStatus='official whole-question topic union; subparts need separate reading',reason='The official descriptor lists these topics for the full FRQ; this does not assign every topic to every subpart.',notes='Question1 source text concatenates 3.7 and 7.9 as 3.77.9.' if n==1 else None))
# One-to-many aids only. Actual question must select fine-grained topics.
crosswalk={
'1.1':['1.1'],'1.2':['1.3','1.4'],'1.3':['1.3','1.4'],'1.4':['1.1','4.5'],'1.5':['1.5','1.6'],'1.6':['1.5'],'1.7':['1.6','1.5'],'1.8':['1.6','1.7'],'1.9':['1.7'],'1.10':['1.7'],'1.11':['1.7'],'1.14':['1.2'],'1.15':['3.11'],'1.16':['3.13'],'1.17':['4.3'],'1.18':['4.3','4.5'],'1.19':['4.5'],'1.20':['4.6','8.5'],
'2.1':['3.1','3.2','2.3'],'2.2':['3.3'],'2.4':['3.5','3.6'],'2.5':['3.4','3.5'],'2.6':['3.4'],'2.8':['3.8'],'2.9':['3.7','3.8'],'2.10':['3.9'],'2.11':['3.1'],'2.13':['3.1'],'2.14':['2.3','3.1','3.10'],'2.15':['3.10','9.6'],'2.16':['3.1'],'2.17':['2.2'],'2.21':['2.5','2.7'],'2.22':['3.2'],'2.24':['2.4'],'2.25':['2.4'],'2.27':['2.3'],'2.32':['3.2'],
'3.1':['4.3'],'3.2':['4.2'],'3.3':['4.5'],'3.4':['4.5'],'3.7':['4.8','8.1'],'3.8':['4.9'],'3.10':['6.1','9.3'],'3.12':['9.8','9.9','9.11'],'3.13':['9.8','9.9'],
'4.1':['5.1','5.2'],'4.2':['5.3'],'4.3':['5.3'],'4.4':['5.4','5.5'],'4.5':['5.5'],'4.7':['5.7','5.8','5.9'],'4.9':['5.11'],
'5.2':['3.5'],'5.5':['6.3'],'5.6':['6.4','6.5','6.6'],'5.7':['6.4'],'5.8':['6.7'],'5.10':['9.3'],'5.12':['9.1'],'5.13':['9.3'],'5.14':['9.5'],'5.18':['9.4'],
'6.1':['7.1'],'6.2':['7.6'],'6.3':['7.1','7.2'],'6.4':['7.3','7.10'],'6.5':['7.4'],'6.6':['7.7'],'6.7':['7.5'],'6.8':['7.9'],'6.9':['7.9'],'6.10':['7.10'],'6.12':['8.1','8.3'],'6.13':['8.5'],'6.15':['8.2'],'6.16':['8.3'],'6.17':['8.4'],'6.18':['8.8','8.9','8.10'],'6.19':['8.7'],'6.20':['8.8'],'6.21':['7.11'],'6.22':['7.11'],'6.23':['7.12','8.11'],'6.25':['9.7']}
for year,pns,erange in [(2016,[1118,1119],[1034,1119]),(2018,[1974,1975],[1882,1975])]:
 for pn in pns:
  for line in pages[pn-1].split('Free-Response Questions')[0].splitlines():
   m=re.match(r'^\s*(\d+)\s+((?:\d+\.\d+)(?:,\s*\d+\.\d+)*)\s{2,}',line)
   if m:
    n=int(m[1]);los=re.findall(r'\d+\.\d+',m[2]);cands=list(dict.fromkeys(x for lo in los for x in crosswalk.get(lo,[])))
    records.append(dict(exam=f'{year} administration practice exam',examPageRange=erange,type='MCQ',number=n,evidencePages=[pn],sourceAuthority='College Board official Question Descriptors and Performance Data',sourceFramework='2013 learning objectives',sourceLearningObjectives=los,candidateTopics=cands,mappingStatus='historical LO evidence; actual question must resolve candidates',reason='Old learning-objective numbers are not modern topic numbers; candidate topics narrow further review.'))
for year,pns in [(2008,[49,50]),(1984,[156,157,158]),(2002,[830,831,832])]:
 for pn in pns:
  category=''
  for line in pages[pn-1].splitlines():
   if 'Average number correct' in line or 'Percent of MC Exam Questions' in line:category=clean(line.split('(')[0].split(': Percent')[0])
   if re.match(r'^\s*Question\s*#',line):
    for n in map(int,re.findall(r'\d+',line)):
     records.append(dict(exam=f'{year} released exam diagnostic',type='MCQ',number=n,evidencePages=[pn],sourceAuthority='René McCormick third-party diagnostic' if year in [2008,1984] else 'Compiled diagnostic with College Board copyright; authorship not independently established',sourceCategory=category,mappingStatus='broad category only; question-level review required'))
old=json.loads((ROOT.parent/'public/questions.json').read_text())['questions']
for i,r in enumerate(records):
 r['evidenceId']=f'source-map-{i+1:04}'
 if 'examPageRange' not in r:continue
 a,b=r.get('questionPageRange',r['examPageRange']);r['matchingExistingIds']=[q['id'] for q in old if q['type']==r['type'] and q['number']==r['number'] and a<=q['sourcePagesOriginal'][0]<=b]
result=dict(version=1,source='AP Chemistry MEGA Compiled Test Bank.pdf',pageNumbering='Original compiled PDF, 1-based',warning='Historical LO numbers are never modern topic numbers. Candidate topics and broad diagnostic labels are not verified assignments. No answers exported.',records=records,historicalLOCandidateCrosswalk=crosswalk)
(ROOT/'source-mappings.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print('Evidence records',len(records),'direct source matches',sum(len(r.get('matchingExistingIds',[])) for r in records))
from collections import Counter
print(Counter(x['exam'] for x in records))
