import json,re,math
raw=json.load(open('raw.json'))
def gc_align(A,B,la,lb,r,beads=((1,1,0),(1,0,4),(0,1,4),(2,1,1.5),(1,2,1.5),(2,2,3),(3,1,3),(1,3,3))):
    n,m=len(A),len(B)
    INF=1e18
    D=[[INF]*(m+1) for _ in range(n+1)];P=[[None]*(m+1) for _ in range(n+1)]
    D[0][0]=0
    for i in range(n+1):
        for j in range(m+1):
            if D[i][j]>=INF: continue
            for a,b,pen in beads:
                if i+a>n or j+b>m: continue
                x=sum(la[i:i+a]);y=sum(lb[j:j+b])
                if a and b:
                    c=abs(y-r*x)/math.sqrt(0.08*(x*r+y)+4)
                else: c=0
                c+=pen
                if D[i][j]+c<D[i+a][j+b]:
                    D[i+a][j+b]=D[i][j]+c;P[i+a][j+b]=(a,b)
    out=[];i,j=n,m
    while i or j:
        a,b=P[i][j];out.append((list(range(i-a,i)),list(range(j-b,j))));i-=a;j-=b
    return out[::-1]
ABBR=r'(?:Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|Prof|Rev|Gen|Col|Lt|Capt|Sgt|vs|etc|No|U\.S|a\.m|p\.m|i\.e|e\.g)'
def split_en(p):
    # protect abbreviations
    q=re.sub(r'\b('+ABBR+r')\.',lambda m:m.group(1)+'\u0001',p)
    q=re.sub(r'\b([A-Z])\.(?=\s*[A-Z]\.?)',r'\1'+'\u0001',q)
    parts=re.split(r'(?<=[.!?…])([’”"\')]*)\s+(?=[“"‘\'(A-Z0-9–—-])',q)
    # re.split with group returns separators; rejoin
    sents=[];buf=''
    for k,x in enumerate(parts):
        if k%2==0: buf+=x
        else:
            buf+=x or ''; sents.append(buf);buf=''
    if buf: sents.append(buf)
    # second pass: split on dash-quoted? keep
    sents=[s.replace('\u0001','.').strip() for s in sents if s.strip()]
    out=[]
    for s in sents:
        if out and re.match(r"^(?:[A-Z][\w’']*\s){0,3}(?:said|asked|cried|called|shouted|whispered|murmured|answered|replied|added|went on|repeated|told \w+)\b",s) and out[-1][-1] in '’”\'"':
            out[-1]+=' '+s
        else: out.append(s)
    return out
def split_zh(p):
    out=re.findall(r'.*?(?:[。！？!?]+|……)[”’」』）)]*|.+$',p)
    out=[s.strip() for s in out if s.strip()]
    # merge orphan closing punctuation
    m=[]
    for s in out:
        if m and re.fullmatch(r'[”’」』）)\s]+',s): m[-1]+=s
        else: m.append(s)
    return m
book=[]
stats={'p11':0,'pother':0,'s11':0,'sother':0}
for ci,(E,Z) in enumerate(zip(raw['en'],raw['zh'])):
    r=sum(len(z['t']) for z in Z)/sum(len(e) for e in E)
    pa=gc_align(E,Z,[len(e) for e in E],[len(z['t']) for z in Z],r)
    paras=[]
    for ei,zi in pa:
        if len(ei)==1 and len(zi)==1: stats['p11']+=1
        else: stats['pother']+=1
        etxt=' '.join(E[k] for k in ei); 
        zt=''.join(Z[k]['t'] for k in zi); fns=[f for k in zi for f in Z[k]['fn']]
        es=split_en(etxt) if etxt else []
        zs=split_zh(zt) if zt else []
        if es and zs:
            sa=gc_align(es,zs,[len(x) for x in es],[len(x) for x in zs],r)
        else: sa=[(list(range(len(es))),list(range(len(zs))))]
        units=[]
        for a,b in sa:
            if len(a)==1 and len(b)==1: stats['s11']+=1
            else: stats['sother']+=1
            units.append({'en':[es[k] for k in a],'zh':''.join(zs[k] for k in b)})
        # fold empty-en units into previous unit
        fixed=[]
        for u in units:
            if not u['en'] and fixed: fixed[-1]['zh']+=u['zh']
            elif not u['en'] : fixed.append(u)
            else: fixed.append(u)
        paras.append({'u':fixed,'fn':fns,'pn':len(ei)})
    book.append({'title':f'Chapter {ci+1}','paras':paras})
print(stats)
json.dump(book,open('book.json','w'),ensure_ascii=False)
