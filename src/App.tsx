import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Anchor, Chapter, DictEntry, Highlight, Lang, Mode, Prefs, Toc } from './types'
import { loadChapter, loadDict, loadToc, lookup, RegionError } from './api'
import * as store from './store'
import { Reader, type ReaderHandle } from './Reader'
import { Sidebar, type Panel } from './Sidebar'
import { shortGloss } from './gloss'
import { cmpUnit, tokens, unitText } from './text'

const COLORS = ['#F5D77A', '#F4A3A3', '#9CC8F0', '#A8D5AE']
const DEF_PREFS: Prefs = { fontSize: 19, theme: 'paper', spread: 'auto' }

interface Bubble { kind: 'word'; key: string; word: string; es: { key: string; e: DictEntry }[] }
interface Note { kind: 'note'; text: string; x: number; y: number }
interface SelPop { x: number; y: number; lang: Lang; start: Anchor; end: Anchor; text: string }

export default function App() {
  const [toc, setToc] = useState<Toc | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [region, setRegion] = useState<string | null>(null)
  const [ch, setCh] = useState<number>(0)
  const [chap, setChap] = useState<Chapter | null>(null)
  const [startAt, setStartAt] = useState<{ unit?: string; end?: boolean }>({})
  const [mode, setModeS] = useState<Mode>('sentence')
  const [baseZh, setBaseZh] = useState(false)
  const [flips, setFlips] = useState<Record<string, Lang>>({})
  const [glosses, setGlosses] = useState<Map<string, string>>(new Map())
  const [bubble, setBubble] = useState<Bubble | Note | null>(null)
  const [hls, setHls] = useState<Highlight[]>([])
  const [prefs, setPrefsS] = useState<Prefs>(DEF_PREFS)
  const [panel, setPanel] = useState<Panel>(null)
  const [sel, setSel] = useState<SelPop | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [persisted, setPersisted] = useState(false)
  const [info, setInfo] = useState({ page: 0, pages: 1 })
  const [ready, setReady] = useState(false)
  const reader = useRef<ReaderHandle>(null)
  const dict = useRef<Record<string, DictEntry> | null>(null)

  const say = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(t => (t === m ? null : t)), 2400) }, [])

  // 启动：恢复本机数据
  useEffect(() => {
    (async () => {
      const [pr, prog, h, f, m] = await Promise.all([
        store.get<Prefs>('prefs'), store.get<{ ch: number; unit?: string }>('progress'),
        store.get<Highlight[]>('highlights'), store.get<{ base: boolean; flips: Record<string, Lang> }>('flips'), store.get<Mode>('mode'),
      ])
      if (pr) setPrefsS({ ...DEF_PREFS, ...pr })
      if (h) setHls(h)
      if (f) { setBaseZh(f.base); setFlips(f.flips) }
      if (m) setModeS(m)
      setStartAt({ unit: prog?.unit }); setCh(prog?.ch || 1)
      setReady(true)
      setPersisted(await store.persist())
      try { setToc(await loadToc()) } catch (e) { if (e instanceof RegionError) setRegion(e.message); else setErr(String(e)) }
    })()
  }, [])

  useEffect(() => {
    if (!ch) return
    loadChapter(ch).then(c => { setChap(c); loadChapter(ch + 1).catch(() => {}) })
      .catch(e => { if (e instanceof RegionError) setRegion(e.message); else setErr(String(e)) })
  }, [ch])

  useEffect(() => { if (ready) store.set('prefs', prefs) }, [prefs, ready])
  useEffect(() => { if (ready) store.set('highlights', hls) }, [hls, ready])
  useEffect(() => { if (ready) store.set('flips', { base: baseZh, flips }) }, [baseZh, flips, ready])
  useEffect(() => { if (ready) store.set('mode', mode) }, [mode, ready])
  useEffect(() => { document.documentElement.dataset.theme = prefs.theme }, [prefs.theme])

  const langOf = useCallback((u: string): Lang => flips[u] ?? (baseZh ? 'zh' : 'en'), [flips, baseZh])

  const clearWords = () => { setGlosses(new Map()); setBubble(null) }
  const setMode = (m: Mode) => {
    if (m !== 'word') clearWords()
    setModeS(m); say(m === 'word' ? '单词翻译：悬停预选，点一下出释义' : '逐句翻译：点一句换成中文')
  }
  const toggleFull = () => {
    clearWords(); setFlips({}); setBaseZh(b => { say(!b ? '全文已切换为中文' : '全文已切回英文'); return !b })
  }

  const goCh = (n: number, at: { unit?: string; end?: boolean } = {}) => {
    if (!toc || n < 1 || n > toc.chapters.length) return
    setBubble(null); setSel(null); setStartAt(at)
    if (n === ch) { if (at.unit) reader.current?.goUnit(at.unit) } else { setChap(null); setCh(n) }
  }

  // 键盘翻页
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); reader.current?.next() }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); reader.current?.prev() }
      if (e.key === 'Escape') { setBubble(null); setSel(null); setPanel(null) }
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [])

  const unitsOf = useCallback((c: Chapter) => c.paras.flatMap(p => p.u), [])

  const flipHl = (id: string) => {
    const h = hls.find(x => x.id === id); if (!h || !chap) return
    const nf = { ...flips }
    for (const u of unitsOf(chap)) if (cmpUnit(u.id, h.start.u) >= 0 && cmpUnit(u.id, h.end.u) <= 0) nf[u.id] = h.lang
    setFlips(nf); say(h.lang === 'en' ? '已换回英文，划线重新出现' : '已换成中文，划线重新出现')
  }

  const onClick = async (e: React.MouseEvent) => {
    if (getSelection()?.toString()) return
    const t = e.target as HTMLElement
    const dot = t.closest<HTMLElement>('.hl-dot'); if (dot) { flipHl(dot.dataset.hl!); return }
    const fn = t.closest<HTMLElement>('.fn')
    if (fn) { const r = fn.getBoundingClientRect(); setBubble({ kind: 'note', text: fn.dataset.fn!, x: r.left + r.width / 2, y: r.top }); return }
    const unit = t.closest<HTMLElement>('.unit'); if (!unit) { setBubble(null); return }
    const u = unit.dataset.u!, lang = unit.dataset.lang as Lang
    setSel(null)
    if (mode === 'sentence' || lang === 'zh') {
      // 逐句：切换；单词模式下点中文句子 = 复原成英文
      const to: Lang = lang === 'en' ? 'zh' : 'en'
      setFlips(f => { const n = { ...f }; if ((baseZh ? 'zh' : 'en') === to) delete n[u]; else n[u] = to; return n })
      setBubble(null); return
    }
    // 单词模式
    const w = t.closest<HTMLElement>('.w'); if (!w) { setBubble(null); return }
    const key = `${u}:${w.dataset.o}`
    if (glosses.has(key) && (bubble as Bubble | null)?.key === key) {
      const g = new Map(glosses); g.delete(key); setGlosses(g); setBubble(null); return
    }
    const d = (dict.current ??= await loadDict())
    const es = lookup(d, w.textContent || '')
    const g = new Map(glosses); g.set(key, shortGloss(es)); setGlosses(g)
    setBubble({ kind: 'word', key, word: w.textContent || '', es })
  }
  useEffect(() => { if (mode === 'word') loadDict().then(d => (dict.current = d)) }, [mode])

  // 选中文字 → 划线
  const anchorOf = (node: Node, off: number, isEnd: boolean): (Anchor & { lang: Lang }) | null => {
    const el = (node.nodeType === 3 ? node.parentElement : (node as Element).childNodes[off]?.parentElement ?? (node as Element)) as HTMLElement | null
    const span = el?.closest<HTMLElement>('[data-o]'); const unit = el?.closest<HTMLElement>('.unit')
    if (!span || !unit) return null
    const lang = span.dataset.l as Lang, base = +span.dataset.o!
    let o = base + (node.nodeType === 3 ? off : 0)
    if (lang === 'en' && span.classList.contains('w')) o = isEnd ? (o > base ? base + (span.textContent?.length || 0) : base) : base
    return { u: unit.dataset.u!, o, lang }
  }
  const onMouseUp = () => {
    setTimeout(() => {
      const s = getSelection(); if (!s || s.isCollapsed || !chap) return
      const r = s.getRangeAt(0)
      const a = anchorOf(r.startContainer, r.startOffset, false), b = anchorOf(r.endContainer, r.endOffset, true)
      if (!a || !b) return
      if (a.lang !== b.lang) { say('一次划线请在同一种语言里'); return }
      const units = unitsOf(chap)
      const ia = units.findIndex(u => u.id === a.u), ib = units.findIndex(u => u.id === b.u)
      const parts: string[] = []
      for (let i = ia; i <= ib; i++) {
        const u = units[i]; const txt = a.lang === 'en' ? unitText(u.en) : u.zh
        parts.push(txt.slice(i === ia ? a.o : 0, i === ib ? b.o : txt.length))
      }
      const text = parts.join(a.lang === 'en' ? ' ' : '').trim(); if (!text) return
      const rect = r.getBoundingClientRect()
      setSel({ x: rect.left + rect.width / 2, y: rect.top, lang: a.lang, start: { u: a.u, o: a.o }, end: { u: b.u, o: b.o }, text })
    }, 0)
  }
  const addHl = (color: string) => {
    if (!sel || !chap) return
    setHls(h => [...h, { id: crypto.randomUUID(), lang: sel.lang, ch: chap.n, start: sel.start, end: sel.end, color, text: sel.text, created: Date.now() }])
    getSelection()?.removeAllRanges(); setSel(null)
  }

  const onPage = useCallback(({ page, pages, unit }: { page: number; pages: number; unit: string | null }) => {
    setInfo({ page, pages })
    if (unit && ready) store.set('progress', { ch: Number(unit.split('.')[0]), unit })
  }, [ready])

  // 单词气泡定位
  const [bpos, setBpos] = useState<{ x: number; y: number; below: boolean } | null>(null)
  useEffect(() => {
    if (!bubble || bubble.kind !== 'word') { setBpos(null); return }
    const id = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-g="${bubble.key}"]`); if (!el) return setBpos(null)
      const r = el.getBoundingClientRect(); if (r.right < 0 || r.left > innerWidth) return setBpos(null)
      setBpos({ x: r.left + r.width / 2, y: r.top - 6, below: r.top < 230 })
      if (r.top < 230) setBpos({ x: r.left + r.width / 2, y: r.bottom + 8, below: true })
    })
    return () => cancelAnimationFrame(id)
  }, [bubble, info, glosses, prefs])

  const layoutKey = useMemo(() => `${baseZh}|${JSON.stringify(flips)}|${glosses.size}|${hls.length}|${prefs.spread}`, [baseZh, flips, glosses, hls, prefs.spread])
  const chHls = useMemo(() => hls.filter(h => h.ch === chap?.n), [hls, chap])

  if (region) return <div className="wall"><h1>The Bell Jar</h1><p>{region}</p></div>
  const pct = toc && chap ? ((chap.n - 1 + (info.page + 1) / info.pages) / toc.chapters.length) * 100 : 0

  return (
    <div className="app" onMouseDown={e => { if (!(e.target as HTMLElement).closest('.sheet,.tools,.sel-pop')) { if (panel === 'tr') setPanel(null) } }}>
      <Sidebar panel={panel} setPanel={setPanel} mode={mode} baseZh={baseZh} setMode={setMode} toggleFull={toggleFull}
        toc={toc} ch={ch} goCh={n => { setPanel(null); goCh(n) }} hls={hls}
        goHl={h => goCh(h.ch, { unit: h.start.u })}
        delHl={id => setHls(h => h.filter(x => x.id !== id))}
        noteHl={(id, note) => setHls(h => h.map(x => (x.id === id ? { ...x, note } : x)))}
        prefs={prefs} setPrefs={setPrefsS} persisted={persisted}
        onExport={async () => {
          const blob = new Blob([JSON.stringify(await store.exportAll(), null, 1)], { type: 'application/json' })
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `belljar-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click()
        }}
        onImport={async f => { try { await store.importAll(JSON.parse(await f.text())); location.reload() } catch (e) { say(String((e as Error).message)) } }}
      />
      <header className="topbar">
        <span className="tb-book">The Bell Jar</span>
        <i className="tb-sep" />
        <span className="tb-ch">{chap ? `Chapter ${chap.n}` : '…'}</span>
        <span className="tb-page mono">{info.page + 1} / {info.pages}</span>
        <span className={'tb-mode' + (baseZh ? ' zh' : '')} key={`${baseZh}${mode}`}>{baseZh ? '全文中文' : mode === 'word' ? '单词翻译' : '逐句翻译'}</span>
      </header>
      <main className={'sheet-page' + (panel && panel !== 'tr' ? ' shifted' : '')}>
        {err && <div className="wall small">{err}</div>}
        {chap ? (
          <Reader ref={reader} chapter={chap} langOf={langOf} mode={mode} glosses={glosses} active={bubble?.kind === 'word' ? bubble.key : null}
            hls={chHls} fontSize={prefs.fontSize} single={prefs.spread === 'single'} layoutKey={layoutKey} startAt={startAt}
            onEdge={d => goCh(ch + d, d === -1 ? { end: true } : {})} onPage={onPage} onClick={onClick} onMouseUp={onMouseUp} />
        ) : <div className="skeleton">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ width: `${92 - (i % 3) * 14}%` }} />)}</div>}
        <div className="progress"><i style={{ transform: `scaleX(${pct / 100})` }} /></div>
      </main>

      {bubble?.kind === 'word' && bpos && createPortal(
        <div className={'bubble' + (bpos.below ? ' below' : '')} style={{ left: bpos.x, top: bpos.y }} onMouseDown={e => e.stopPropagation()}>
          <div className="b-head"><b>{bubble.word}</b>{bubble.es[0]?.e.p && <span className="ipa">/{bubble.es[0].e.p}/</span>}
            <button className="b-x" onClick={() => setBubble(null)} aria-label="关闭">×</button></div>
          {!bubble.es.length && <p className="b-miss">词典里没收这个词（多半是作者自造的复合词）。</p>}
          {bubble.es.map(({ key, e }) => (
            <div key={key} className="b-entry">
              {bubble.es.length > 1 && <div className="b-part">{key} {e.p && <span className="ipa">/{e.p}/</span>}</div>}
              {e.l && <div className="b-lemma">原形 <b>{e.l}</b> {e.lp && <span className="ipa">/{e.lp}/</span>}</div>}
              <ul>{(e.lt && /(过去式|过去分词|现在分词|复数|第三人称)/.test(e.t.join('')) ? [...e.t.slice(0, 1), ...e.lt] : e.t).map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          ))}
        </div>, document.body)}

      {bubble?.kind === 'note' && createPortal(
        <div className="bubble note" style={{ left: Math.min(bubble.x, innerWidth - 200), top: bubble.y - 6 }} onMouseDown={e => e.stopPropagation()}>
          <div className="b-head"><b>译注</b><button className="b-x" onClick={() => setBubble(null)}>×</button></div>
          {bubble.text.split('\n').map((t, i) => <p key={i}>{t.trim()}</p>)}
        </div>, document.body)}

      {sel && createPortal(
        <div className="sel-pop" style={{ left: sel.x, top: sel.y }} onMouseDown={e => e.preventDefault()}>
          <span className="sp-l">{sel.lang === 'en' ? '划英文' : '划中文'}</span>
          {COLORS.map(c => <button key={c} style={{ background: c }} onClick={() => addHl(c)} aria-label="划线" />)}
        </div>, document.body)}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
// keep tree-shaking honest
void tokens
