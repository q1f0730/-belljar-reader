export interface Tok { s: string; o: number; w: boolean }
const RE = /[A-Za-z]+(?:[’'-][A-Za-z]+)*|[^A-Za-z]+/g
export function tokens(text: string): Tok[] {
  const out: Tok[] = []
  for (const m of text.matchAll(RE)) out.push({ s: m[0], o: m.index!, w: /[A-Za-z]/.test(m[0][0]) })
  return out
}
// 单元 id "章.段.句" 的先后比较
export function cmpUnit(a: string, b: string) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}
export const unitText = (en: string[]) => en.join(' ')
