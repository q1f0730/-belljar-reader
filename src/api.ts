import type { Chapter, DictEntry, Toc } from './types'
import type { Book } from './library'
export class RegionError extends Error {}
async function j<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (r.status === 451) throw new RegionError((await r.json()).message)
  if (!r.ok) throw new Error(`加载失败 ${r.status}`)
  return r.json()
}
export function createBookApi(book: Book) {
  const cache = new Map<number, Promise<Chapter>>()
  const base = `/books/${encodeURIComponent(book.id)}`
  return {
    loadToc: () => j<Toc>(`${base}/toc.json`),
    loadChapter(n: number) {
      if (!Number.isInteger(n) || n < 1 || n > book.chapters) return Promise.reject(new Error('没有这一章'))
      if (!cache.has(n)) cache.set(n, j<Chapter>(`${base}/ch${String(n).padStart(2, '0')}.json`).catch(e => { cache.delete(n); throw e }))
      return cache.get(n)!
    },
  }
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

