import { useEffect, useRef, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { login, register, type User } from './account'

export function Auth({ onDone, onClose, reason }: { onDone(u: User): void; onClose(): void; reason?: string }) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [name, setName] = useState(''), [pw, setPw] = useState(''), [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => { first.current?.focus() }, [tab])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return
    const n = name.trim()
    if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/.test(n)) return setErr('用户名 2–20 位，只能用字母、数字、下划线或汉字')
    if (pw.length < 8) return setErr('密码至少 8 位')
    if (tab === 'register' && pw !== pw2) return setErr('两次输入的密码不一样')
    setBusy(true); setErr('')
    try { onDone(await (tab === 'login' ? login(n, pw) : register(n, pw))) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal auth" onSubmit={submit} aria-label="登录或注册">
        <button type="button" className="icon-btn x" onClick={onClose} aria-label="关闭"><X weight="bold" /></button>
        <h3>{tab === 'login' ? '登录' : '注册'}</h3>
        <p className="note">{reason || '划线、笔记和 AI 对话需要登录。数据会自动同步到你的账号，只有你自己看得到。'}</p>
        <div className="seg">
          <button type="button" className={tab === 'login' ? 'on' : ''} onClick={() => { setTab('login'); setErr('') }}>登录</button>
          <button type="button" className={tab === 'register' ? 'on' : ''} onClick={() => { setTab('register'); setErr('') }}>注册</button>
        </div>
        <label>用户名<input ref={first} value={name} onChange={e => setName(e.target.value)} autoComplete="username" maxLength={20} placeholder="2–20 位" /></label>
        <label>密码<input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} maxLength={128} placeholder="至少 8 位" /></label>
        {tab === 'register' && <label>确认密码<input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" maxLength={128} /></label>}
        {err && <div className="form-err" role="alert">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? '请稍候…' : tab === 'login' ? '登录' : '注册并登录'}</button>
        {tab === 'register' && <p className="note small">没有找回密码功能，请记好密码。</p>}
      </form>
    </div>
  )
}
