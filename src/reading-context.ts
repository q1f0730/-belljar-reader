import type { Book } from './library'
import type { Chapter } from './types'

export interface ReadingContext {
  bookTitle: string; author: string; chapter: number; pageNumber: number
  page: string; chapterExcerpt: string; quote?: string
}
export function readingContext(book: Book, chapter: Chapter, visibleIds: string[], pageNumber: number, quote?: string): ReadingContext {
  const all = chapter.paras.flatMap(p => p.u), visible = new Set(visibleIds)
  const text = (u: typeof all[number]) => `[${u.id}] ${u.en.join(' ')}\n${u.zh}`
  const first = Math.max(0, all.findIndex(u => visible.has(u.id)))
  // Prefer the actual page; only fall back to the current chapter's opening.
  const page = (visible.size ? all.filter(u => visible.has(u.id)) : all.slice(first, first + 8)).map(text).join('\n\n').slice(0, 12000)
  const nearby = all.slice(Math.max(0, first - 10)).map(text).join('\n\n').slice(0, 20000)
  return { bookTitle: `${book.title} / ${book.englishTitle}`, author: book.originalAuthor, chapter: chapter.n, pageNumber, page, chapterExcerpt: nearby, ...(quote ? { quote: quote.slice(0, 1500) } : {}) }
}
