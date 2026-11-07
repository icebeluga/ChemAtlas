import json, re, sys
from pathlib import Path

text_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])
pages = text_path.read_text(errors="replace").split("\f")
if pages and not pages[-1].strip(): pages.pop()

UNITS = [
 {"id":"u1","name":"Atomic Structure and Properties","topics":[("1.1","Moles and Molar Mass"),("1.2","Mass Spectra"),("1.3","Elemental Composition of Pure Substances"),("1.4","Composition of Mixtures"),("1.5","Atomic Structure and Electron Configuration"),("1.6","Photoelectron Spectroscopy"),("1.7","Periodic Trends"),("1.8","Valence Electrons and Ionic Compounds")]},
 {"id":"u2","name":"Compound Structure and Properties","topics":[("2.1","Types of Chemical Bonds"),("2.2","Intramolecular Force and Potential Energy"),("2.3","Structure of Ionic Solids"),("2.4","Structure of Metals and Alloys"),("2.5","Lewis Diagrams"),("2.6","Resonance and Formal Charge"),("2.7","VSEPR and Bond Hybridization")]},
 {"id":"u3","name":"Properties of Substances and Mixtures","topics":[("3.1","Intermolecular and Interparticle Forces"),("3.2","Properties of Solids"),("3.3","Solids, Liquids, and Gases"),("3.4","Ideal Gas Law"),("3.5","Kinetic Molecular Theory"),("3.6","Deviation from Ideal Gas Law"),("3.7","Solutions and Mixtures"),("3.8","Representations of Solutions"),("3.9","Separation of Solutions and Mixtures"),("3.10","Solubility"),("3.11","Spectroscopy and the Electromagnetic Spectrum"),("3.12","Properties of Photons"),("3.13","Beer-Lambert Law")]},
 {"id":"u4","name":"Chemical Reactions","topics":[("4.1","Introduction to Reactions"),("4.2","Net Ionic Equations"),("4.3","Representations of Reactions"),("4.4","Physical and Chemical Changes"),("4.5","Stoichiometry"),("4.6","Introduction to Titration"),("4.7","Types of Chemical Reactions"),("4.8","Introduction to Acid-Base Reactions"),("4.9","Oxidation-Reduction Reactions")]},
 {"id":"u5","name":"Kinetics","topics":[("5.1","Reaction Rates"),("5.2","Introduction to Rate Law"),("5.3","Concentration Changes Over Time"),("5.4","Elementary Reactions"),("5.5","Collision Model"),("5.6","Reaction Energy Profile"),("5.7","Introduction to Reaction Mechanisms"),("5.8","Reaction Mechanism and Rate Law"),("5.9","Pre-Equilibrium Approximation"),("5.10","Multistep Reaction Energy Profile"),("5.11","Catalysis")]},
 {"id":"u6","name":"Thermochemistry","topics":[("6.1","Endothermic and Exothermic Processes"),("6.2","Energy Diagrams"),("6.3","Heat Transfer and Thermal Equilibrium"),("6.4","Heat Capacity and Calorimetry"),("6.5","Energy of Phase Changes"),("6.6","Introduction to Enthalpy of Reaction"),("6.7","Bond Enthalpies"),("6.8","Enthalpy of Formation"),("6.9","Hess’s Law")]},
 {"id":"u7","name":"Equilibrium","topics":[("7.1","Introduction to Equilibrium"),("7.2","Direction of Reversible Reactions"),("7.3","Reaction Quotient and Equilibrium Constant"),("7.4","Calculating the Equilibrium Constant"),("7.5","Magnitude of the Equilibrium Constant"),("7.6","Properties of Equilibrium"),("7.7","Calculating Equilibrium Concentrations"),("7.8","Representations of Equilibrium"),("7.9","Introduction to Le Châtelier’s Principle"),("7.10","Reaction Quotient and Le Châtelier’s Principle"),("7.11","Introduction to Solubility Equilibria"),("7.12","Common-Ion Effect")]},
 {"id":"u8","name":"Acids and Bases","topics":[("8.1","Introduction to Acids and Bases"),("8.2","pH and pOH of Strong Acids and Bases"),("8.3","Weak Acid and Base Equilibria"),("8.4","Acid-Base Reactions"),("8.5","Acid-Base Titrations"),("8.6","Molecular Structure of Acids and Bases"),("8.7","pH and pKa"),("8.8","Properties of Buffers"),("8.9","Henderson-Hasselbalch Equation"),("8.10","Buffer Capacity"),("8.11","pH and Solubility")]},
 {"id":"u9","name":"Applications of Thermodynamics","topics":[("9.1","Introduction to Entropy"),("9.2","Absolute Entropy and Entropy Change"),("9.3","Gibbs Free Energy and Thermodynamic Favorability"),("9.4","Thermodynamic and Kinetic Control"),("9.5","Free Energy of Formation"),("9.6","Free Energy of Dissolution"),("9.7","Coupled Reactions"),("9.8","Galvanic and Electrolytic Cells"),("9.9","Cell Potential and Free Energy"),("9.10","Cell Potential Under Nonstandard Conditions"),("9.11","Electrolysis and Faraday’s Law")]}
]

