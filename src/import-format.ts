export interface RawChapter { title: string; paragraphs: string[] }
export interface ParsedBook { title: string; author: string; language: 'en' | 'zh'; chapters: RawChapter[] }
export interface ImportInput { primary: ParsedBook; companion?: ParsedBook; requestId: string }
export interface ChapterPair { primary: number; companion: number | null; en: string; zh: string }
export interface ImportPlan {
  title: string; englishTitle: string; author: string; originalAuthor: string; description: string; chapters: ChapterPair[]
}
export interface SourceSentence { text: string; p: number }
export interface ImportTask { n: number; en: SourceSentence[]; zh: SourceSentence[]; paired: boolean }
export interface Alignment { en: number[]; zh: number[] }
export interface PreparedUnit { en: string[]; zh: string; p: number }
export class AlignmentError extends Error {}

export function validateInput(value: unknown): asserts value is ImportInput {
  const v = value as ImportInput
  if (!v || !/^[a-zA-Z0-9-]{8,80}$/.test(v.requestId)) throw new Error('上传编号无效，请重试。')
  for (const b of [v.primary, v.companion].filter(Boolean) as ParsedBook[]) {
    if (!b || !['en', 'zh'].includes(b.language) || typeof b.title !== 'string' || b.title.length > 500 || typeof b.author !== 'string' || b.author.length > 300 || !Array.isArray(b.chapters) || !b.chapters.length || b.chapters.length > 250) throw new Error('书籍目录无效，最多支持 250 个章节文件。')
    let length = 0
    for (const ch of b.chapters) {
      if (typeof ch.title !== 'string' || ch.title.length > 500 || !Array.isArray(ch.paragraphs) || ch.paragraphs.length > 10000) throw new Error('章节格式无效。')
      for (const p of ch.paragraphs) { if (typeof p !== 'string' || p.length > 50000) throw new Error('段落过长，请先整理文件。'); length += p.length }
    }
    if (!length || length > 2000000) throw new Error('每个版本最多支持 200 万个字符。')
  }
  if (v.companion && v.primary.language === v.companion.language) throw new Error('对照版本需要一中一英。')
}

export function validatePlan(plan: ImportPlan, input: ImportInput) {
  if (!plan || !['title','englishTitle','author','originalAuthor','description'].every(k => typeof (plan as unknown as Record<string, unknown>)[k] === 'string') || !plan.title.trim() || !plan.chapters?.length || plan.chapters.length > 250) throw new Error('AI 未返回有效的章节计划。')
  if ([plan.title,plan.englishTitle,plan.author,plan.originalAuthor].some(t => t.length > 200) || plan.description.length > 500) throw new Error('AI 返回的书籍信息过长。')
  let previous = -1, previousOther = -1
  for (const ch of plan.chapters) {
    if (!Number.isInteger(ch.primary) || ch.primary <= previous || !input.primary.chapters[ch.primary]) throw new Error('AI 章节顺序不完整。')
    if (typeof ch.en !== 'string' || typeof ch.zh !== 'string') throw new Error('AI 章节标题无效。')
    if (input.companion && (ch.companion === null || !Number.isInteger(ch.companion) || ch.companion <= previousOther || !input.companion.chapters[ch.companion])) throw new Error('两个版本的章节未能一一对应，请检查版本。')
    if (!input.companion && ch.companion !== null) throw new Error('章节计划包含不存在的译本。')
    previous = ch.primary; previousOther = ch.companion ?? previousOther
  }
  const checkCoverage=(book:ParsedBook,selected:Set<number>)=>{
    book.chapters.forEach((ch,i)=>{
      if(!selected.has(i)&&ch.paragraphs.join('').length>1500&&!/copyright|acknowledg|about the author|contents|版权|致谢|目\s*录|作者简介|出版说明/i.test(ch.title))throw new Error('AI 遗漏了较长的章节，任务已暂停，请检查目录。')
    })
  }
  checkCoverage(input.primary,new Set(plan.chapters.map(c=>c.primary)))
  if(input.companion)checkCoverage(input.companion,new Set(plan.chapters.map(c=>c.companion!)))
}

export function sentences(text: string, language: 'en' | 'zh'): string[] {
  const Segmenter = Intl.Segmenter
  return [...new Segmenter(language, { granularity: 'sentence' }).segment(text)].map(s => s.segment.trim()).filter(Boolean)
}

