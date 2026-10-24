import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, BookBookmark, BookOpenText, BookmarkSimple, Check, MagnifyingGlass, NotePencil, ShieldCheck, X } from '@phosphor-icons/react'
import App from './App'
import { BOOKS, readPath, type Book, type ReadingProgress, type ReadingSummary } from './library'
import { createBookStore } from './book-store'
import './library.css'

function currentId() { return new URLSearchParams(location.search).get('book') }

export default function LibraryApp() {
  const [selected, setSelected] = useState<string | null>(currentId)
  useEffect(() => {
    const handle = () => setSelected(currentId())
    addEventListener('popstate', handle)
    return () => removeEventListener('popstate', handle)
  }, [])
  const book = BOOKS.find(b => b.id === selected)
  useEffect(() => {
    document.title = book ? `${book.title} · 阅间` : '阅间 · 我的书库'
    if (!book) document.documentElement.dataset.theme = 'paper'
  }, [book])
  const navigate = (id: string | null) => {
    history.pushState({}, '', id ? readPath(id) : '/')
    setSelected(id)
    window.scrollTo(0, 0)
  }
  if (book) return <App key={book.id} book={book} onBack={() => navigate(null)} />
  if (selected) return <div className="library not-found"><BookOpenText size={44} /><h1>这本书还没有加入书库</h1><button className="lib-primary" onClick={() => navigate(null)}><ArrowLeft />返回书库</button></div>
  return <Shelf key="shelf" open={id => navigate(id)} />
}

function Shelf({ open }: { open(id: string): void }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'reading' | 'new'>('all')
  const [sort, setSort] = useState<'recent' | 'title'>('recent')
  const [summaries, setSummaries] = useState<Record<string, ReadingSummary>>({})
  useEffect(() => {
    let active = true
    Promise.all(BOOKS.map(async book => {
      const store = createBookStore(book.id)
      const [progress, notes, highlights] = await Promise.all([store.get<ReadingProgress>('progress'), store.get<unknown[]>('notes'), store.get<unknown[]>('highlights')])
      return [book.id, { progress, notes: notes?.length || 0, highlights: highlights?.length || 0 }] as const
    })).then(results => { if (active) setSummaries(Object.fromEntries(results)) }).catch(() => {})
    return () => { active = false }
  }, [])
  const readingCount = BOOKS.filter(b => summaries[b.id]?.progress).length
  const totalNotes = Object.values(summaries).reduce((sum, value) => sum + value.notes + value.highlights, 0)
  const recent = [...BOOKS].filter(b => summaries[b.id]?.progress).sort((a, b) => (summaries[b.id]?.progress?.updated || 0) - (summaries[a.id]?.progress?.updated || 0))[0]
  const visible = useMemo(() => BOOKS.filter(book => {
    const match = `${book.title} ${book.englishTitle} ${book.author} ${book.originalAuthor}`.toLowerCase().includes(search.trim().toLowerCase())
    const started = !!summaries[book.id]?.progress
    return match && (filter === 'all' || (filter === 'reading' ? started : !started))
  }).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : (summaries[b.id]?.progress?.updated || Date.parse(b.addedAt)) - (summaries[a.id]?.progress?.updated || Date.parse(a.addedAt))), [search, filter, sort, summaries])
  return (
    <div className="library">
      <nav className="tools library-rail" aria-label="书库工具">
        <button className={'tool' + (filter === 'all' ? ' on' : '')} aria-label="查看全部藏书" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}><BookBookmark weight="bold" /><span className="tip side">全部藏书</span></button>
        <button className={'tool' + (filter === 'reading' ? ' on' : '')} aria-label="查看正在读的书" aria-pressed={filter === 'reading'} onClick={() => setFilter('reading')}><BookOpenText weight="bold" /><span className="tip side">正在读</span></button>
        <button className={'tool' + (filter === 'new' ? ' on' : '')} aria-label="查看未开始的书" aria-pressed={filter === 'new'} onClick={() => setFilter('new')}><BookmarkSimple weight="bold" /><span className="tip side">未开始</span></button>
      </nav>
      <div className="library-sheet">
      <header className="lib-header">
        <a href="/" className="lib-brand" aria-label="阅间书库首页"><span><BookBookmark weight="duotone" size={24} /></span>阅间<i>BETWEEN PAGES</i></a>
        <span className="lib-header-note"><ShieldCheck size={16} />阅读记录保存在本机</span>
      </header>
      <main className="lib-main">
        <section className="lib-intro" aria-labelledby="shelf-title">
          <div><p className="lib-eyebrow">READING LIBRARY</p><h1 id="shelf-title">我的书库<span>{String(BOOKS.length).padStart(2, '0')}</span></h1><p className="lib-intro-copy">阅读、翻译、笔记，都从这里开始。</p></div>
          <div className="lib-stats"><div><b>{BOOKS.length}</b><span>本藏书</span></div><i /><div><b>{readingCount}</b><span>本在读</span></div><i /><div><b>{totalNotes}</b><span>条阅读记录</span></div></div>
        </section>

        {recent && <section className="lib-resume" aria-label="继续上次阅读"><div className="resume-icon"><BookOpenText weight="duotone" size={25} /></div><div><p>上次读到这里</p><h2>{recent.title}<span>第 {summaries[recent.id]?.progress?.ch} 章</span></h2></div><button onClick={() => open(recent.id)}>继续阅读<ArrowRight weight="bold" /></button></section>}

        <section className="lib-collection" aria-label="藏书">
          <div className="lib-toolbar">
            <div className="lib-tabs" aria-label="筛选藏书">{([{ id: 'all', title: '全部藏书' }, { id: 'reading', title: '正在读' }, { id: 'new', title: '未开始' }] as const).map(tab => <button key={tab.id} className={filter === tab.id ? 'active' : ''} aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>{tab.title}{tab.id === 'all' && <span>{BOOKS.length}</span>}</button>)}</div>
            <div className="lib-find"><label className="lib-search"><MagnifyingGlass size={18} /><input aria-label="搜索书名或作者" placeholder="搜索书名或作者" value={search} onChange={e => setSearch(e.target.value)} />{search && <button aria-label="清空搜索" onClick={() => setSearch('')}><X size={15} /></button>}</label><select aria-label="藏书排序" value={sort} onChange={e => setSort(e.target.value as 'recent' | 'title')}><option value="recent">最近阅读</option><option value="title">书名排序</option></select></div>
          </div>
          {visible.length ? <div className="lib-grid">{visible.map(book => <BookCard key={book.id} book={book} summary={summaries[book.id]} open={() => open(book.id)} />)}</div> : <div className="lib-empty"><BookOpenText size={38} weight="duotone" /><h2>{search ? '没有找到这本书' : filter === 'reading' ? '还没有开始阅读' : '这些书都已经开始读了'}</h2><p>{search ? '试试书名、英文名或作者。' : '每一次翻开，都会留下自己的阅读足迹。'}</p><button onClick={() => { setSearch(''); setFilter('all') }}>查看全部藏书<ArrowRight /></button></div>}
        </section>

        <section className="lib-guide" aria-label="阅读提示"><div><BookOpenText weight="bold" /><p><b>读懂每一句</b><span>点击原文，切换中文译文。</span></p></div><div><NotePencil weight="bold" /><p><b>记录你的想法</b><span>选中文字，划线或记笔记。</span></p></div><div><BookmarkSimple weight="bold" /><p><b>随时接着读</b><span>进度与笔记，按书独立保存。</span></p></div></section>
      </main>
      <footer className="lib-footer"><span>阅间 <i>·</i> BETWEEN PAGES</span><p>更多书籍加入后，会显示在这里。</p></footer>
      </div>
    </div>
  )
}