RULES = {
"1.1":[r"\bmolar mass\b",r"\bmole[s]?\b",r"\bavogadro\b",r"\bparticles?\b"],
"1.2":[r"mass spectrum",r"isotop(?:e|es|ic)",r"average atomic mass",r"relative abundance"],
"1.3":[r"empirical formula",r"molecular formula",r"combustion analysis",r"percent composition",r"elemental composition"],
"1.4":[r"mixture",r"mass percent",r"composition of the mixture"],
"1.5":[r"electron configuration",r"ground.state electron",r"orbital",r"quantum number",r"electron[s]? in the .*sublevel",r"atomic structure"],
"1.6":[r"photoelectron",r"binding energy",r"pes spectrum"],
"1.7":[r"ionization energ",r"atomic radius",r"ionic radius",r"periodic trend",r"effective nuclear charge",r"electronegativity"],
"1.8":[r"valence electron",r"ionic compound",r"ion[s]? of",r"isoelectronic"],
"2.1":[r"chemical bond",r"covalent bond",r"ionic bond",r"metallic bond",r"bond polarity",r"electronegativity difference"],
"2.2":[r"potential energy",r"bond energy",r"bond enthalp",r"bond length",r"bond order",r"sigma bond",r"pi bond"],
"2.3":[r"ionic solid",r"ionic crystal",r"lattice energy",r"lattice enthalpy",r"ionic lattice"],
"2.4":[r"alloy",r"metallic bonding",r"delocalized electron",r"metal lattice"],
"2.5":[r"lewis structure",r"lewis diagram",r"electron.dot diagram",r"draw.*structure",r"octet rule"],
"2.6":[r"resonance",r"formal charge",r"equivalent bonds",r"resonance hybrid"],
"2.7":[r"vsepr",r"molecular geometry",r"molecular shape",r"bond angle",r"hybridization"],
"3.1":[r"intermolecular force",r"interparticle force",r"hydrogen bond",r"dipole.dipole",r"london dispersion",r"boiling point",r"melting point"],
"3.2":[r"properties of solids",r"solid structure",r"crystal lattice",r"amorphous",r"metallic solid"],
"3.3":[r"phase change",r"liquid",r"gaseous state",r"gas and liquid",r"particle diagram"],
"3.4":[r"ideal gas law",r"pv\s*=\s*nrt",r"partial pressure",r"gas pressure",r"volume.*temperature"],
"3.5":[r"kinetic molecular",r"average kinetic energy",r"molecular speed"],
"3.6":[r"deviation from ideal",r"real gas",r"nonideal"],
"3.7":[r"solution",r"molarity",r"molality",r"concentration",r"dilution",r"colligative"],
"3.8":[r"particle.level diagram",r"particulate representation",r"solution diagram"],
"3.9":[r"chromatography",r"separation",r"filtration",r"distillation"],
"3.10":[r"solubility",r"soluble",r"insoluble",r"saturated solution",r"precipitat"],
"3.11":[r"electromagnetic spectrum",r"spectroscopy",r"wavelength",r"frequency",r"infrared",r"visible light"],
"3.12":[r"photon",r"photoelectric",r"planck",r"energy of the light"],
"3.13":[r"beer.lambert",r"absorbance",r"path length"],
"4.1":[r"chemical reaction",r"reactants and products",r"reaction occurs"],
"4.2":[r"net ionic",r"spectator ion",r"complete ionic"],
"4.3":[r"represent.*reaction",r"balanced equation",r"chemical equation"],
"4.4":[r"physical change",r"chemical change",r"phase transition"],
"4.5":[r"stoichiometr",r"limiting reactant",r"percent yield",r"theoretical yield",r"mole ratio"],
"4.6":[r"titration",r"equivalence point",r"endpoint"],
"4.7":[r"type[s]? of chemical reaction",r"precipitation reaction",r"combustion",r"synthesis reaction",r"decomposition"],
"4.8":[r"acid.base reaction",r"neutralization",r"conjugate acid",r"conjugate base"],
"4.9":[r"redox",r"oxidation number",r"oxidized",r"reduced",r"half.reaction"],
"5.1":[r"reaction rate",r"initial rate",r"rate of formation"],
"5.2":[r"rate law",r"reaction order",r"rate constant",r"specific rate constant"],
"5.3":[r"concentration.*time",r"half.life",r"first.order",r"second.order"],
"5.4":[r"elementary reaction",r"molecularity"],
"5.5":[r"collision model",r"effective collision",r"activation energy"],
"5.6":[r"energy profile",r"reaction coordinate",r"transition state"],
"5.7":[r"reaction mechanism",r"intermediate"],
"5.8":[r"mechanism.*rate law",r"rate law.*mechanism"],
"5.9":[r"pre.equilibrium",r"steady.state approximation"],
"5.10":[r"multistep.*energy",r"reaction energy diagram",r"activation energy.*step"],
"5.11":[r"catalyst",r"catalyzed",r"catalysis"],
"6.1":[r"endothermic",r"exothermic",r"enthalpy change"],
"6.2":[r"energy diagram",r"energy profile",r"heat diagram"],
"6.3":[r"heat transfer",r"thermal equilibrium"],
"6.4":[r"calorimetr",r"specific heat",r"heat capacity",r"q\s*=\s*mc"],
"6.5":[r"heat of fusion",r"heat of vaporization",r"phase change",r"melting",r"boiling"],
"6.6":[r"enthalpy of reaction",r"\b\u0394h\b",r"heat released",r"heat absorbed"],
"6.7":[r"bond enthalpy",r"bond energy"],
"6.8":[r"enthalpy of formation",r"\u0394h\u00b0f",r"standard enthalpy of formation"],
"6.9":[r"hess.s law",r"hess"],
"7.1":[r"chemical equilibrium",r"equilibrium mixture",r"dynamic equilibrium"],
"7.2":[r"direction.*reaction",r"forward reaction",r"reverse reaction"],
"7.3":[r"reaction quotient",r"equilibrium constant",r"\bk[cp]\b"],
"7.4":[r"calculate.*equilibrium constant",r"calculate.*k[cp]"],
"7.5":[r"magnitude of.*equilibrium constant",r"large.*equilibrium constant",r"small.*equilibrium constant"],
"7.6":[r"le ch[a\u00e2]telier",r"shift.*equilibrium",r"disturb.*equilibrium"],
"7.7":[r"equilibrium concentration",r"concentration.*at equilibrium",r"\bice table\b"],
"7.8":[r"equilibrium.*particle",r"particle.*equilibrium",r"representation.*equilibrium"],
"7.9":[r"le ch[a\u00e2]telier",r"stress.*equilibrium"],
"7.10":[r"reaction quotient.*le ch[a\u00e2]telier",r"compare q.*k"],
"7.11":[r"ksp",r"solubility product",r"solubility equilibrium"],
"7.12":[r"common.ion effect"],
"8.1":[r"acid and base",r"acid.base",r"strong acid",r"strong base"],
"8.2":[r"ph\b",r"poh\b"],
"8.3":[r"weak acid",r"weak base",r"ka\b",r"kb\b"],
"8.4":[r"acid.base reaction",r"neutralization",r"conjugate"],
"8.5":[r"acid.base titration",r"titration curve",r"equivalence point"],
"8.6":[r"molecular structure.*acid",r"structure.*acid",r"acid strength.*bond"],
"8.7":[r"pka\b",r"pH.*pKa"],
"8.8":[r"buffer solution",r"buffer capacity",r"buffer"],
"8.9":[r"henderson.hasselbalch"],
"8.10":[r"buffer capacity"],
"8.11":[r"pH.*solubility",r"solubility.*pH"],
"9.1":[r"entropy",r"\bs\u00b0\b"],
"9.2":[r"absolute entropy",r"entropy change",r"\u0394s\u00b0?"],
"9.3":[r"gibbs free energy",r"\u0394g",r"thermodynamically favorable",r"spontaneous"],
"9.4":[r"thermodynamic.*kinetic",r"kinetic control",r"thermodynamic control"],
"9.5":[r"free energy of formation",r"\u0394g\u00b0f"],
"9.6":[r"free energy of dissolution",r"dissolving.*\u0394g"],
"9.7":[r"coupled reaction",r"coupling.*reaction"],
"9.8":[r"galvanic cell",r"voltaic cell",r"electrolytic cell",r"electrochemical cell"],
"9.9":[r"cell potential",r"cell voltage",r"\be\u00b0cell\b",r"\u0394g.*cell"],
"9.10":[r"nonstandard",r"nernst equation",r"cell potential"],
"9.11":[r"electrolysis",r"faraday.s law",r"electric current.*electrolysis"]
}