// Length alignment only finds bounded, contiguous windows. The model performs
// semantic sentence alignment inside each window; source strings are immutable.
export function paragraphWindows(a: string[], b: string[]): { a: number[]; b: number[] }[] {
  const n = a.length, m = b.length
  if (!n || !m) return [{ a: a.map((_, i) => i), b: b.map((_, i) => i) }]
  if (n * m > 2000000) throw new Error('单章段落过多，请将长章节拆分后再上传。')
  const width = m + 1, cost = new Float64Array((n + 1) * width).fill(Infinity), prev = new Uint8Array(cost.length)
  const moves = [[1,1,0],[2,1,1.2],[1,2,1.2],[2,2,1.8],[1,0,9],[0,1,9]]
  const ratio = b.reduce((s,p) => s+p.length,0) / a.reduce((s,p) => s+p.length,0)
  cost[0] = 0
  for (let i=0;i<=n;i++) for (let j=0;j<=m;j++) {
    if (!Number.isFinite(cost[i*width+j])) continue
    for (let k=0;k<moves.length;k++) {
      const [x,y,penalty]=moves[k]; if(i+x>n || j+y>m)continue
      const left=a.slice(i,i+x).reduce((s,p)=>s+p.length,0)*ratio, right=b.slice(j,j+y).reduce((s,p)=>s+p.length,0)
      const value=cost[i*width+j]+penalty+(x&&y?Math.abs(right-left)/Math.sqrt(.08*(left+right)+4):0)
      const at=(i+x)*width+j+y
      if(value<cost[at]) {cost[at]=value;prev[at]=k+1}
    }
  }
  const out: {a:number[];b:number[]}[]=[]
  let i=n,j=m
  while(i||j){const move=moves[prev[i*width+j]-1];if(!move)throw new Error('无法建立段落顺序。');const[x,y]=move;out.push({a:Array.from({length:x},(_,k)=>i-x+k),b:Array.from({length:y},(_,k)=>j-y+k)});i-=x;j-=y}
  return out.reverse()
}

export function makeTasks(input: ImportInput, plan: ImportPlan): ImportTask[] {
  validatePlan(plan,input)
  const tasks: ImportTask[]=[]
  plan.chapters.forEach((pair,ci)=>{
    const primary=input.primary.chapters[pair.primary].paragraphs
    const other=input.companion && pair.companion!==null?input.companion.chapters[pair.companion].paragraphs:[]
    const en=input.primary.language==='en'?primary:other, zh=input.primary.language==='zh'?primary:other
    let task:ImportTask={n:ci+1,en:[],zh:[],paired:!!input.companion}
    const flush=()=>{if(task.en.length||task.zh.length)tasks.push(task);task={n:ci+1,en:[],zh:[],paired:!!input.companion}}
    const windows=input.companion?paragraphWindows(en,zh):primary.map((_,i)=>({a:input.primary.language==='en'?[i]:[],b:input.primary.language==='zh'?[i]:[]}))
    for(const w of windows){
      const e=w.a.flatMap(p=>sentences(en[p],'en').map(text=>({text,p}))), z=w.b.flatMap(p=>sentences(zh[p],'zh').map(text=>({text,p})))
      const chars=[...e,...z].reduce((s,x)=>s+x.text.length,0)
      if(chars>18000)throw new Error('单段内容过长，请先将该段拆分。')
      if((task.en.length+e.length>80||task.zh.length+z.length>100||[...task.en,...task.zh].reduce((s,x)=>s+x.text.length,0)+chars>8000)&&(task.en.length||task.zh.length))flush()
      task.en.push(...e);task.zh.push(...z)
    }
    flush()
  })
  if(tasks.length>1500)throw new Error('任务过大，请按卷上传。')
  return tasks
}

export function applyAlignment(task: ImportTask, groups: Alignment[]): PreparedUnit[] {
  if(!Array.isArray(groups)||!groups.length)throw new AlignmentError('AI 未返回对齐结果。')
  let en=0,zh=0
  const units:PreparedUnit[]=[]
  for(const g of groups){
    if(!g||!Array.isArray(g.en)||!Array.isArray(g.zh)||(!g.en.length&&!g.zh.length))throw new AlignmentError('AI 对齐分组无效。')
    for(const i of g.en)if(!Number.isInteger(i)||i!==en++||i>=task.en.length)throw new AlignmentError('英文出现遗漏、重复或乱序。')
    for(const i of g.zh)if(!Number.isInteger(i)||i!==zh++||i>=task.zh.length)throw new AlignmentError('中文出现遗漏、重复或乱序。')
    const u={en:g.en.map(i=>task.en[i].text),zh:g.zh.map(i=>task.zh[i].text).join(''),p:g.en.length?task.en[g.en[0]].p:g.zh.length?task.zh[g.zh[0]].p:0}
    if(!u.en.length&&units.length)units[units.length-1].zh+=u.zh
    else units.push(u)
  }
  if(en!==task.en.length||zh!==task.zh.length)throw new AlignmentError('AI 遗漏了原文，结果没有保存。可以重试当前批次。')
  return units
}
