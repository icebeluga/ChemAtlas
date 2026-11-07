import fitz,json,re
from pathlib import Path
r=Path(__file__).parent
p=fitz.open('/workspace/scratch/35a31b3ffba2/upload/AP Chemistry MEGA Compiled Test Bank.pdf')
qs=[q for q in json.load(open(r.parent/'public/questions.json'))['questions'] if q['type']=='FRQ']
for q in qs:
 chunks=[]
 for pi,pn in enumerate(q['sourcePagesOriginal']):
  text=p[pn-1].get_text(sort=True)
  if pi==0:
   m=re.search(r'(?m)^\s*'+str(q['number'])+r'\.\s+[A-Za-z]',text)
   if m:text=text[m.start():]
  m=re.search(r'(?m)^\s*'+str(q['number']+1)+r'\.\s+[A-Za-z]',text)
  if m:text=text[:m.start()]
  text=re.sub(r'(?m)^.*(?:Copyright|©|Visit apcentral|GO ON TO|AP.?®? CHEMISTRY FREE|AP ® CHEMISTRY FREE).*$','',text)
  chunks.append(text)
 q['fullText']='\n'.join(chunks)
json.dump(qs,open(r/'frq-existing-full.json','w'))