topic_by_id={t[0]:u for u in UNITS for t in u["topics"]}
topic_name={tid:name for u in UNITS for tid,name in u["topics"]}

def classify(s):
    s=s.lower().replace("\u0000", " ")
    scores={}
    for tid,patterns in RULES.items():
        score=0
        for pat in patterns:
            try: score += len(re.findall(pat,s,re.I))
            except re.error: pass
        if score: scores[tid]=score
    if not scores: return None,[],0
    ranked=sorted(scores.items(),key=lambda x:(-x[1],x[0]))
    total=sum(scores.values())
    best=ranked[0][1]
    # Include closely represented concepts, while excluding incidental mentions.
    secondary=[tid for tid,sc in ranked[1:] if sc>=max(2,best*.55) or (sc>=2 and topic_by_id[tid]["id"]!=topic_by_id[ranked[0][0]]["id"] and sc>=best*.35)]
    confidence=min(1.0,best/5)
    return ranked[0][0],secondary,confidence

def clean(s): return re.sub(r"\s+"," ",s).strip()

frq_starts=[]
current_year=None
frq_segment=0
in_frq=False
for page_num,p in enumerate(pages,1):
    # Detect year from source-cover text and then carry it through the exam pages.
    m=re.search(r"(?:AP\s*®?\s*Chemistry\s*)?(19\d{2}|20\d{2})\s+Free.?Response Questions",p,re.I)
    if m: current_year=m.group(1)
    has_frq=bool(re.search(r"FREE.?RESPONSE\s+QUESTIONS|Free.?Response Questions",p,re.I))
    if has_frq and not in_frq: frq_segment+=1
    in_frq=has_frq
    if not has_frq:
        continue
    if re.search(r"Scoring Guidelines|Scoring Guideline|Rubric|Chief Reader|Examiner Report",p,re.I):
        continue
    page_lines=p.splitlines()
    local=[]
    for li,line in enumerate(page_lines):
        # First-page question labels and the newer Begin/Continue response pages.
        m=re.match(r"^\s{0,12}(\d{1,2})\.\s+([A-Z][a-zA-Z])",line)
        if m:
            lead=len(line)-len(line.lstrip())
            # Exclude right-side table cells and numbered options.
            if lead<=8:
                local.append((li,int(m.group(1)),line.strip()))
        else:
            m=re.search(r"Begin your response to QUESTION\s+(\d+)",line,re.I)
            if m:
                local.append((li,int(m.group(1)),line.strip()))
    # Remove duplicates on a page, and ensure a real question-like stem.
    seen=set()
    for li,num,line in local:
        if num in seen: continue
        seen.add(num)
        frq_starts.append({"page":page_num,"line":li,"num":num,"lineText":line,"year":current_year,"segment":frq_segment,"pageText":p})

