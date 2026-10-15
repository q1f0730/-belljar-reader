import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { Chapter, Highlight, Lang, Mode } from './types'
import { UnitView } from './Unit'

export interface ReaderHandle { next(): void; prev(): void; goUnit(u: string): void }
interface Props {
  chapter: Chapter; langOf: (u: string) => Lang; mode: Mode
  glosses: Map<string, string>; active: string | null; hls: Highlight[]
  fontSize: number; single: boolean; layoutKey: string
  startAt: { unit?: string; end?: boolean }
  onEdge(dir: 1 | -1): void
  onPage(info: { page: number; pages: number; unit: string | null }): void
  onClick(e: React.MouseEvent): void
  onMouseUp(e: React.MouseEvent): void
}

const GAP = 72

export const Reader = forwardRef<ReaderHandle, Props>(function Reader(p, ref) {
  const vp = useRef<HTMLDivElement>(null)
  const flow = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 0, h: 0 })
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const anchor = useRef<string | null>(null)
  const laid = useRef(0) // 已完成分页的章节号；未分页前不响应翻页，避免连跳章节
  const pending = useRef<{ unit?: string; end?: boolean } | null>(p.startAt)
  const cols = p.single || dim.w < 860 ? 1 : 2
  const step = dim.w + GAP

  useEffect(() => { pending.current = p.startAt }, [p.chapter.n, p.startAt])

  useLayoutEffect(() => {
    const el = vp.current!; const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect(); setDim({ w: Math.floor(r.width), h: Math.floor(r.height) })
    }); ro.observe(el); return () => ro.disconnect()
  }, [])

  const firstVisible = useCallback(() => {
    const v = vp.current!.getBoundingClientRect()
    for (const u of flow.current!.querySelectorAll<HTMLElement>('.unit')) {
      for (const r of u.getClientRects()) if (r.right > v.left + 2 && r.left < v.right - 2 && r.bottom > v.top && r.top < v.bottom) return u.dataset.u!
    }
    return null
  }, [])

  const pageOf = useCallback((u: string) => {
    const el = flow.current!.querySelector<HTMLElement>(`.unit[data-u="${u}"]`); if (!el) return null
    const fr = flow.current!.getBoundingClientRect(); const rects = el.getClientRects()
    const r = rects[0] || el.getBoundingClientRect()
    return Math.max(0, Math.floor((r.left - fr.left + 4) / step))
  }, [step])

  // 内容或尺寸变化后重新分页，并保持当前句子所在的页
  useLayoutEffect(() => {
    if (!dim.w || !flow.current) return
    const total = Math.max(1, Math.round((flow.current.scrollWidth + GAP) / step))
    setPages(total)
    laid.current = p.chapter.n
    let target: number | null = null
    const pend = pending.current
    if (pend) {
      if (pend.end) target = total - 1
      else if (pend.unit) target = pageOf(pend.unit)
      else target = 0
      pending.current = null
    } else if (anchor.current) target = pageOf(anchor.current)
    if (target !== null) setPage(Math.min(total - 1, target))
    else setPage(pg => Math.min(total - 1, pg))
  }, [dim.w, dim.h, p.chapter, p.layoutKey, p.fontSize, cols, step, pageOf])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const u = firstVisible(); anchor.current = u
      p.onPage({ page, pages, unit: u })
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pages, p.chapter])

  const next = useCallback(() => { if (laid.current !== p.chapter.n) return; if (page < pages - 1) { anchor.current = null; setPage(page + 1) } else p.onEdge(1) }, [page, pages, p])
  const prev = useCallback(() => { if (laid.current !== p.chapter.n) return; if (page > 0) { anchor.current = null; setPage(page - 1) } else p.onEdge(-1) }, [page, p])
  useImperativeHandle(ref, () => ({
    next, prev,
    goUnit(u) { const t = pageOf(u); if (t !== null) setPage(t) },
  }), [next, prev, pageOf])

  const touch = useRef<{ x: number; y: number } | null>(null)
  return (
    <div className="stage">
      <button className="edge left" aria-label="上一页" onClick={prev} />
      <div className="viewport" ref={vp}
        onScroll={e => { e.currentTarget.scrollLeft = 0; e.currentTarget.scrollTop = 0 }}
        onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          const t = touch.current; if (!t) return; const dx = e.changedTouches[0].clientX - t.x
          if (Math.abs(dx) > 60 && Math.abs(e.changedTouches[0].clientY - t.y) < 60 && !getSelection()?.toString()) dx < 0 ? next() : prev()
        }}>
        <div ref={flow} className={`flow mode-${p.mode}`} onClick={p.onClick} onMouseUp={p.onMouseUp}
          style={{
            width: dim.w, height: dim.h, columnCount: cols, columnGap: GAP,
            transform: `translateX(${-page * step}px)`, fontSize: p.fontSize,
          }}>
          <h2 className="ch-title"><span className="ch-num">{String(p.chapter.n).padStart(2, '0')}</span></h2>
          {p.chapter.paras.map((para, i) => (
            <p key={i} className={i === 0 ? 'first' : undefined}>
              {para.u.map((u, k) => (
                <span key={u.id}>
                  {k > 0 && p.langOf(u.id) === 'en' && p.langOf(para.u[k - 1].id) === 'en' ? ' ' : ''}
                  <UnitView unit={u} lang={p.langOf(u.id)} glosses={p.glosses} hls={p.hls} active={p.active} />
                </span>
              ))}
              {para.fn?.length ? <sup className="fn" data-fn={para.fn.join('\n')} title="译注">注</sup> : null}
            </p>
          ))}
          <div className="ch-end"><i /></div>
        </div>
      </div>
      <button className="edge right" aria-label="下一页" onClick={next} />
    </div>
  )
})
