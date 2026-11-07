"""Keep every original source page, split only to respect per-asset hosting limits."""
from pathlib import Path
import fitz,json,sys
root=Path(__file__).resolve().parents[1]
source=fitz.open(sys.argv[1]); out=root/'public'/'source';out.mkdir(exist_ok=True)
manifest=[]
for i,start in enumerate(range(0,len(source),300)):
 end=min(len(source),start+300); target=out/f'bank-{i+1:02}.pdf'
 doc=fitz.open();doc.insert_pdf(source,from_page=start,to_page=end-1)
 doc.save(target,garbage=4,deflate=True)
 assert target.stat().st_size<25*1024*1024,(target,target.stat().st_size)
 manifest.append({'url':f'/source/{target.name}','from':start+1,'to':end,'bytes':target.stat().st_size})
(root/'research'/'source-manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'pages':len(source),'files':len(manifest),'bytes':sum(m['bytes'] for m in manifest)}))
