// 右侧面板：笔记 / AI 对话。打开时阅读页左移，左侧工具栏收起（悬停才出现）。
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X, ArrowUp, Stop, Trash, Sparkle, Quotes, ArrowSquareOut, PlusCircle, ClockCounterClockwise } from '@phosphor-icons/react'
import type { ChatMsg, Note, User } from './account'

export type Side = 'notes' | 'ai' | null

interface Props {
  side: Side; setSide(s: Side): void; user: User | null; onLogin(): void
  notes: Note[]; addNote(text: string, quote?: string): void; editNote(id: string, text: string): void; delNote(id: string): void; goNote(n: Note): void
  draftQuote: { text: string; for: 'notes' | 'ai' } | null; clearQuote(): void
  chats: ChatMsg[]; sendChat(text: string, quote?: string): void; stopChat(): void; busy: boolean
  conv: string; setConv(id: string): void; newConv(): void; delConv(id: string): void
  ch: number
}

export function SidePanel(p: Props) {
  if (!p.side) return null
  return (
    <aside className="rpanel" aria-label={p.side === 'ai' ? 'AI 对话' : '笔记'}>
      <header>
        <h3>{p.side === 'ai' ? 'AI 对话' : '笔记'}</h3>
        {p.side === 'ai' && p.user && <ChatActions {...p} />}
        <button className="icon-btn" onClick={() => p.setSide(null)} aria-label="关闭"><X weight="bold" /></button>
      </header>
      {!p.user ? (
        <div className="side-gate">
          <p>{p.side === 'ai' ? '登录后可以和 AI 讨论这本书。' : '登录后可以写笔记。'}划线、笔记和对话会自动同步到你的账号，只有你自己看得到。</p>
          <button className="btn primary" onClick={p.onLogin}>登录 / 注册</button>
        </div>
      ) : p.side === 'notes' ? <Notes {...p} /> : <Chat {...p} />}
    </aside>
  )
}

function Quote({ text, onClear }: { text: string; onClear(): void }) {
  return <div className="quote"><Quotes weight="fill" /><span>{text}</span><button onClick={onClear} aria-label="去掉引用"><X weight="bold" /></button></div>
}

function Notes(p: Props) {
  const [text, setText] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  const quote = p.draftQuote?.for === 'notes' ? p.draftQuote.text : undefined
  useEffect(() => { if (quote) ta.current?.focus() }, [quote])
  const save = () => { const t = text.trim(); if (!t && !quote) return; p.addNote(t, quote); setText(''); p.clearQuote() }
  const list = [...p.notes].sort((a, b) => b.created - a.created)
  return (
    <div className="side-body notes">
      <div className="composer">
        {quote && <Quote text={quote} onClear={p.clearQuote} />}
        <textarea ref={ta} value={text} onChange={e => setText(e.target.value)} placeholder={`在第 ${p.ch} 章写点想法…`} rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() } }} maxLength={5000} />
        <div className="composer-row"><small>{text.length ? `${text.length} 字 · Ctrl+Enter 保存` : '会记下当前位置'}</small><button className="btn primary sm" disabled={!text.trim() && !quote} onClick={save}>保存</button></div>
      </div>
      {!list.length && <div className="empty"><p>还没有笔记。选中一段文字，点「记笔记」，也能把它引用进来。</p></div>}
      <ul className="note-list">
        {list.map(n => <NoteItem key={n.id} n={n} {...p} />)}
      </ul>
    </div>
  )
}

function NoteItem({ n, editNote, delNote, goNote }: { n: Note } & Props) {
  const [t, setT] = useState(n.text)
  useEffect(() => setT(n.text), [n.text])
  const d = new Date(n.created)
  return (
    <li>
      <div className="mk-meta">
        {n.ch ? <button className="note-go" onClick={() => goNote(n)} title="跳到这里">CH {String(n.ch).padStart(2, '0')}<ArrowSquareOut weight="bold" /></button> : null}
        <span>{d.getMonth() + 1}/{d.getDate()} {String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')}</span>
        <button className="mk-del" onClick={() => { if (confirm('删除这条笔记？')) delNote(n.id) }} aria-label="删除笔记"><Trash weight="bold" /></button>
      </div>
      {n.quote && <blockquote>{n.quote}</blockquote>}
      <AutoText value={t} onChange={setT} onBlur={() => { if (t !== n.text) editNote(n.id, t) }} />
    </li>
  )
}

function AutoText({ value, onChange, onBlur }: { value: string; onChange(v: string): void; onBlur(): void }) {
  const r = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => { const el = r.current; if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }, [value])
  return <textarea ref={r} className="note-text" value={value} rows={1} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder="（空）" maxLength={5000} />
}

