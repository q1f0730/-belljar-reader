export type Lang = 'en' | 'zh'
export interface Unit { id: string; en: string[]; zh: string }
export interface Para { u: Unit[]; fn?: string[] }
export interface Chapter { n: number; paras: Para[] }
export interface Toc { title: string; author: string; chapters: { n: number; en: string; zh: string }[] }
export type Mode = 'word' | 'sentence'
export interface Anchor { u: string; o: number }
export interface Highlight {
  id: string; lang: Lang; ch: number; start: Anchor; end: Anchor
  color: string; text: string; note?: string; created: number
}
export interface DictEntry { p: string; t: string[]; l?: string; lp?: string; lt?: string[] }
export interface Prefs { fontSize: number; theme: 'paper' | 'night'; spread: 'auto' | 'single' }
