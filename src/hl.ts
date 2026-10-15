// 划线的合并与擦除：同一章、同一语言里重叠/相接的划线合成一条（用新颜色），擦除时把选中部分切掉。
import type { Anchor, Highlight, Lang, Unit } from './types'
import { cmpUnit, unitText } from './text'

export const cmpPos = (a: Anchor, b: Anchor) => cmpUnit(a.u, b.u) || a.o - b.o
const minPos = (a: Anchor, b: Anchor) => (cmpPos(a, b) <= 0 ? a : b)
const maxPos = (a: Anchor, b: Anchor) => (cmpPos(a, b) >= 0 ? a : b)

export function textOf(units: Unit[], lang: Lang, start: Anchor, end: Anchor) {
  const ia = units.findIndex(u => u.id === start.u), ib = units.findIndex(u => u.id === end.u)
  if (ia < 0 || ib < 0) return ''
  const parts: string[] = []
  for (let i = ia; i <= ib; i++) {
    const u = units[i]; const t = lang === 'en' ? unitText(u.en) : u.zh
    parts.push(t.slice(i === ia ? start.o : 0, i === ib ? end.o : t.length))
  }
  return parts.join(lang === 'en' ? ' ' : '').replace(/\s+/g, ' ').trim()
}

const same = (h: Highlight, ch: number, lang: Lang) => h.ch === ch && h.lang === lang
// 重叠或首尾相接
const touches = (h: Highlight, s: Anchor, e: Anchor) => cmpPos(h.start, e) <= 0 && cmpPos(s, h.end) <= 0
// 真正重叠（有共同的字）
export const overlaps = (h: Highlight, s: Anchor, e: Anchor) => cmpPos(h.start, e) < 0 && cmpPos(s, h.end) < 0

export function addMerged(hls: Highlight[], units: Unit[], n: Omit<Highlight, 'id' | 'text' | 'created'>): Highlight[] {
  const hit = hls.filter(h => same(h, n.ch, n.lang) && touches(h, n.start, n.end))
  let s = n.start, e = n.end
  for (const h of hit) { s = minPos(s, h.start); e = maxPos(e, h.end) }
  const notes = hit.map(h => h.note?.trim()).filter(Boolean)
  const merged: Highlight = {
    id: hit[0]?.id ?? crypto.randomUUID(), lang: n.lang, ch: n.ch, start: s, end: e, color: n.color,
    text: textOf(units, n.lang, s, e), note: notes.length ? notes.join('\n') : undefined,
    created: hit.length ? Math.min(...hit.map(h => h.created)) : Date.now(),
  }
  return [...hls.filter(h => !hit.includes(h)), merged]
}

export function erase(hls: Highlight[], units: Unit[], ch: number, lang: Lang, s: Anchor, e: Anchor): Highlight[] {
  const out: Highlight[] = []
  for (const h of hls) {
    if (!same(h, ch, lang) || !overlaps(h, s, e)) { out.push(h); continue }
    const left = cmpPos(h.start, s) < 0 ? { ...h, end: s } : null
    const right = cmpPos(e, h.end) < 0 ? { ...h, start: e } : null
    for (const [i, p] of [left, right].entries()) {
      if (!p) continue
      const text = textOf(units, lang, p.start, p.end); if (!text) continue
      out.push({ ...p, id: i === 1 && left ? crypto.randomUUID() : h.id, text, note: i === 1 && left ? undefined : h.note })
    }
  }
  return out
}