// 对话列表：按对话分组，标题取第一句提问，按最近一条消息排序
export function convsOf(chats: ChatMsg[]) {
  const m = new Map<string, { id: string; title: string; last: number; n: number }>()
  for (const c of chats) {
    const id = c.conv || 'legacy'; const e = m.get(id) ?? { id, title: '', last: 0, n: 0 }
    if (!e.title && c.role === 'user') e.title = c.content.slice(0, 40)
    e.last = Math.max(e.last, c.at); e.n++; m.set(id, e)
  }
  return [...m.values()].sort((a, b) => b.last - a.last)
}
const when = (t: number) => {
  const d = new Date(t), now = new Date()
  if (d.toDateString() === now.toDateString()) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function ChatActions(p: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', f); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', k) }
  }, [open])
  const list = convsOf(p.chats)
  return (
    <div className="chat-acts" ref={ref}>
      <button className="icon-btn" onClick={p.newConv} disabled={p.busy} aria-label="新对话" title="新对话"><PlusCircle weight="bold" /></button>
      <button className={'icon-btn' + (open ? ' on' : '')} onClick={() => setOpen(o => !o)} aria-label="历史记录" aria-expanded={open} title="历史记录"><ClockCounterClockwise weight="bold" /></button>
      {open && (
        <div className="history" role="menu">
          <div className="history-h">历史记录<small>{list.length} 个对话</small></div>
          {!list.length && <p className="history-empty">还没有对话</p>}
          <ul>
            {list.map(c => (
              <li key={c.id} className={c.id === p.conv ? 'on' : ''}>
                <button className="history-go" disabled={p.busy} onClick={() => { p.setConv(c.id); setOpen(false) }}>
                  <span>{c.title || '（无标题）'}</span><small>{when(c.last)}</small>
                </button>
                <button className="history-del" aria-label="删除这个对话" onClick={() => { if (confirm('删除这个对话？')) p.delConv(c.id) }}><Trash weight="bold" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const SUGGEST = ['这一页在讲什么？', '这一页有哪些难懂的句子？', '主人公现在是什么心情？', '这一章的背景知识']

function Chat(p: Props) {
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const quote = p.draftQuote?.for === 'ai' ? p.draftQuote.text : undefined
  useEffect(() => { if (quote) ta.current?.focus() }, [quote])
  // 新消息时滚到底（用户往上翻看旧消息时不打扰）
  const stick = useRef(true)
  const msgs = p.chats.filter(m => (m.conv || 'legacy') === p.conv)
  useLayoutEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight }, [p.chats, p.conv])
  useLayoutEffect(() => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 132) + 'px' }, [text])
  const send = (t = text) => { const s = t.trim(); if (!s || p.busy) return; p.sendChat(s, quote); setText(''); p.clearQuote(); stick.current = true }
  return (
    <div className="side-body chat">
      <div className="msgs" ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 }}>
        {!msgs.length && (
          <div className="chat-empty">
            <Sparkle weight="duotone" />
            <p>问我这本书的任何问题：句子看不懂、人物在想什么、背景典故……我会结合你正在读的这一页来回答。</p>
            <div className="chips">{SUGGEST.map(s => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map(m => (
          <div key={m.id} className={'msg ' + m.role}>
            {m.quote && <blockquote>{m.quote}</blockquote>}
            {m.role === 'assistant' ? <Md text={m.content || (p.busy ? '…' : '')} /> : <p>{m.content}</p>}
          </div>
        ))}
      </div>
      <div className="composer">
        {quote && <Quote text={quote} onClear={p.clearQuote} />}
        <div className="pill">
          <textarea ref={ta} value={text} onChange={e => setText(e.target.value)} rows={1} maxLength={2000} placeholder="问点什么…"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} />
          {p.busy
            ? <button className="send stop" onClick={p.stopChat} aria-label="停止" title="停止"><Stop weight="fill" /></button>
            : <button className="send" disabled={!text.trim()} onClick={() => send()} aria-label="发送" title="发送（Enter）"><ArrowUp weight="bold" /></button>}
        </div>
      </div>
    </div>
  )
}

// 极简 Markdown：段落、**粗体**、`代码`、- 列表、1. 列表、### 标题。不用 innerHTML，杜绝注入。
function inline(s: string, key: string) {
  const out: React.ReactNode[] = []; const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g; let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const t = m[0]
    out.push(t.startsWith('**') ? <b key={key + i++}>{t.slice(2, -2)}</b> : t.startsWith('`') ? <code key={key + i++}>{t.slice(1, -1)}</code> : <i key={key + i++}>{t.slice(1, -1)}</i>)
    last = m.index + t.length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}
export function Md({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []; const lines = text.split('\n'); let list: { ordered: boolean; items: string[] } | null = null; let para: string[] = []
  const flushPara = () => { if (para.length) { blocks.push(<p key={blocks.length}>{inline(para.join(' '), 'p' + blocks.length)}</p>); para = [] } }
  const flushList = () => { if (list) { const L = list.ordered ? 'ol' : 'ul'; blocks.push(<L key={blocks.length}>{list.items.map((t, i) => <li key={i}>{inline(t, `l${blocks.length}-${i}`)}</li>)}</L>); list = null } }
  for (const raw of lines) {
    const l = raw.trimEnd()
    const ul = l.match(/^\s*[-*•]\s+(.*)/), ol = l.match(/^\s*\d+[.)、]\s+(.*)/), h = l.match(/^#{1,4}\s+(.*)/)
    if (ul || ol) { flushPara(); const ordered = !!ol; if (list && list.ordered !== ordered) flushList(); list ??= { ordered, items: [] }; list.items.push((ul || ol)![1]); continue }
    if (h) { flushPara(); flushList(); blocks.push(<h4 key={blocks.length}>{inline(h[1], 'h' + blocks.length)}</h4>); continue }
    if (!l.trim()) { flushPara(); flushList(); continue }
    flushList(); para.push(l.trim())
  }
  flushPara(); flushList()
  return <div className="md">{blocks}</div>
}
