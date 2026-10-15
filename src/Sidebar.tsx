import { BookOpenText, Translate, Highlighter, GearSix, X, DownloadSimple, UploadSimple, Sun, Moon } from '@phosphor-icons/react'
import type { Highlight, Mode, Prefs, Toc } from './types'

export type Panel = 'toc' | 'tr' | 'marks' | 'set' | null
interface Props {
  panel: Panel; setPanel(p: Panel): void; trOn: boolean; toggleTr(): void
  mode: Mode; baseZh: boolean; setMode(m: Mode): void; toggleFull(): void
  toc: Toc | null; ch: number; goCh(n: number): void
  hls: Highlight[]; goHl(h: Highlight): void; delHl(id: string): void; noteHl(id: string, note: string): void
  prefs: Prefs; setPrefs(p: Prefs): void; persisted: boolean
  onExport(): void; onImport(f: File): void
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
      <nav className="tools" aria-label="工具">
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
                  <span className="sub-ch">{m.ch}</span>
                  <span className="tip"><b>{m.k === 'full' && p.baseZh ? '切回英文' : m.t}</b>{off ? '全文中文时不可用' : m.d}</span>
                </button>
              )
            })}
          </div>
        </div>
        <Tool on={p.panel === 'marks'} label="划线与笔记" onClick={() => tog('marks')} count={p.hls.length}><Highlighter weight="bold" /></Tool>
        <i className="tools-sep" />
        <Tool on={p.panel === 'set'} label="设置" onClick={() => tog('set')}><GearSix weight="bold" /></Tool>
      </nav>

      {p.panel === 'toc' && p.toc && (
        <Sheet title={p.toc.title} sub={p.toc.author} onClose={() => p.setPanel(null)}>
          <ol className="toc">
            {p.toc.chapters.map((c, i) => (
              <li key={c.n} className={c.n === p.ch ? 'on' : ''} style={{ ['--i' as string]: i }}>
                <button onClick={() => p.goCh(c.n)}><b>{String(c.n).padStart(2, '0')}</b><span>{c.en}</span><i>{c.zh}</i></button>
              </li>
            ))}
          </ol>
        </Sheet>
      )}

      {p.panel === 'marks' && (
        <Sheet title="划线" sub={`${p.hls.length} 条`} onClose={() => p.setPanel(null)}>
          {!p.hls.length && (
            <div className="empty">
              <span className="empty-mark"><span className="hl" style={{ ['--c' as string]: '#F5D77A' }}>选中一段文字</span></span>
              <p>英文、中文都能划。句子换成另一种语言时，划线会收成一个小点。</p>
            </div>
          )}
          <ul className="marks">
            {[...p.hls].sort((a, b) => a.ch - b.ch || a.created - b.created).map((h, i) => (
              <li key={h.id} style={{ ['--c' as string]: h.color, ['--i' as string]: i }}>
                <button className="mk-go" onClick={() => p.goHl(h)}>
                  <span className="mk-meta"><i />CH {String(h.ch).padStart(2, '0')} · {h.lang === 'en' ? 'EN' : '中'}</span>
                  <span className={'mk-text ' + h.lang}>{h.text}</span>
                </button>
                <textarea placeholder="写点想法…" defaultValue={h.note} onBlur={e => p.noteHl(h.id, e.target.value)} rows={1} />
                <button className="mk-del" onClick={() => p.delHl(h.id)} aria-label="删除"><X weight="bold" /></button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {p.panel === 'set' && (
        <Sheet title="设置" onClose={() => p.setPanel(null)}>
          <div className="field">
            <label>字号 <span className="mono">{p.prefs.fontSize}px</span></label>
            <input type="range" min={15} max={26} value={p.prefs.fontSize} onChange={e => p.setPrefs({ ...p.prefs, fontSize: +e.target.value })} />
          </div>
          <div className="field">
            <label>外观</label>
            <div className="seg">
              <button className={p.prefs.theme === 'paper' ? 'on' : ''} onClick={() => p.setPrefs({ ...p.prefs, theme: 'paper' })}><Sun weight="bold" />浅色</button>
              <button className={p.prefs.theme === 'night' ? 'on' : ''} onClick={() => p.setPrefs({ ...p.prefs, theme: 'night' })}><Moon weight="bold" />深色</button>
            </div>
          </div>
          <div className="field">
            <label>版面</label>
            <div className="seg">
              {(['auto', 'single'] as const).map(t => <button key={t} className={p.prefs.spread === t ? 'on' : ''} onClick={() => p.setPrefs({ ...p.prefs, spread: t })}>{t === 'auto' ? '自动双栏' : '单栏'}</button>)}
            </div>
          </div>
          <div className="field">
            <label>本机数据</label>
            <p className="note">进度、划线和笔记存在这台设备的浏览器里。{p.persisted ? '已获得持久存储。' : '浏览器暂未授予持久存储，建议定期导出备份。'}</p>
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
    <button className={'tool' + (on ? ' on' : '')} onClick={onClick} aria-label={label} aria-pressed={on}>
      {children}
      {!!count && <span className="count">{count}</span>}
      {dot && !on && <span className="live" />}
      <span className="tip side">{label}</span>
    </button>
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