# Keep only starts with plausible stems and derive continuation ranges within the same examination year.
frq_records=[]
for i,st in enumerate(frq_starts):
    next_st=next((x for x in frq_starts[i+1:] if x["segment"]==st["segment"] and (x["page"]>st["page"] or x["page"]==st["page"] and x["line"]>st["line"])),None)
    end=st["page"]
    if next_st and next_st["page"]>st["page"]:
        end=next_st["page"]-1 if next_st["line"]<=1 else next_st["page"]
    qpages=list(range(st["page"],end+1))
    chunks=[]
    for pn in qpages:
        p=pages[pn-1]
        if pn==st["page"] and pn==end:
            ls=p.splitlines(); start=st["line"]; stop=next_st["line"] if next_st and next_st["page"]==pn else len(ls); chunks.append("\n".join(ls[start:stop]))
        elif pn==st["page"]:
            ls=p.splitlines(); chunks.append("\n".join(ls[st["line"]:]))
        elif next_st and pn==next_st["page"]:
            chunks.append("\n".join(pages[pn-1].splitlines()[:next_st["line"]]))
        else: chunks.append(p)
    body="\n".join(chunks)
    if len(body.strip())<45: continue
    primary,secondary,confidence=classify(body)
    unit=topic_by_id.get(primary,{}) if primary else {}
    src=clean(st["pageText"].splitlines()[0])[:80]
    exam=f"{st['year'] or 'Year unknown'} AP Chemistry FRQ"
    if "International" in st["pageText"]: exam += " · International"
    status="classified" if primary and confidence>=0.4 else "review"
    frq_records.append({"id":f"frq-{st['year'] or 'unknown'}-{st['num']}-{st['page']}","type":"FRQ","year":st["year"],"exam":exam,"number":st["num"],"pages":qpages,"primaryUnit":unit.get("id"),"unitName":unit.get("name"),"primaryTopic":primary,"topicName":topic_name.get(primary),"secondaryTopics":secondary,"secondaryTopicNames":[topic_name.get(t) for t in secondary],"multiConcept":bool(secondary),"classificationConfidence":round(confidence,2),"status":status,"reviewReason":None if status=="classified" else "Could not confidently match the question text to a College Board curriculum topic.","textPreview":clean(body)[:260],"source":"AP Chemistry MEGA Compiled Test Bank.pdf"})

