export interface Book {
  id: string
  title: string
  englishTitle: string
  author: string
  originalAuthor: string
  chapters: number
  description: string
  languages: string[]
  addedAt: string
  color: string
  cover: { src: string; alt: string }
}

export const BOOKS: Book[] = [
  {
    id: 'belljar',
    title: '钟形罩',
    englishTitle: 'The Bell Jar',
    author: '西尔维娅·普拉斯',
    originalAuthor: 'Sylvia Plath',
    chapters: 20,
    description: '在原著与译文之间，找到自己的阅读节奏。',
    languages: ['英文原著', '中文对照'],
    addedAt: '2026-10-24',
    color: '#34251b',
    cover: {
      src: '/covers/belljar-oil-v1.webp',
      alt: '古典油画：玻璃钟形罩中的女性倒影，窗边的微光与两枚无花果。',
    },
  },
]

export interface ReadingProgress { ch: number; unit?: string; percent?: number; updated?: number }
export interface ReadingSummary { progress?: ReadingProgress; notes: number; highlights: number }

export function readPath(id: string) { return `/?book=${encodeURIComponent(id)}` }
