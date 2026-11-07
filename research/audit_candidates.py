from extract_corpus import *
allinfo={}
for pn in range(1,len(doc)+1):
 inf=info(pn);allinfo[pn]=inf
json.dump(allinfo,open(ROOT/'page-geometry.json','w'),ensure_ascii=False)
oldkeys={(q['sourcePagesOriginal'][0],q['number']) for q in old}
for pn,inf in allinfo.items():
 if not inf['anchors']:continue
 t=inf['text']
 new=[a for a in inf['anchors'] if (pn,a['num']) not in oldkeys]
 if new:print(pn,','.join(str(a['num']) for a in new),' '.join(t.split())[:75])
