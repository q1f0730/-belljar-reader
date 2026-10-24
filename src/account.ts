// 账号与云同步。服务器上每类数据一个文档：{ items, del }，del 是删除记录（id → 删除时间），
// 这样两台设备合并时，删掉的东西不会被另一台"复活"。
export interface User { name: string }
export interface Note { id: string; text: string; ch?: number; unit?: string; quote?: string; created: number; upd: number }
export interface ChatMsg { id: string; role: 'user' | 'assistant'; content: string; at: number; quote?: string; conv?: string } // conv：所属对话，旧数据没有则归到 'legacy'
export type SyncKind = 'highlights' | 'notes' | 'chats'
export interface Doc<T> { items: T[]; del: Record<string, number> }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({})) as {message?:string;error?:string}
  if (!r.ok) throw Object.assign(new Error(data.message || data.error || `出错了（${r.status}）`), { status: r.status, data })
  return data as T
}

export const me = () => call<{ user: User | null }>('/api/auth/me').then(r => r.user).catch(() => null)
export const login = (name: string, password: string) => call<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ name, password }) }).then(r => r.user)
export const register = (name: string, password: string) => call<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, password }) }).then(r => r.user)
export const logout = () => call('/api/auth/logout', { method: 'POST' }).catch(() => {})

type Remote = Partial<Record<SyncKind | 'progress', { data: unknown; updated: number }>>
export const pullAll = () => call<Remote>('/api/sync')

const KEEP_DEL = 90 * 864e5
export function merge<T extends { id: string }>(a: Doc<T>, b: Doc<T>): Doc<T> {
  const del: Record<string, number> = {}
  const now = Date.now()
  for (const d of [a.del, b.del]) for (const [k, v] of Object.entries(d || {})) if (now - v < KEEP_DEL) del[k] = Math.max(del[k] || 0, v)
  const seen = new Set<string>(); const items: T[] = []
  for (const it of [...(a.items || []), ...(b.items || [])]) { // a 优先（本机最新的修改）
    if (seen.has(it.id) || del[it.id]) continue
    seen.add(it.id); items.push(it)
  }
  return { items, del }
}
export const asDoc = <T>(x: unknown): Doc<T> => {
  if (Array.isArray(x)) return { items: x as T[], del: {} }
  const d = x as Doc<T> | null
  return { items: Array.isArray(d?.items) ? d!.items : [], del: d?.del && typeof d.del === 'object' ? d.del : {} }
}

// 一类数据的同步器：本机改动后防抖推送；服务器版本更新了（别的设备改过）就合并后再推
export class Syncer<T extends { id: string }> {
  base: number | undefined
  private last: Set<string> = new Set()
  private del: Record<string, number> = {}
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: T[] | null = null
  private inflight = false
  private kind: SyncKind; private onRemote: (items: T[]) => void; private onState: (s: 'idle' | 'saving' | 'error') => void
  constructor(kind: SyncKind, onRemote: (items: T[]) => void, onState: (s: 'idle' | 'saving' | 'error') => void) { this.kind = kind; this.onRemote = onRemote; this.onState = onState }

  // 登录后第一次：把服务器和本机合并
  init(remote: { data: unknown; updated: number } | undefined, local: T[]) {
    const r = asDoc<T>(remote?.data)
    const m = merge({ items: local, del: {} }, r)
    this.base = remote?.updated; this.del = m.del; this.last = new Set(m.items.map(i => i.id))
    return m.items
  }
  // 本机数据变了
  push(items: T[]) {
    const ids = new Set(items.map(i => i.id))
    for (const id of this.last) if (!ids.has(id)) this.del[id] = Date.now()
    for (const id of ids) delete this.del[id]
    this.last = ids
    this.pending = items
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 900)
  }
  async flush(retry = true): Promise<void> {
    if (this.inflight || !this.pending) return
    const items = this.pending; this.pending = null; this.inflight = true; this.onState('saving')
    try {
      const r = await call<{ updated: number }>(`/api/sync/${this.kind}`, { method: 'PUT', body: JSON.stringify({ data: { items, del: this.del }, base: this.base }) })
      this.base = r.updated; this.onState('idle')
    } catch (e) {
      const err = e as Error & { status?: number; data?: { data: unknown; updated: number } }
      if (err.status === 409 && err.data && retry) {
        const m = merge({ items, del: this.del }, asDoc<T>(err.data.data))
        this.base = err.data.updated; this.del = m.del; this.last = new Set(m.items.map(i => i.id))
        this.onRemote(m.items)
        if (!this.pending) this.pending = m.items
        this.inflight = false; return this.flush(false)
      }
      if (!this.pending) this.pending = items // 失败了留着下次再推
      this.onState('error')
    } finally { this.inflight = false }
    if (this.pending) { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 4000) }
  }
  // 回到页面时检查别的设备有没有改过
  refresh(remote: { data: unknown; updated: number } | undefined, local: T[]) {
    if (!remote || remote.updated === this.base || this.pending || this.inflight) return
    const m = merge({ items: local, del: this.del }, asDoc<T>(remote.data))
    this.base = remote.updated; this.del = m.del; this.last = new Set(m.items.map(i => i.id))
    this.onRemote(m.items)
    const changed = m.items.length !== local.length || m.items.some((x, i) => x !== local[i])
    if (changed) { this.pending = m.items; this.flush() }
  }
}

// AI 对话：流式读取
export async function ask(messages: { role: string; content: string }[], context: { chapter?: number; page?: string; quote?: string }, onText: (t: string) => void, signal?: AbortSignal) {
  const r = await fetch('/api/ai', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, context }), signal })
  if (!r.ok || !r.body) { const d = await r.json().catch(() => ({})) as {message?:string;error?:string}; throw new Error(d.error || `AI 出错了（${r.status}）`) }
  const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''
  for (;;) {
    const { done, value } = await rd.read(); if (done) break
    buf += dec.decode(value, { stream: true })
    const parts = buf.split('\n\n'); buf = parts.pop() || ''
    for (const p of parts) {
      const d = p.replace(/^data:\s*/, '').trim(); if (!d || d === '[DONE]') continue
      try { const t = JSON.parse(d).t; if (t) onText(t) } catch { /* ignore */ }
    }
  }
}

