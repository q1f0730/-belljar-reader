import type { DictEntry } from './types'
const INFL = /(过去式|过去分词|现在分词|复数|第三人称|比较级|最高级)/
function first(t: string[] | undefined) {
  for (const line of t || []) {
    const body = line.replace(/^[a-z]+\.\s*/, '').replace(/\(.*?\)|（.*?）|\[.*?\]/g, '').trim()
    const piece = body.split(/[；;，,]/)[0].trim()
    if (piece) return piece.length > 7 ? piece.slice(0, 7) + '…' : piece
  }
  return '?'
}
export function shortGloss(es: { e: DictEntry }[]) {
  if (!es.length) return '—'
  return es.map(({ e }) => (e.lt && (INFL.test(e.t.join('')) || !e.t.length) ? first(e.lt) : first(e.t))).join('·')
}