# MCQ questions: identify question stems on question pages. Every record points back to the original page image.
mcq_records=[]
year_by_page={}
year=None
for pn,p in enumerate(pages,1):
    m=re.search(r"\b(19\d{2}|20\d{2})\b[^\n]{0,60}(?:AP.?\s*CHEMISTRY|CHEMISTRY|Exam)",p,re.I)
    if m: year=m.group(1)
    year_by_page[pn]=year
    if re.search(r"FREE.?RESPONSE\s+QUESTIONS",p,re.I): continue
    if re.search(r"Answer Key|Answer Section|Diagnostic|Scoring Worksheet|Scoring Guidelines|Study Guide|Unit Guides|Course Description|Student Answer Sheet|Solutions Manual",p,re.I): continue
    if len(re.findall(r"\(\s*[A-E]\s*\)|\b[A-E]\)",p,re.I))<2: continue
    if not re.search(r"\b(?:\d{1,2})\.\s+[A-Z]",p): continue
    # MCQ pages commonly place two columns; split wide gaps to recover stems in both columns.
    candidates=[]; seen_nums=set()
    for li,line in enumerate(p.splitlines()):
        segments=re.split(r"\s{4,}",line)
        for seg in segments:
            m=re.match(r"^\s*(\d{1,2})\.\s+([A-Z][^\n]{8,})",seg)
            if not m: continue
            n=int(m.group(1))
            if n>90 or n in seen_nums: continue
            seen_nums.add(n); candidates.append({"line":li,"num":n,"stem":seg.strip()})
    if not candidates: continue
    candidates.sort(key=lambda x:(x["line"],x["num"]))
    lines=p.splitlines()
    for j,c in enumerate(candidates):
        # Restrict matching to this question's extracted block. Page-wide
        # matching caused unrelated neighboring questions to inherit topics.
        next_line=next((x["line"] for x in candidates if x["line"]>c["line"]),None)
        stop=next_line if next_line is not None else min(len(lines),c["line"]+22)
        excerpt="\n".join(lines[c["line"]:stop]).strip()
        primary,secondary,confidence=classify(excerpt)
        if len(excerpt)<35 or confidence<0.4:
            primary,secondary=None,[]
        # The complete question stays as the PDF-rendered source image; this text is only for indexing.
        unit=topic_by_id.get(primary,{}) if primary else {}
        year=year_by_page.get(pn)
        exam=f"{year or 'Year unknown'} AP Chemistry MCQ"
        if "Version" in p: exam += " · Version indicated in source"
        status="classified" if primary and confidence>=0.4 else "review"
        mcq_records.append({"id":f"mcq-{year or 'unknown'}-{c['num']}-{pn}","type":"MCQ","year":year,"exam":exam,"number":c["num"],"pages":[pn],"primaryUnit":unit.get("id"),"unitName":unit.get("name"),"primaryTopic":primary,"topicName":topic_name.get(primary),"secondaryTopics":secondary,"secondaryTopicNames":[topic_name.get(t) for t in secondary],"multiConcept":False,"classificationConfidence":round(confidence,2),"status":status,"reviewReason":None if status=="classified" else "Question stem or stimulus needs review before assigning a curriculum topic.","textPreview":clean(excerpt)[:260],"source":"AP Chemistry MEGA Compiled Test Bank.pdf"})

