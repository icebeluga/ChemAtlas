import fitz,concurrent.futures,subprocess,os,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent;OUT=ROOT/'ocr';OUT.mkdir(exist_ok=True)
PDF='/workspace/scratch/35a31b3ffba2/upload/AP Chemistry MEGA Compiled Test Bank.pdf'
def run(pn):
 if (OUT/f'{pn}.tsv').exists():return pn
 d=fitz.open(PDF);p=d[pn-1];path=OUT/f'{pn}.png';p.get_pixmap(matrix=fitz.Matrix(2,2)).save(path)
 subprocess.run(['tesseract',str(path),str(OUT/pn.__str__()),'--dpi','144','tsv','txt'],env={**os.environ,'OMP_THREAD_LIMIT':'1'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
 path.unlink();return pn
pages=list(range(1121,1179))+list(range(2079,2128))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
 for pn in ex.map(run,pages):print(pn,flush=True)
