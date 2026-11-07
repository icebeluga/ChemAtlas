"""Join verified/reasoned topic assignments to preserved source question records."""
from pathlib import Path
import fitz,json,collections
root=Path(__file__).resolve().parents[1]; research=root/'research'
corpus=json.loads((research/'apchem-corpus-staged.json').read_text())
if (research/'scanned-classified.json').exists(): corpus += json.loads((research/'scanned-classified.json').read_text())
format_corrections=json.loads((research/'frq-format-corrections.json').read_text())
for q in corpus:
 if q['id'] in set(format_corrections['reclassifyAsFRQ']): q['type']='FRQ'
tax=json.loads((research/'apchem-taxonomy.json').read_text())
byid={q['id']:q for q in corpus}
assign={}
for fn in ['frq-classified.json','frq-batch02-classified.json','frq-batch03-classified.json','frq-batch04-classified.json','frq-batch05-classified.json','frq-batch06-classified.json','frq-batch07-classified.json','frq-batch08-classified.json','frq-batch09-classified.json','frq-batch10-classified.json','frq-batch11-classified.json','frq-batch12-classified.json','frq-batch13-classified.json','frq-batch14-classified.json','frq-format-classified.json','mcq-first-classified.json','mcq-batch01-classified.json','mcq-batch02-classified.json','mcq-batch03-classified.json','mcq-later-classified.json','scanned-classified.json']:
 p=research/fn
 if p.exists():
  for x in json.loads(p.read_text()):
   if x.get('id') in byid: assign[x['id']]=x
source=json.loads((research/'source-mappings.json').read_text()) if (research/'source-mappings.json').exists() else {'records':[]}
for m in source['records']:
 if m.get('mappingStatus') not in ('official topic alignment','reasoning-reviewed against official rationale'):continue
 for qid in m.get('matchingExistingIds',[]):
  if qid not in byid or qid in assign:continue
  ts=m.get('topics',[])
  if not ts:continue
  assign[qid]={'id':qid,'primaryTopic':ts[0],'relatedTopics':ts,'rationale':m.get('reason','Mapped from an official practice-exam rationale.'),'status':'classified','evidencePages':m.get('evidencePages',[]),'classificationMethod':'Official question descriptor / rationale crosswalk'}
# Source extent and complete-page assets. Questions continue to show the user's original PDF pages.
source_pdf=Path('/workspace/scratch/35a31b3ffba2/upload/AP Chemistry MEGA Compiled Test Bank.pdf')
doc=fitz.open(source_pdf); n_pages=len(doc)
assets=json.loads((research/'source-manifest.json').read_text())
page_records=collections.defaultdict(list)
questions=[]
for orig in corpus:
 q=dict(orig); a=assign.get(q['id'])
 q['pages']=q.get('sourcePagesOriginal') or q.get('pages',[])
 if a:
  primary=a.get('primaryTopic');related=list(dict.fromkeys(a.get('relatedTopics') or ([primary] if primary else [])))
  q['primaryTopic']=primary;q['topicName']=next((t['name'] for t in tax['topics'] if t['id']==primary),None)
  q['relatedTopics']=related;q['secondaryTopics']=[t for t in related if t!=primary]
  q['secondaryTopicNames']=[next((t['name'] for t in tax['topics'] if t['id']==tid),tid) for tid in q['secondaryTopics']]
  q['classificationRationale']=a.get('rationale');q['classificationMethod']=a.get('classificationMethod','Content reviewed against current CED')
  q['evidencePages']=a.get('evidencePages') or q['sourcePagesOriginal']
  q['legacyConcepts']=a.get('legacyConcepts') or []
  q['status']=a.get('status','review');q['reviewReason']=a.get('reviewReason')
  q['topicParts']=a.get('parts') or q.get('topicParts',[])
  if q['topicParts']:
   for part in q['topicParts']:
    part.setdefault('topicNames',[next((t['name'] for t in tax['topics'] if t['id']==tid),tid) for tid in part.get('topics',[])])
    part.setdefault('textPreview','')
  q['multiConcept']=len(set(related))>1 and q['type']=='FRQ'
 else:
  q['status']='review';q['primaryTopic']=None;q['topicName']=None;q['relatedTopics']=[];q['secondaryTopics']=[];q['secondaryTopicNames']=[]
  q['classificationRationale']=None;q['classificationMethod']='Awaiting question-content review'
  warnings=q.get('extractionWarnings') or []
  q['reviewReason']='PDF extraction needs review: '+', '.join(warnings) if warnings else 'Question needs semantic review against the current College Board CED; the previous keyword match was not reliable.'
  q['topicParts']=[];q['multiConcept']=False;q['legacyConcepts']=[]
 for p in q['pages']:
  if 1<=p<=n_pages:page_records[p].append(q['id'])
 questions.append(q)
for i,q in enumerate(questions):
 q['sourceAssets']=[next((a['url'] for a in assets if a['from']<=p<=a['to']),None) for p in q['pages']]
 q['sourceRegions']=q.get('sourceRegions') or []
# CED explanations help students understand what each exact topic includes.
topic_details={t['id']:{'description':t['description'],'learningObjectives':t['learningObjectives'],'pdfPages':t['pdfPages'],'printedPages':t['printedPages']} for t in tax['topics']}
# Every original page can be browsed. Referenced pages are only an extraction census, not proof of final classification.
referenced=set(page_records)
unreferenced=sorted(set(range(1,n_pages+1))-referenced)
counts=collections.Counter(q['status'] for q in questions)
methods=collections.Counter(q.get('classificationMethod','') for q in questions if q['status']=='classified')
aud={'totalPages':n_pages,'questionRecords':len(questions),'pagesReferencedByQuestionRecords':len(referenced),'unreferencedPages':unreferenced,'unresolvedPages':len(unreferenced),'classified':counts['classified'],'legacy':counts['legacy'],'review':counts['review'],'assignmentsByEvidence':dict(methods),'coverageNote':'Unreferenced pages have not been verified as non-question pages. Some may contain missing questions, scans, shared stimuli, duplicates, answer keys, or reference material. Review each disposition before claiming full-bank completeness.'}
cat={'units':tax['units'],'questions':questions,'sourcePages':n_pages,'includedSourcePages':sorted(referenced),'sourceFiles':assets,'topicDetails':topic_details,'audit':aud,'stats':{'questions':len(questions),'frq':sum(q['type']=='FRQ' for q in questions),'mcq':sum(q['type']=='MCQ' for q in questions),'review':counts['review'],'legacy':counts['legacy'],'classified':counts['classified'],'multiConceptFrq':sum(q['type']=='FRQ' and q.get('multiConcept') for q in questions)}}
(root/'public'/'questions.json').write_text(json.dumps(cat,ensure_ascii=False,separators=(',',':')))
(research/'page-audit.json').write_text(json.dumps(aud,ensure_ascii=False,indent=2))
(root/'public'/'page-audit.json').write_text(json.dumps(aud,ensure_ascii=False,indent=2))
(root/'public'/'curriculum-topics.json').write_text(json.dumps(tax,ensure_ascii=False,indent=2))
(root/'public'/'classification-method.md').write_text((research/'apchem-classification-guide.md').read_text())
print(json.dumps({'questions':len(questions),'classified':counts['classified'],'legacy':counts['legacy'],'review':counts['review'],'pageCount':n_pages,'referencedPages':len(referenced),'unreferencedPages':len(unreferenced),'topicCount':len(tax['topics'])}))
