// Rewamp UI 组件移植（https://github.com/palakonweb/Rewamp-UI）
// 原库是 JSX + Tailwind 4 + Framer Motion；这里改写成 TS，颜色全部换成本项目的 CSS 变量，
// 以便浅色/深色主题和原有设计规范（珊瑚红单一强调色）保持一致。每个组件注明来源 slug。
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { Sun, Moon } from '@phosphor-icons/react'

const SPRING = { type: 'spring', stiffness: 420, damping: 30 } as const

/* ───────── floating-dock-navbar：按光标距离放大的浮动坞（竖向版） ───────── */
const DockCtx = createContext<{ y: MotionValue<number>; x: MotionValue<number>; vertical: boolean } | null>(null)
export function Dock({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  const x = useMotionValue(Infinity), y = useMotionValue(Infinity)
  const [vertical, setVertical] = useState(() => typeof matchMedia === 'undefined' || !matchMedia('(max-width: 700px)').matches)
  useEffect(() => { const m = matchMedia('(max-width: 700px)'); const f = () => setVertical(!m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return (
    <DockCtx.Provider value={{ x, y, vertical }}>
      <motion.nav className={className} aria-label={label}
        onMouseMove={e => { x.set(e.clientX); y.set(e.clientY) }}
        onMouseLeave={() => { x.set(Infinity); y.set(Infinity) }}>
        {children}
      </motion.nav>
    </DockCtx.Provider>
  )
}
/** 坞里的一个按钮：靠近时放大（只在桌面竖向时），激活时背后有一个滑动的胶囊（morphing-tab-navbar 的 layoutId 气泡） */
export function DockItem({ on, label, onClick, children, badge, className = 'tool' }: { on: boolean; label: string; onClick(): void; children: ReactNode; badge?: ReactNode; className?: string }) {
  const ctx = useContext(DockCtx)!
  const ref = useRef<HTMLButtonElement>(null)
  const reduce = useReducedMotion()
  const dist = useTransform(ctx.vertical ? ctx.y : ctx.x, v => {
    const b = ref.current?.getBoundingClientRect(); if (!b || !isFinite(v)) return 999
    return ctx.vertical ? v - b.top - b.height / 2 : v - b.left - b.width / 2
  })
  const sz = useSpring(useTransform(dist, [-110, 0, 110], [1, ctx.vertical && !reduce ? 1.32 : 1, 1]), { mass: 0.1, stiffness: 180, damping: 14 })
  const [hover, setHover] = useState(false)
  return (
    <motion.button ref={ref} className={className + (on ? ' on' : '')} onClick={onClick} aria-label={label} aria-pressed={on}
      style={{ scale: sz }} whileTap={{ scale: 0.9 }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <AnimatePresence>{on && <motion.span className="dock-bubble" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} transition={SPRING} />}</AnimatePresence>
      <span className="dock-ic">{children}</span>
      {badge}
      <AnimatePresence>
        {hover && !on && ctx.vertical && (
          <motion.span className="dock-tip" role="tooltip"
            initial={{ opacity: 0, x: -6, scale: 0.85 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -6, scale: 0.85 }}
            transition={{ duration: 0.15, delay: 0.12 }}>{label}</motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

/* ───────── magnetic-pill-navbar：滑动的深色胶囊指示器 ───────── */
export function PillIndicator({ id, className = 'pill-ind' }: { id: string; className?: string }) {
  return <motion.span layoutId={id} className={className} transition={SPRING} />
}

/* ───────── kinetic-lens-sidebar：滚轮/拖动的透镜式章节列表 ───────── */
export interface LensItem { key: number; title: string; sub: string; num: string }
export function KineticLens({ items, active, onPick }: { items: LensItem[]; active: number; onPick(key: number): void }) {
  const start = Math.max(0, items.findIndex(i => i.key === active))
  const target = useMotionValue(start)
  const smooth = useSpring(target, { stiffness: 260, damping: 28, mass: 0.65 })
  const [pos, setPos] = useState(start)
  const box = useRef<HTMLDivElement>(null)
  const snap = useRef<number | undefined>(undefined)
  useEffect(() => smooth.on('change', setPos), [smooth])
  useEffect(() => {
    const el = box.current!; const n = items.length
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      target.set(Math.max(0, Math.min(n - 1, target.get() + e.deltaY / 90)))
      clearTimeout(snap.current); snap.current = window.setTimeout(() => target.set(Math.round(target.get())), 140)
    }
    el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel)
  }, [items.length, target])
  const drag = useRef<{ y: number; v: number } | null>(null)
  const focal = Math.round(pos)
  const ROW = 58
  return (
    <div className="lens" ref={box} tabIndex={0} role="listbox" aria-label="章节"
      onKeyDown={e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); target.set(Math.min(items.length - 1, Math.round(target.get()) + 1)) }
        if (e.key === 'ArrowUp') { e.preventDefault(); target.set(Math.max(0, Math.round(target.get()) - 1)) }
        if (e.key === 'Enter') onPick(items[focal].key)
      }}
      onPointerDown={e => { drag.current = { y: e.clientY, v: target.get() } }}
      onPointerMove={e => { if (drag.current && e.buttons) target.set(Math.max(0, Math.min(items.length - 1, drag.current.v - (e.clientY - drag.current.y) / ROW))) }}
      onPointerUp={() => { if (drag.current) target.set(Math.round(target.get())); drag.current = null }}>
      <div className="lens-mask">
        {items.map((it, i) => {
          const d = i - pos, ad = Math.abs(d)
          if (ad > 5.5) return null
          const isF = i === focal
          return (
            <button key={it.key} role="option" aria-selected={it.key === active}
              className={'lens-row' + (isF ? ' focal' : '') + (it.key === active ? ' cur' : '')}
              style={{ transform: `translateY(${d * ROW}px) scale(${Math.max(0.62, 1 - ad * 0.1)})`, opacity: Math.max(0, 1 - ad * 0.2), zIndex: 10 - Math.round(ad) }}
              onMouseEnter={() => { if (!drag.current) target.set(i) }}
              onClick={() => { if (isF) onPick(it.key); else target.set(i) }}>
              <span className="lens-num">{it.num}</span>
              <span className="lens-t">{isF && <motion.i layoutId="lens-dash" className="lens-dash">—</motion.i>}{it.title}</span>
              <span className="lens-sub">{it.sub}</span>
            </button>
          )
        })}
      </div>
      <p className="lens-hint">滚轮 / 拖动挑章节，点中间那章打开</p>
    </div>
  )
}

/* ───────── theme-toggle：带弹簧旋钮的浅色/深色开关 ───────── */
export function ThemeToggle({ dark, onChange }: { dark: boolean; onChange(d: boolean): void }) {
  const reduce = useReducedMotion()
  return (
    <motion.button type="button" role="switch" aria-checked={dark} aria-label={dark ? '切换到浅色' : '切换到深色'}
      className={'tt' + (dark ? ' dark' : '')} onClick={() => onChange(!dark)} whileTap={reduce ? undefined : { scale: 0.94 }}>
      <Sun className="tt-g l" weight="bold" /><Moon className="tt-g r" weight="bold" />
      <motion.span className="tt-knob" animate={{ x: dark ? 28 : 0 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 450, damping: 30, mass: 0.85 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={dark ? 'm' : 's'} initial={{ rotate: -90, opacity: 0, scale: 0.5 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: 90, opacity: 0, scale: 0.5 }} transition={{ duration: 0.22 }}>
            {dark ? <Moon weight="fill" /> : <Sun weight="fill" />}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </motion.button>
  )
}

/* ───────── morph-search-capsule：图标在聚焦时变形成光标，点击有涟漪 ───────── */
export function MorphCapsule({ focused, children, className = 'pill' }: { focused: boolean; children: ReactNode; className?: string }) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])
  return (
    <motion.div className={className + (focused ? ' focus' : '')} animate={{ scale: focused ? 1 : 0.985 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      onPointerDown={e => { const r = e.currentTarget.getBoundingClientRect(); const id = Date.now(); setRipples(s => [...s, { id, x: e.clientX - r.left, y: e.clientY - r.top }]); setTimeout(() => setRipples(s => s.filter(q => q.id !== id)), 650) }}>
      <svg className="mc-ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <motion.g animate={{ opacity: focused ? 0 : 1, scale: focused ? 0.4 : 1, rotate: focused ? -45 : 0 }} transition={{ type: 'spring', stiffness: 380, damping: 26 }} style={{ originX: '12px', originY: '12px' }}>
          <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" fill="currentColor" />
        </motion.g>
        <motion.line x1="12" x2="12" y1="5" y2="19" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"
          initial={false} animate={focused ? { pathLength: 1, opacity: [1, 1, 0, 0, 1] } : { pathLength: 0, opacity: 0 }}
          transition={focused ? { pathLength: { type: 'spring', stiffness: 300, damping: 24 }, opacity: { duration: 1.1, repeat: Infinity, times: [0, .45, .5, .95, 1] } } : { duration: 0.15 }} />
      </svg>
      {children}
      <span className="mc-rip" aria-hidden>
        {ripples.map(r => <motion.i key={r.id} style={{ left: r.x, top: r.y }} initial={{ scale: 0, opacity: 0.35 }} animate={{ scale: 14, opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} />)}
      </span>
    </motion.div>
  )
}

/* ───────── word-by-word-text：逐词模糊上浮 ───────── */
export function WordReveal({ text, className, step = 0.05 }: { text: string; className?: string; step?: number }) {
  // 中文按字、英文按词切分
  const parts = text.match(/[A-Za-z0-9'’]+|\s+|[^\sA-Za-z0-9]/g) ?? []
  let k = 0
  return (
    <p className={className}>
      {parts.map((s, i) => /^\s+$/.test(s) ? s : (
        <motion.span key={i} style={{ display: 'inline-block' }}
          initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: Math.min(k++ * step, 1.6), duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}>{s}</motion.span>
      ))}
    </p>
  )
}
/** 新出现的块：模糊上浮进入（AI 消息用） */
export function BlurIn({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}>{children}</motion.div>
}

/* ───────── skeleton：带扫光的占位块 ───────── */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={'sk ' + className} style={style}><i /></div>
}
export function PageSkeleton() {
  const w = [92, 100, 97, 88, 100, 95, 60, 0, 100, 94, 98, 90, 72, 0, 99, 93, 85]
  return (
    <div className="page-sk" aria-label="正在加载" role="status">
      <Skeleton className="sk-num" />
      {w.map((x, i) => x ? <Skeleton key={i} className="sk-line" style={{ width: x + '%' }} /> : <div key={i} style={{ height: 18 }} />)}
    </div>
  )
}

/* ───────── shimmer-button：周期性扫光的按钮 ───────── */
export function ShimmerButton({ children, className = 'btn primary', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [burst, setBurst] = useState(0)
  return (
    <motion.button {...(rest as object)} className={className + ' shimmer'} whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
      onClick={e => { setBurst(b => b + 1); rest.onClick?.(e) }}>
      <motion.i key={burst} className="shimmer-streak" aria-hidden initial={{ left: '-30%' }} animate={{ left: '130%' }}
        transition={{ duration: burst ? 0.4 : 0.9, ease: 'easeInOut', repeat: Infinity, repeatDelay: 2.2 }} />
      <span className="shimmer-label">{children}</span>
    </motion.button>
  )
}

/* ───────── liquid-underline-navbar：手绘感波浪下划线（SVG 描线） ───────── */
export function LiquidLine({ on, className = 'liquid' }: { on: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
      <motion.path d="M 0,5 Q 25,0 50,5 T 100,5" fill="none" strokeWidth="2.2" strokeLinecap="round" vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={{ duration: 0.35, ease: 'easeOut' }} />
    </svg>
  )
}

/* ───────── folder-tab-card：带文件夹标签缺口的卡片 ───────── */
export function FolderCard({ tab, tabAside, children, className = '' }: { tab: ReactNode; tabAside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <motion.div className={'folder ' + className} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
      <div className="folder-tabrow"><span className="folder-tab">{tab}</span>{tabAside}</div>
      <div className="folder-sheet">{children}</div>
    </motion.div>
  )
}

/* ───────── perspective-flip-deck：翻页时一张纸绕书脊转开 ───────── */
export function PageFlip({ turn }: { turn: { n: number; dir: 1 | -1 } }) {
  const reduce = useReducedMotion()
  if (reduce || !turn.n) return null
  const fwd = turn.dir === 1
  return (
    <motion.div key={turn.n} className="flip-sheet" aria-hidden
      style={{ transformOrigin: fwd ? '0% 50%' : '100% 50%' }}
      initial={{ rotateY: fwd ? -2 : 2, opacity: 0.0 }}
      animate={{ rotateY: fwd ? -85 : 85, opacity: [0, 0.9, 0] }}
      transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1], opacity: { times: [0, 0.25, 1], duration: 0.55 } }} />
  )
}
