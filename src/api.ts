import type { Chapter, DictEntry, Toc } from './types'
export class RegionError extends Error {}
async function j<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (r.status === 451) throw new RegionError((await r.json()).message)
  if (!r.ok) throw new Error(`加载失败 ${r.status}`)
  return r.json()
}
const cache = new Map<number, Promise<Chapter>>()
export const loadToc = () => j<Toc>('/api/toc')
export function loadChapter(n: number) {
  if (!cache.has(n)) cache.set(n, j<Chapter>(`/api/ch/${n}`).catch(e => { cache.delete(n); throw e }))
  return cache.get(n)!
}
let dict: Promise<Record<string, DictEntry>> | null = null
export const loadDict = () => (dict ??= j('/data/dict.json'))
export function lookup(d: Record<string, DictEntry>, raw: string): { key: string; e: DictEntry }[] {
  const w = raw.toLowerCase().replace(/’/g, "'")
  const tries = [w, w.replace(/'(s|d|ll|re|ve|m)$/, ''), w.replace(/n't$/, '')]
  for (const t of tries) if (d[t]) return [{ key: t, e: d[t] }]
  if (w.includes('-')) {
    const parts = w.split('-').filter(p => d[p]).map(p => ({ key: p, e: d[p] }))
    if (parts.length) return parts
  }
  return []
}
