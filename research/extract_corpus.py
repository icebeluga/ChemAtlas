import json,re,fitz,collections,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
PDF='/workspace/scratch/35a31b3ffba2/upload/AP Chemistry MEGA Compiled Test Bank.pdf'
OLD=ROOT.parent/'public/questions.json'
doc=fitz.open(PDF); old=json.load(open(OLD))['questions'];cache={}
def info(pn):
 if pn in cache:return cache[pn]
 p=doc[pn-1];lines=[]
 for b in p.get_text('dict')['blocks']:
  for l in b.get('lines',[]):
   t=''.join(s['text'] for s in l['spans']).strip()
   if t:lines.append({'text':t,'rect':list(l['bbox'])})
 anchors=[]
 for l in lines:
  m=re.match(r'^(\d{1,3})(?:R)?[.)](?:\s|$)',l['text'])
  if m and int(m[1])<=100 and l['rect'][0]<p.rect.width*.75 and l['rect'][1]>35 and l['rect'][1]<p.rect.height-55:anchors.append(dict(l,num=int(m[1])))
 cols=any(p.rect.width*.48<a['rect'][0]<p.rect.width*.75 for a in anchors) and any(a['rect'][0]<p.rect.width*.4 for a in anchors)
 out={'lines':lines,'anchors':anchors,'cols':cols,'w':p.rect.width,'h':p.rect.height,'text':p.get_text()};cache[pn]=out;return out

def regiontext(pn,r):return doc[pn-1].get_text(clip=fitz.Rect(r),sort=True).strip()

def extract(q):
 q=dict(q);pn=q['sourcePagesOriginal'][0];inf=info(pn);w,h=inf['w'],inf['h']; aa=[a for a in inf['anchors'] if a['num']==q['number']];warn=[];regions=[]
 if not aa:
  warn.append('Question number not located in extracted text; full source page retained for visual review.')
  for p in q['sourcePagesOriginal']:regions.append({'page':p,'rect':[20,40,info(p)['w']-20,info(p)['h']-50]})
 else:
  a=aa[0];x=a['rect'][0];y=a['rect'][1];cols=inf['cols'] and q['type']=='MCQ'; left=0 if not cols or x<w/2 else w/2;right=w if not cols or x>=w/2 else w/2
  following=[b for b in inf['anchors'] if b['rect'][1]>y+5 and left<=b['rect'][0]<right]
  stop=min([b['rect'][1]-3 for b in following]+[h-55]);start=y-3
  preceding=[b for b in inf['anchors'] if b['rect'][1]<y-5 and left<=b['rect'][0]<right]
  if not preceding:start=55
  shared=[]
  for l in inf['lines']:
   m=re.search(r'Questions?\s+(\d+)\s*[-–−]\s*(\d+)',l['text'],re.I)
   if m and int(m[1])<=q['number']<=int(m[2]) and left<=l['rect'][0]<right and l['rect'][1]<y:
    group=[b for b in inf['anchors'] if int(m[1])<=b['num']<=int(m[2]) and left<=b['rect'][0]<right and b['rect'][1]>l['rect'][1]]
    if group:shared.append({'page':pn,'rect':[left,l['rect'][1]-3,right,min(b['rect'][1] for b in group)-3]})
  if shared:regions+=shared[-1:];start=y-3
  regions.append({'page':pn,'rect':[left,start,right,stop]})
  if q['type']=='FRQ':
   for p in q['sourcePagesOriginal'][1:]:
    ii=info(p);other=[b for b in ii['anchors'] if b['num']!=q['number'] and b['rect'][0]<ii['w']*.25]
    if other:break
    regions.append({'page':p,'rect':[20,40,ii['w']-20,ii['h']-55]})
 if q['type']=='MCQ' and re.search(r'Scoring Guide|ANS:|This option is|Scoring Guidelines|Diagnostic',inf['text'],re.I):warn.append('Source is an answer/scoring/diagnostic page; not a clean question-only occurrence.')
 txt='\n\n'.join(regiontext(r['page'],r['rect']) for r in regions)
 q['sourceRegions']=regions;q['sourcePagesOriginal']=list(dict.fromkeys(r['page'] for r in regions));q['fullText']=txt;q['extractionWarnings']=warn
 return q
if __name__=='__main__':
 corpus=[]
 for i,q in enumerate(old):
  corpus.append(extract(q))
  if i%250==0:print(i,flush=True)
 json.dump(corpus,open(ROOT/'apchem-corpus-staged.json','w'),ensure_ascii=False,indent=1)
 print('Staged',len(corpus),'warnings',sum(bool(x['extractionWarnings']) for x in corpus),flush=True)
 heads=[]
 for i,p in enumerate(doc):
  t=p.get_text();ls=[x.strip() for x in t.splitlines() if x.strip()];heads.append({'page':i+1,'chars':len(t),'head':' | '.join(ls[:7])[:250],'tail':' | '.join(ls[-3:])[:150]})
 json.dump(heads,open(ROOT/'page-heads.json','w'),indent=1)
