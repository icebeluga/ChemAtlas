from pathlib import Path
import re,json,fitz
R=Path(__file__).parent; pdf=fitz.open('/workspace/scratch/35a31b3ffba2/upload/AP Chemistry MEGA Compiled Test Bank.pdf')
cor=json.load(open(R/'apchem-corpus-staged.json')); existing={q['id'] for q in cor}; additions=[]
def ocr(p):
 f=R/'ocr'/f'{p}.txt';return f.read_text(errors='replace') if f.exists() else ''
def addmcq(year,lo,hi,last):
 pages=[];found={}
 for p in range(lo,hi+1):
  t=ocr(p);pages.append((p,t))
  for line in t.splitlines():
   m=re.match(r'^\s*(\d{1,2})[.)]\s+\S',line)
   if m and 1<=int(m[1])<=last:found.setdefault(int(m[1]),p)
 # Fill unreadable question starts only to the closest visible neighboring question; explicitly flag it.
 for n in range(1,last+1):
  if n not in found:
   low=[(q,p) for q,p in found.items() if q<n]; high=[(q,p) for q,p in found.items() if q>n]
   found[n]=max(low)[1] if low else min(high)[1]
  p=found[n]; text=ocr(p); warning=[]
  m=re.search(r'(?m)^\s*'+str(n)+r'[.)]\s+(.+)',text)
  if not m:warning=['Question number was not legible in OCR; source page retained and needs visual verification.']
  preview=' '.join((m.group(0) if m else text).split())[:350]
  q={'id':f'mcq-{year}-{n}-{p}','type':'MCQ','year':str(year),'exam':f'{year} AP Chemistry MCQ','number':n,'pages':[p],'sourcePagesOriginal':[p],'primaryUnit':None,'unitName':None,'primaryTopic':None,'topicName':None,'secondaryTopics':[],'secondaryTopicNames':[],'relatedTopics':[],'topicParts':[],'multiConcept':False,'classificationConfidence':0,'status':'review','reviewReason':'OCR-extracted scanned exam; semantic topic review required.' if not warning else warning[0],'textPreview':preview,'fullText':text[:5000],'source':'AP Chemistry MEGA Compiled Test Bank.pdf','sourceRegions':[{'page':p,'rect':[20,45,pdf[p-1].rect.width-20,pdf[p-1].rect.height-45]}],'extractionWarnings':warning}
  if q['id'] not in existing:additions.append(q);existing.add(q['id'])
addmcq(2017,1122,1148,50);addmcq(2024,2079,2110,60)
def addfrq(year,lo,hi):
 pages={}
 for p in range(lo,hi+1):
  t=ocr(p);m=re.search(r'Question\s+(\d+)\s*(?:a)?\s*(?:Begin|Continue) your response',t,re.I)
  if m:pages.setdefault(int(m[1]),[]).append(p)
 nums=range(1,8)
 for n in nums:
  ps=pages.get(n,[])
  if not ps:continue
  # Stop at next FRQ number, so a preceding question cannot eat the next page.
  ps=sorted(set(ps));first=ps[0]
  full='\n'.join(f'ORIGINAL PAGE {p}\n{ocr(p)}' for p in ps)
  q={'id':f'frq-{year}-{n}-{first}','type':'FRQ','year':str(year),'exam':f'{year} AP Chemistry FRQ','number':n,'pages':ps,'sourcePagesOriginal':ps,'primaryUnit':None,'unitName':None,'primaryTopic':None,'topicName':None,'secondaryTopics':[],'secondaryTopicNames':[],'relatedTopics':[],'topicParts':[],'multiConcept':False,'classificationConfidence':0,'status':'review','reviewReason':'Scanned free-response prompt; semantic topic and subpart review required.','textPreview':' '.join(full.split())[:350],'fullText':full,'source':'AP Chemistry MEGA Compiled Test Bank.pdf','sourceRegions':[{'page':p,'rect':[18,40,pdf[p-1].rect.width-18,pdf[p-1].rect.height-45]} for p in ps],'extractionWarnings':[]}
  if q['id'] not in existing:additions.append(q);existing.add(q['id'])
# 2017 has the question number at the beginning of the prompt but OCR lost the
# printed continuation headers; include the visible prompt pages by exam order.
for n,ps in {1:[1153,1154],2:[1155,1156],3:[1157,1158],4:[1159],5:[1160],6:[1161],7:[1162]}.items():
 full='\n'.join(f'ORIGINAL PAGE {p}\n{ocr(p)}' for p in ps)
 q={'id':f'frq-2017-{n}-{ps[0]}','type':'FRQ','year':'2017','exam':'2017 AP Chemistry FRQ','number':n,'pages':ps,'sourcePagesOriginal':ps,'primaryUnit':None,'unitName':None,'primaryTopic':None,'topicName':None,'secondaryTopics':[],'secondaryTopicNames':[],'relatedTopics':[],'topicParts':[],'multiConcept':False,'classificationConfidence':0,'status':'review','reviewReason':'Scanned free-response prompt; semantic topic and subpart review required.' if full.strip() else 'Question image is retained, but OCR did not recover prompt text.','textPreview':' '.join(full.split())[:350],'fullText':full,'source':'AP Chemistry MEGA Compiled Test Bank.pdf','sourceRegions':[{'page':p,'rect':[18,40,pdf[p-1].rect.width-18,pdf[p-1].rect.height-45]} for p in ps],'extractionWarnings':[] if full.strip() else ['OCR text missing; inspect original image.']}
 if q['id'] not in existing:additions.append(q);existing.add(q['id'])
addfrq(2024,2111,2127)
(R/'scanned-additions.json').write_text(json.dumps(additions,ensure_ascii=False,indent=1))
print('added',len(additions),'mcq',sum(q['type']=='MCQ' for q in additions),'frq',sum(q['type']=='FRQ' for q in additions))
