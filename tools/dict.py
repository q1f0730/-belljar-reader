import csv,json,re,sys
csv.field_size_limit(10**8)
b=json.load(open('book.json'))
words=set()
for ch in b:
    for p in ch['paras']:
        for u in p['u']:
            for s in u['en']:
                for w in re.findall(r"[A-Za-z]+(?:[’'-][A-Za-z]+)*",s):
                    words.add(w.lower().replace('’',"'"))
print('tokens',len(words))
D={}
for row in csv.DictReader(open('../ecdict.zip',encoding='utf-8')):
    D[row['word'].lower()]=row if row['word'].lower() not in D or row['word'].islower() else D[row['word'].lower()]
def entry(w):
    r=D.get(w)
    if not r: return None
    tr=[l for l in r['translation'].replace('\\r','').split('\\n') if l and not l.startswith('[网络]')][:4]
    if not tr: tr=[l for l in r['translation'].replace('\\r','').split('\\n') if l][:2]
    return {'w':r['word'],'p':r['phonetic'],'t':tr}
out={};miss=[]
for w in sorted(words):
    cands=[w]
    if "'" in w: cands.append(w.split("'")[0])
    if '-' in w: cands+= [w.replace('-',' '),w.replace('-','')]
    e=None
    for c in cands:
        e=entry(c)
        if e: break
    if not e: miss.append(w); continue
    r=D.get(e['w'].lower())
    lemma=None
    for part in (r['exchange'] or '').split('/'):
        if part.startswith('0:'): lemma=part[2:]
    o={'p':e['p'],'t':e['t']}
    if lemma and lemma.lower()!=w:
        le=entry(lemma.lower())
        if le: o['l']=lemma; o['lp']=le['p']; o['lt']=le['t'][:3]
    out[w]=o
print('hit',len(out),'miss',len(miss)); print(miss[:80])
json.dump(out,open('dict.json','w'),ensure_ascii=False,separators=(',',':'))