function BookCard({ book, summary, open }: { book: Book; summary?: ReadingSummary; open(): void }) {
  const started = !!summary?.progress
  const percent = summary?.progress?.percent || 0
  const percentLabel = percent > 0 && percent < 1 ? '<1' : Math.round(percent)
  return <article className="lib-book">
    <button className="book-cover" style={{ background: book.color }} onClick={open} aria-label={`阅读《${book.title}》`}><img className="cover-art" src={book.cover.src} alt={book.cover.alt} width={768} height={1152} decoding="async" /><span className="cover-spine" /><span className="cover-caption"><span>{book.title}</span><small>{book.originalAuthor}</small></span><span className="cover-open">翻开这本书<ArrowRight /></span></button>
    <div className="book-detail"><span className="book-category"><span />文学 · 长篇小说</span><h2><a href={readPath(book.id)} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) { e.preventDefault(); open() } }}>{book.title}</a></h2><p className="book-english">{book.englishTitle}</p><p className="book-author">{book.author}<span>{book.originalAuthor}</span></p><div className="book-tags">{book.languages.map(language => <span key={language}>{language}</span>)}<span>{book.chapters} 章</span></div><p className="book-description">{book.description}</p><div className="book-reading-status">{started ? <><div><span>{percent >= 100 ? <><Check />已读完</> : `读到第 ${summary.progress?.ch} 章`}</span><b>{percentLabel}%</b></div><div className="book-progress"><i style={{ width: `${Math.min(percent, 100)}%` }} /></div></> : <span className="book-unread">尚未开始，故事等你翻开。</span>}</div><button className="lib-primary" onClick={open}>{started ? '继续阅读' : '开始阅读'}<ArrowRight weight="bold" /></button></div>
  </article>
}
