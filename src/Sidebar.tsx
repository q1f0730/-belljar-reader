import type { Highlight, Mode, Prefs, Toc } from './types'

export type Panel = 'toc' | 'tr' | 'marks' | 'set' | null
interface Props {
  panel: Panel; setPanel(p: Panel): void
  mode: Mode; baseZh: boolean; setMode(m: Mode): void; toggleFull(): void
  toc: Toc | null; ch: number; goCh(n: number): void
  hls: Highlight[]; goHl(h: Highlight): void; delHl(id: string): void; noteHl(id: string, note: string): void
  prefs: Prefs; setPrefs(p: Prefs): void; persisted: boolean
  onExport(): void; onImport(f: File): void
}

const MODES: { k: 'word' | 'sentence' | 'full'; ch: string; t: string; d: string }[] = [
  { k: 'word', ch: '词', t: '单词翻译', d: '悬停预选，再点出气泡' },
  { k: 'sentence', ch: '句', t: '逐句翻译', d: '点一句，换成中文；再点换回' },
  { k: 'full', ch: '全', t: '全文翻译', d: '整本一键切换中英' },
]

export function Sidebar(p: Props) {
  const tog = (x: Panel) => p.setPanel(p.panel === x ? null : x)
  const cur = p.mode === 'word' ? '词' : '句'
  return (
    <>
      <nav className="rail">
        <div className="mark" title="The Bell Jar">
          <svg viewBox="0 0 32 40" width="22" height="28" aria-hidden><path d="M6 34V18a10 10 0 0 1 20 0v16" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M3 34h26M3 37h26" stroke="currentColor" strokeWidth="1.6"/><circle cx="16" cy="6" r="2" fill="currentColor"/></svg>
        </div>
        <RailBtn on={p.panel === 'toc'} label="目录" glyph="目" onClick={() => tog('toc')} />
        <RailBtn on={p.panel === 'tr'} label="翻译" glyph="译" badge={p.baseZh ? '全' : cur} onClick={() => tog('tr')} />
        <RailBtn on={p.panel === 'marks'} label="划线" glyph="划" badge={p.hls.length ? String(p.hls.length) : undefined} onClick={() => tog('marks')} />
        <div className="rail-fill" />
        <RailBtn on={p.panel === 'set'} label="设置" glyph="设" onClick={() => tog('set')} />
      </nav>

      {p.panel === 'tr' && (
        <div className="flyout tr" role="menu">
          {MODES.map((m, i) => {
            const on = m.k === 'full' ? p.baseZh : !p.baseZh && p.mode === m.k
            const half = m.k !== 'full' && p.baseZh && p.mode === m.k
            return (
              <button key={m.k} className={'tri' + (on ? ' on' : '') + (half ? ' half' : '')} style={{ animationDelay: `${i * 45}ms` }}
                onClick={() => (m.k === 'full' ? p.toggleFull() : p.setMode(m.k))}>
                <span className="tri-ch">{m.ch}</span>
                <span className="tri-t">{m.k === 'full' ? (p.baseZh ? '全文 · 中文中' : '全文翻译') : m.t}</span>
                <span className="tri-d">{m.d}</span>
              </button>
            )
          })}
        </div>
      )}

      {p.panel === 'toc' && p.toc && (
        <aside className="drawer">
          <h3>{p.toc.title}<small>{p.toc.author}</small></h3>
          <ol className="toc">
            {p.toc.chapters.map(c => (
              <li key={c.n} className={c.n === p.ch ? 'on' : ''}>
                <button onClick={() => p.goCh(c.n)}><b>{String(c.n).padStart(2, '0')}</b><span>{c.en}</span><i>{c.zh}</i></button>
              </li>
            ))}
          </ol>
        </aside>
      )}

      {p.panel === 'marks' && (
        <aside className="drawer">
          <h3>划线<small>{p.hls.length} 条</small></h3>
          {!p.hls.length && <p className="empty">选中一段文字，就能划线。英文、中文都可以。</p>}
          <ul className="marks">
            {[...p.hls].sort((a, b) => a.ch - b.ch || a.created - b.created).map(h => (
              <li key={h.id} style={{ ['--c' as string]: h.color }}>
                <button className="mk-go" onClick={() => p.goHl(h)}>
                  <span className="mk-meta">第 {h.ch} 章 · {h.lang === 'en' ? 'EN' : '中'}</span>
                  <span className={'mk-text ' + h.lang}>{h.text}</span>
                </button>
                <textarea placeholder="写点想法…" defaultValue={h.note} onBlur={e => p.noteHl(h.id, e.target.value)} rows={1} />
                <button className="mk-del" onClick={() => p.delHl(h.id)} title="删除">×</button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {p.panel === 'set' && (
        <aside className="drawer">
          <h3>设置</h3>
          <label className="row">字号<input type="range" min={15} max={26} value={p.prefs.fontSize}
            onChange={e => p.setPrefs({ ...p.prefs, fontSize: +e.target.value })} /><span>{p.prefs.fontSize}</span></label>
          <div className="row">纸色
            <div className="seg">
              {(['paper', 'night'] as const).map(t => <button key={t} className={p.prefs.theme === t ? 'on' : ''} onClick={() => p.setPrefs({ ...p.prefs, theme: t })}>{t === 'paper' ? '纸' : '夜'}</button>)}
            </div>
          </div>
          <div className="row">版面
            <div className="seg">
              {(['auto', 'single'] as const).map(t => <button key={t} className={p.prefs.spread === t ? 'on' : ''} onClick={() => p.setPrefs({ ...p.prefs, spread: t })}>{t === 'auto' ? '自动双页' : '单页'}</button>)}
            </div>
          </div>
          <hr />
          <p className="note">进度、划线和笔记存在这台设备的浏览器里，刷新、关闭、重启都不会丢。{p.persisted ? '已获得持久存储，浏览器不会自动清理。' : '浏览器暂未授予持久存储，建议定期导出备份。'}</p>
          <div className="row btns">
            <button onClick={p.onExport}>导出备份</button>
            <label className="file">导入备份<input type="file" accept="application/json" onChange={e => e.target.files?.[0] && p.onImport(e.target.files[0])} /></label>
          </div>
        </aside>
      )}
    </>
  )
}

function RailBtn({ on, label, glyph, badge, onClick }: { on: boolean; label: string; glyph: string; badge?: string; onClick(): void }) {
  return (
    <button className={'rail-btn' + (on ? ' on' : '')} onClick={onClick} title={label} aria-label={label}>
      <span className="glyph">{glyph}</span>
      {badge && <span className="badge">{badge}</span>}
    </button>
  )
}
