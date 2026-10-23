import { BookOpenText, Translate, Highlighter, GearSix, X, DownloadSimple, UploadSimple, NotePencil, Sparkle, UserCircle, SignOut, CloudCheck, CloudArrowUp, CloudWarning } from '@phosphor-icons/react'
import type { Highlight, Mode, Prefs, Toc } from './types'
import type { User } from './account'
import type { Side } from './SidePanel'
import { Dock, DockItem, PillIndicator, KineticLens, ThemeToggle, ShimmerButton, FolderCard } from './rw'
import { AnimatePresence } from 'framer-motion'

export type Panel = 'toc' | 'tr' | 'marks' | 'set' | null
interface Props {
  panel: Panel; setPanel(p: Panel): void; trOn: boolean; toggleTr(): void
  mode: Mode; baseZh: boolean; setMode(m: Mode): void; toggleFull(): void
  toc: Toc | null; ch: number; goCh(n: number): void
  hls: Highlight[]; goHl(h: Highlight): void; delHl(id: string): void; noteHl(id: string, note: string): void
  prefs: Prefs; setPrefs(p: Prefs): void; persisted: boolean
  onExport(): void; onImport(f: File): void
  side: Side; setSide(s: Side): void; user: User | null; syncState: 'idle' | 'saving' | 'error'; onAccount(): void; onLogout(): void
}

const MODES: { k: 'word' | 'sentence' | 'full'; ch: string; t: string; d: string }[] = [
  { k: 'word', ch: '词', t: '单词翻译', d: '点单词，上方出释义' },
  { k: 'sentence', ch: '句', t: '逐句翻译', d: '点一句，换成中文' },
  { k: 'full', ch: '全', t: '全文翻译', d: '整本一键切换中英' },
]

