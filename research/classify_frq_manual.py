import json
from pathlib import Path
root=Path(__file__).parent
path=root/'frq-classified.json'
out=json.loads(path.read_text()) if path.exists() else []
source={q['id']:q for q in json.load(open(root.parent/'public/questions.json'))['questions']}
def add(id,primary,spec,reason,legacy=[]):
 parts=[]
 for line in spec.split('|'):
  label,tids,rationale=line.split(':',2)
  parts.append({'label':label,'topics':tids.split(',') if tids else [],'rationale':rationale})
 topics=list(dict.fromkeys(([primary] if primary else [])+[t for x in parts for t in x['topics']]))
 out[:]=[x for x in out if x['id']!=id]
 out.append({'id':id,'primaryTopic':primary,'relatedTopics':topics,'parts':parts,'rationale':reason,'status':'classified' if primary else 'legacy','legacyConcepts':legacy,'evidencePages':source.get(id,{}).get('sourcePagesOriginal',[])})
def save():path.write_text(json.dumps(out,ensure_ascii=False,indent=2))
