import re,json,html
from bs4 import BeautifulSoup
def txt(el): return re.sub(r'\s+',' ',el.get_text()).strip()
en=[];zh=[]
for i in range(1,21):
    s=BeautifulSoup(open(f'en/OPS/9780571248209_chapter_{i:02d}.html',encoding='utf-8'),'html.parser')
    ps=[txt(p) for p in s.find_all('p')]; ps=[p for p in ps if p]
    en.append(ps)
    s=BeautifulSoup(open(f'zh/EPUB/xhtml/Section{i:04d}.xhtml',encoding='utf-8'),'html.parser')
    notes={}
    for a in s.find_all('aside'):
        notes[a.get('id')]=txt(a); a.decompose()
    out=[]
    for p in s.find_all('p'):
        fn=[]
        for sup in p.find_all('sup'):
            a=sup.find('a'); 
            if a and a.get('href','').startswith('#'): fn.append(notes.get(a['href'][1:],''))
            sup.decompose()
        t=txt(p)
        if t: out.append({'t':t,'fn':fn})
    zh.append(out)
for i in range(20):
    le=sum(len(p) for p in en[i]); lz=sum(len(p['t']) for p in zh[i])
    print(i+1,len(en[i]),len(zh[i]),le,lz,round(lz/le,3),sum(len(p['fn']) for p in zh[i]))
json.dump({'en':en,'zh':zh},open('raw.json','w'),ensure_ascii=False)