all_records=frq_records+mcq_records
all_records.sort(key=lambda q:(q["pages"][0],q["type"],q["number"]))
# Ship a lossless subset containing the pages that back catalog entries. This
# keeps answer-key-only pages out of the practice viewer and maps compact asset
# pages back to their original page numbers in the compiled source PDF.
included_pages=sorted({p for q in all_records for p in q["pages"]})
page_map={source_page:i+1 for i,source_page in enumerate(included_pages)}
for q in all_records:
    q["sourcePagesOriginal"]=q["pages"]
    q["pages"]=[page_map[p] for p in q["pages"]]
out_path.parent.mkdir(parents=True,exist_ok=True)
out_path.write_text(json.dumps({"units":UNITS,"questions":all_records,"sourcePages":len(pages),"includedSourcePages":included_pages,"stats":{"questions":len(all_records),"frq":len(frq_records),"mcq":len(mcq_records),"review":sum(q["status"]=="review" for q in all_records),"multiConceptFrq":sum(q["type"]=="FRQ" and q["multiConcept"] for q in all_records)}},ensure_ascii=False,separators=(",",":")))
print(json.dumps({"sourcePages":len(pages),"questions":len(all_records),"frq":len(frq_records),"mcq":len(mcq_records),"review":sum(q["status"]=="review" for q in all_records),"multiConceptFrq":sum(q["type"]=="FRQ" and q["multiConcept"] for q in all_records)}))
