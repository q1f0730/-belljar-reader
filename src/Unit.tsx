import { memo } from 'react'
import type { Highlight, Lang, Unit as U } from './types'
import { tokens, cmpUnit, unitText } from './text'

export function rangeIn(h: Highlight, uid: string, len: number): [number, number] | null {
  if (cmpUnit(uid, h.start.u) < 0 || cmpUnit(uid, h.end.u) > 0) return null
  const s = uid === h.start.u ? h.start.o : 0
  const e = uid === h.end.u ? h.end.o : len
  return e > s ? [s, e] : null
}

interface Props {
  unit: U; lang: Lang; tr: boolean; glosses: Map<string, string>; hls: Highlight[]; active: string | null
}

function colorAt(spans: { s: number; e: number; c: string; id: string }[], a: number, b: number) {
  let hit: { c: string; id: string } | null = null
  for (const r of spans) if (r.s < b && r.e > a) hit = r
  return hit
}

export const UnitView = memo(function UnitView({ unit, lang, tr, glosses, hls, active }: Props) {
  const text = lang === 'en' ? unitText(unit.en) : unit.zh
  const mine: { s: number; e: number; c: string; id: string }[] = []
  const dots: Highlight[] = []
  for (const h of hls) {
    const r = rangeIn(h, unit.id, h.lang === lang ? text.length : 1e9)
    if (!r) continue
    if (h.lang === lang) mine.push({ s: r[0], e: r[1], c: h.color, id: h.id })
    else if (!dots.some(d => d.id === h.id)) dots.push(h)
  }
  const dotEls = dots.map(h => (
    <button key={h.id} className="hl-dot" data-hl={h.id} style={{ ['--c' as string]: h.color }}
      title={h.lang === 'en' ? '这里有英文划线，点一下换回英文' : '这里有中文划线，点一下换成中文'} />
  ))
  if (lang === 'zh') {
    const cuts = new Set([0, text.length]); mine.forEach(r => { cuts.add(Math.max(0, r.s)); cuts.add(Math.min(text.length, r.e)) })
    const pts = [...cuts].sort((a, b) => a - b)
    return (
      <span className={'unit zh' + (tr ? ' tr' : '')} data-u={unit.id} data-lang="zh">
        {pts.slice(0, -1).map((a, i) => {
          const b = pts[i + 1]; const h = colorAt(mine, a, b)
          return <span key={a} data-o={a} data-l="zh" className={h ? 'hl' : undefined}
            style={h ? { ['--c' as string]: h.c } : undefined}>{text.slice(a, b)}</span>
        })}
        {dotEls}
      </span>
    )
  }
  const toks = tokens(text)
  return (
    <span className={'unit en' + (tr ? ' tr' : '')} data-u={unit.id} data-lang="en">
      {toks.map(t => {
        const h = colorAt(mine, t.o, t.o + t.s.length)
        const style = h ? { ['--c' as string]: h.c } : undefined
        if (!t.w) return <span key={t.o} data-o={t.o} data-l="en" className={h ? 'hl' : undefined} style={style}>{t.s}</span>
        const key = `${unit.id}:${t.o}`
        const g = glosses.get(key)
        if (g === undefined)
          return <span key={t.o} data-o={t.o} data-l="en" className={h ? 'w hl' : 'w'} style={style}>{t.s}</span>
        return (
          <span key={t.o} className={'gw' + (active === key ? ' on' : '')} data-g={key}>
            <span className="gl" aria-hidden>{g}</span>
            <span data-o={t.o} data-l="en" className={h ? 'w hl' : 'w'} style={style}>{t.s}</span>
          </span>
        )
      })}
      {dotEls}
    </span>
  )
})