export function Sidebar(p: Props) {
  const tog = (x: Panel) => p.setPanel(p.panel === x ? null : x)
  const trOn = p.panel === 'tr' // 子菜单是否展开
  return (
    <>
      <Dock className="tools" label="工具">
        <Tool on={p.panel === 'toc'} label="目录" onClick={() => tog('toc')}><BookOpenText weight="bold" /></Tool>
        <div className="tool-wrap">
          <Tool on={p.trOn} label={p.trOn ? '翻译（再点关闭）' : '翻译'} onClick={p.toggleTr}><Translate weight="bold" /></Tool>
          <div className={'sub' + (trOn ? ' open' : '')} role="menu" aria-hidden={!trOn}>
            {MODES.map((m, i) => {
              // 全文中文时：词 灰掉不可用，句 自动生效
              const off = m.k === 'word' && p.baseZh
              const on = m.k === 'full' ? p.baseZh : p.trOn && (p.baseZh ? m.k === 'sentence' : p.mode === m.k)
              return (
                <button key={m.k} role="menuitemradio" aria-checked={on} tabIndex={trOn ? 0 : -1}
                  disabled={off} aria-disabled={off}
                  className={'sub-btn' + (on ? ' on' : '') + (off ? ' off' : '')} style={{ ['--i' as string]: i }}
                  onClick={() => (m.k === 'full' ? p.toggleFull() : p.setMode(m.k))}>
                  {on && <PillIndicator id="mode-pill" />}
                  <span className="sub-ch">{m.ch}</span>
                  <span className="tip"><b>{m.k === 'full' && p.baseZh ? '切回英文' : m.t}</b>{off ? '全文中文时不可用' : m.d}</span>
                </button>
              )
            })}
          </div>
        </div>
        <Tool on={p.panel === 'marks'} label="划线与笔记" onClick={() => tog('marks')} count={p.hls.length}><Highlighter weight="bold" /></Tool>
        <Tool on={p.side === 'notes'} label="笔记" onClick={() => p.setSide(p.side === 'notes' ? null : 'notes')}><NotePencil weight="bold" /></Tool>
        <Tool on={p.side === 'ai'} label="AI 对话" onClick={() => p.setSide(p.side === 'ai' ? null : 'ai')}><Sparkle weight="bold" /></Tool>
        <i className="tools-sep" />
        <Tool on={p.panel === 'set'} label="设置" onClick={() => tog('set')}><GearSix weight="bold" /></Tool>
        <Tool on={false} label={p.user ? `账号：${p.user.name}` : '登录 / 注册'} onClick={p.onAccount} dot={!p.user}>
          {p.user ? <span className="avatar">{p.user.name.slice(0, 1).toUpperCase()}</span> : <UserCircle weight="bold" />}
        </Tool>
      </Dock>

      {p.panel === 'toc' && p.toc && (
        <Sheet title={p.toc.title} sub={p.toc.author} onClose={() => p.setPanel(null)}>
          <KineticLens active={p.ch} onPick={p.goCh}
            items={p.toc.chapters.map(c => ({ key: c.n, num: String(c.n).padStart(2, '0'), title: c.en, sub: c.zh }))} />
        </Sheet>
      )}

      {p.panel === 'marks' && (
        <Sheet title="划线" sub={`${p.hls.length} 条`} onClose={() => p.setPanel(null)}>
          {!p.user && <div className="empty"><p>登录后才能划线。</p><ShimmerButton onClick={p.onAccount}>登录 / 注册</ShimmerButton></div>}
          {p.user && !p.hls.length && (
            <div className="empty">
              <span className="empty-mark"><span className="hl" style={{ ['--c' as string]: '#F5D77A' }}>选中一段文字</span></span>
              <p>英文、中文都能划。句子换成另一种语言时，划线会收成一个小点。</p>
            </div>
          )}
          <div className="marks">
            <AnimatePresence initial={false}>
              {[...p.hls].sort((a, b) => a.ch - b.ch || a.created - b.created).map(h => (
                <FolderCard key={h.id} className="mk" tab={<><i style={{ background: h.color }} />CH {String(h.ch).padStart(2, '0')} · {h.lang === 'en' ? 'EN' : '中'}</>}
                  tabAside={<button className="mk-del" onClick={() => p.delHl(h.id)} aria-label="删除"><X weight="bold" /></button>}>
                  <button className="mk-go" onClick={() => p.goHl(h)} style={{ ['--c' as string]: h.color }}>
                    <span className={'mk-text ' + h.lang}>{h.text}</span>
                  </button>
                  <textarea placeholder="写点想法…" defaultValue={h.note} onBlur={e => p.noteHl(h.id, e.target.value)} rows={1} />
                </FolderCard>
              ))}
            </AnimatePresence>
          </div>
        </Sheet>
      )}

      {p.panel === 'set' && (
        <Sheet title="设置" onClose={() => p.setPanel(null)}>
          <div className="field">
            <label>字号 <span className="mono">{p.prefs.fontSize}px</span></label>
            <input type="range" min={15} max={26} value={p.prefs.fontSize} onChange={e => p.setPrefs({ ...p.prefs, fontSize: +e.target.value })} />
          </div>
          <div className="field">
            <label>外观 <span className="mono">{p.prefs.theme === 'night' ? '深色' : '浅色'}</span></label>
            <ThemeToggle dark={p.prefs.theme === 'night'} onChange={d => p.setPrefs({ ...p.prefs, theme: d ? 'night' : 'paper' })} />
          </div>
          <div className="field">
            <label>版面</label>
            <div className="seg">
              {(['auto', 'single'] as const).map(t => <button key={t} className={p.prefs.spread === t ? 'on' : ''} onClick={() => p.setPrefs({ ...p.prefs, spread: t })}>{p.prefs.spread === t && <PillIndicator id="spread-pill" className="seg-ind" />}<span>{t === 'auto' ? '自动双栏' : '单栏'}</span></button>)}
            </div>
          </div>
          <div className="field">
            <label>账号</label>
            {p.user ? (
              <>
                <p className="note acct">
                  <span className="avatar">{p.user.name.slice(0, 1).toUpperCase()}</span><b>{p.user.name}</b>
                  <span className={'sync ' + p.syncState}>{p.syncState === 'saving' ? <><CloudArrowUp weight="bold" />同步中</> : p.syncState === 'error' ? <><CloudWarning weight="bold" />同步失败，稍后自动重试</> : <><CloudCheck weight="bold" />已同步</>}</span>
                </p>
                <div className="btn-row"><button className="btn" onClick={p.onLogout}><SignOut weight="bold" />退出登录</button></div>
              </>
            ) : (
              <>
                <p className="note">登录后可以划线、写笔记、和 AI 讨论，数据自动同步，只有你自己看得到。</p>
                <div className="btn-row"><ShimmerButton onClick={p.onAccount}><UserCircle weight="bold" />登录 / 注册</ShimmerButton></div>
              </>
            )}
          </div>
          <div className="field">
            <label>本机数据</label>
            <p className="note">阅读进度和设置存在这台设备的浏览器里{p.user ? '，划线、笔记和对话另外同步到账号' : ''}。{p.persisted ? '已获得持久存储。' : '建议定期导出备份。'}</p>
            <div className="btn-row">
              <button className="btn" onClick={p.onExport}><DownloadSimple weight="bold" />导出备份</button>
              <label className="btn">
                <UploadSimple weight="bold" />导入备份
                <input type="file" accept="application/json" onChange={e => e.target.files?.[0] && p.onImport(e.target.files[0])} />
              </label>
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}

function Tool({ on, label, onClick, children, count, dot }: { on: boolean; label: string; onClick(): void; children: React.ReactNode; count?: number; dot?: boolean }) {
  return (
    <DockItem on={on} label={label} onClick={onClick}
      badge={<>{!!count && <span className="count">{count}</span>}{dot && !on && <span className="live" />}</>}>
      {children}
    </DockItem>
  )
}

function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose(): void; children: React.ReactNode }) {
  return (
    <aside className="sheet">
      <header>
        <h3>{title}</h3>
        {sub && <small>{sub}</small>}
        <button className="icon-btn" onClick={onClose} aria-label="关闭"><X weight="bold" /></button>
      </header>
      <div className="sheet-body">{children}</div>
    </aside>
  )
}
