// Cloudflare Worker：网页静态文件放 KV(SITE)，书本数据放私有 KV(BOOK)，账号与同步数据放 D1(DB)。
// 所有 /api 只对中国大陆请求开放（cf.country === 'CN'），其余返回 451。本地开发用 ALLOW_ALL=1 跳过。
interface Env {
  BOOK: KVNamespace; SITE: KVNamespace; DB: D1Database
  QWEN_API_KEY?: string; QWEN_BASE?: string; QWEN_MODEL?: string; ALLOW_ALL?: string
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', woff2: 'font/woff2', png: 'image/png', ico: 'image/x-icon',
}
const COOKIE = 'bj_sess'
const SESSION_DAYS = 30
const AI_DAILY = 80 // 每人每天 AI 提问上限
const KINDS = ['highlights', 'notes', 'chats', 'progress'] as const
const MAX_DOC = 900_000 // 单个同步文档上限（字节）

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': TYPES.json, 'cache-control': 'no-store', ...headers } })
const err = (status: number, message: string) => json({ error: message }, status)

// —— 密码与会话 ——
const enc = new TextEncoder()
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
async function pbkdf2(pw: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits'])
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100_000 }, key, 256))
}
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)))
function safeEq(a: string, b: string) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0 }
const cookieOf = (req: Request) => (req.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1)
const setCookie = (v: string, maxAge: number, secure: boolean) => `${COOKIE}=${v}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`

let schemaReady = false
async function schema(db: D1Database) {
  if (schemaReady) return
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL COLLATE NOCASE, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, uid INTEGER NOT NULL, expires INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS docs (uid INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (uid, kind))'),
    db.prepare('CREATE TABLE IF NOT EXISTS ai_usage (uid INTEGER NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (uid, day))'),
    db.prepare('CREATE TABLE IF NOT EXISTS login_fail (name TEXT PRIMARY KEY COLLATE NOCASE, n INTEGER NOT NULL, until INTEGER NOT NULL)'),
  ])
  schemaReady = true
}

async function userOf(req: Request, env: Env): Promise<{ id: number; name: string } | null> {
  const t = cookieOf(req); if (!t || !/^[0-9a-f]{64}$/.test(t)) return null
  const row = await env.DB.prepare('SELECT u.id, u.name, s.expires FROM sessions s JOIN users u ON u.id = s.uid WHERE s.token = ?').bind(await sha256(t)).first<{ id: number; name: string; expires: number }>()
  if (!row || row.expires < Date.now()) return null
  return { id: row.id, name: row.name }
}

async function newSession(env: Env, uid: number, secure: boolean) {
  const raw = hex(crypto.getRandomValues(new Uint8Array(32)))
  await env.DB.prepare('INSERT INTO sessions (token, uid, expires) VALUES (?, ?, ?)').bind(await sha256(raw), uid, Date.now() + SESSION_DAYS * 864e5).run()
  return setCookie(raw, SESSION_DAYS * 86400, secure)
}

const NAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/
async function body<T>(req: Request): Promise<T | null> {
  const len = +(req.headers.get('content-length') || 0); if (len > MAX_DOC + 10_000) return null
  try { return await req.json() as T } catch { return null }
}

async function auth(req: Request, env: Env, action: string) {
  const secure = new URL(req.url).protocol === 'https:'
  if (action === 'me' && req.method === 'GET') { const u = await userOf(req, env); return json({ user: u ? { name: u.name } : null }) }
  if (action === 'logout' && req.method === 'POST') {
    const t = cookieOf(req); if (t) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256(t)).run()
    return json({ ok: true }, 200, { 'set-cookie': setCookie('', 0, secure) })
  }
  if (req.method !== 'POST' || (action !== 'register' && action !== 'login')) return err(404, 'not found')
  const b = await body<{ name?: string; password?: string }>(req)
  const name = (b?.name || '').trim(), pw = b?.password || ''
  if (!NAME_RE.test(name)) return err(400, '用户名 2–20 位，只能用字母、数字、下划线或汉字')
  if (pw.length < 8 || pw.length > 128) return err(400, '密码至少 8 位')
  if (action === 'register') {
    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE name = ?').bind(name).first()
    if (exists) return err(409, '这个用户名已经有人用了')
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
    const r = await env.DB.prepare('INSERT INTO users (name, salt, hash, created) VALUES (?, ?, ?, ?)').bind(name, salt, await pbkdf2(pw, salt), Date.now()).run()
    const uid = r.meta.last_row_id as number
    return json({ user: { name } }, 200, { 'set-cookie': await newSession(env, uid, secure) })
  }
  // 登录：连续输错 5 次锁 10 分钟
  const fail = await env.DB.prepare('SELECT n, until FROM login_fail WHERE name = ?').bind(name).first<{ n: number; until: number }>()
  if (fail && fail.until > Date.now()) return err(429, `输错太多次，请 ${Math.ceil((fail.until - Date.now()) / 60000)} 分钟后再试`)
  const u = await env.DB.prepare('SELECT id, name, salt, hash FROM users WHERE name = ?').bind(name).first<{ id: number; name: string; salt: string; hash: string }>()
  const okPw = u ? safeEq(await pbkdf2(pw, u.salt), u.hash) : (await pbkdf2(pw, 'x'.repeat(32)), false)
  if (!u || !okPw) {
    const n = (fail && fail.until <= Date.now() && fail.n >= 5 ? 0 : fail?.n || 0) + 1
    await env.DB.prepare('INSERT INTO login_fail (name, n, until) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET n = excluded.n, until = excluded.until')
      .bind(name, n, n >= 5 ? Date.now() + 10 * 60000 : 0).run()
    return err(401, '用户名或密码不对')
  }
  await env.DB.prepare('DELETE FROM login_fail WHERE name = ?').bind(name).run()
  return json({ user: { name: u.name } }, 200, { 'set-cookie': await newSession(env, u.id, secure) })
}

// —— 同步：每类数据一个 JSON 文档；updated 用于乐观并发（客户端带上 base，冲突时返回 409 和服务器版本） ——
async function sync(req: Request, env: Env, kind: string | undefined) {
  const u = await userOf(req, env); if (!u) return err(401, '请先登录')
  if (!kind && req.method === 'GET') {
    const rows = await env.DB.prepare('SELECT kind, data, updated FROM docs WHERE uid = ?').bind(u.id).all<{ kind: string; data: string; updated: number }>()
    const out: Record<string, { data: unknown; updated: number }> = {}
    for (const r of rows.results) out[r.kind] = { data: JSON.parse(r.data), updated: r.updated }
    return json(out)
  }
  if (!kind || !(KINDS as readonly string[]).includes(kind) || req.method !== 'PUT') return err(404, 'not found')
  const b = await body<{ data: unknown; base?: number }>(req)
  if (!b || b.data === undefined) return err(400, '数据格式不对')
  const text = JSON.stringify(b.data); if (text.length > MAX_DOC) return err(413, '数据太大')
  const cur = await env.DB.prepare('SELECT data, updated FROM docs WHERE uid = ? AND kind = ?').bind(u.id, kind).first<{ data: string; updated: number }>()
  if (cur && b.base !== undefined && b.base !== cur.updated) return json({ conflict: true, data: JSON.parse(cur.data), updated: cur.updated }, 409)
  const updated = Math.max(Date.now(), (cur?.updated || 0) + 1)
  await env.DB.prepare('INSERT INTO docs (uid, kind, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(uid, kind) DO UPDATE SET data = excluded.data, updated = excluded.updated')
    .bind(u.id, kind, text, updated).run()
  return json({ updated })
}

// —— AI 对话：转发到千问（OpenAI 兼容接口），流式返回 ——
const SYSTEM = `你是一位耐心的英美文学老师，陪读者读 Sylvia Plath 的小说《The Bell Jar》（钟形罩）。读者英文水平不高，目标是读懂英文原著、理解文学。
规则：
- 用简体中文回答，先给结论，再分点解释；一般控制在 300 字以内，读者要求展开时再展开。
- 解释英文句子时：讲清句子结构、难词和习语在这里的意思、语气和潜台词，必要时给出自然的中文意思。
- 谈文学时：人物心理、意象（比如钟形罩、无花果树）、时代背景（1950 年代美国、罗森堡夫妇案等）、叙述手法。
- 不剧透读者还没读到的情节，除非读者明确要求；可以提示"后面会讲到"。
- 引用原文只引必要的短句，不要大段复述原文。
- 不确定的事直说不确定，不编造。`

async function ai(req: Request, env: Env) {
  const u = await userOf(req, env); if (!u) return err(401, '请先登录')
  if (req.method !== 'POST') return err(405, 'method not allowed')
  if (!env.QWEN_API_KEY) return err(503, 'AI 还没配置好（服务器缺少 QWEN_API_KEY）')
  const b = await body<{ messages?: { role: string; content: string }[]; context?: { chapter?: number; page?: string; quote?: string } }>(req)
  const msgs = (b?.messages || []).filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return err(400, '没有问题')
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) // 北京时间的日期
  const used = await env.DB.prepare('INSERT INTO ai_usage (uid, day, n) VALUES (?, ?, 1) ON CONFLICT(uid, day) DO UPDATE SET n = n + 1 RETURNING n').bind(u.id, day).first<{ n: number }>()
  if ((used?.n || 0) > AI_DAILY) return err(429, `今天的 AI 提问次数用完了（每天 ${AI_DAILY} 次），明天再来`)
  const c = b?.context || {}
  const ctx = [
    c.chapter ? `读者正在读第 ${c.chapter} 章。` : '',
    c.page ? `读者当前这一页的原文（供你参考，不要整段复述）：\n${String(c.page).slice(0, 3000)}` : '',
    c.quote ? `读者选中、想问的这段：\n${String(c.quote).slice(0, 1500)}` : '',
  ].filter(Boolean).join('\n\n')
  const upstream = await fetch(`${env.QWEN_BASE || 'https://maas.qianwenaiapi.com/compatible-mode/v1'}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.QWEN_API_KEY}` },
    body: JSON.stringify({
      model: env.QWEN_MODEL || 'qwen3.8-max-0902', stream: true, enable_thinking: false, temperature: 0.6, max_tokens: 1500,
      messages: [{ role: 'system', content: SYSTEM + (ctx ? '\n\n' + ctx : '') }, ...msgs],
    }),
  })
  if (!upstream.ok || !upstream.body) {
    await env.DB.prepare('UPDATE ai_usage SET n = n - 1 WHERE uid = ? AND day = ?').bind(u.id, day).run()
    return err(502, `AI 服务暂时出错（${upstream.status}），稍后再试`)
  }
  // 只把正文增量转成简单的 SSE：data: {"t":"..."}，结束时 data: [DONE]
  const reader = upstream.body.getReader(); const dec = new TextDecoder(); const out = new TextEncoder()
  let buf = ''
  const stream = new ReadableStream({
    async pull(ctrl) {
      const { done, value } = await reader.read()
      if (done) { ctrl.enqueue(out.encode('data: [DONE]\n\n')); ctrl.close(); return }
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop() || ''
      for (const l of lines) {
        const s = l.trim(); if (!s.startsWith('data:')) continue
        const d = s.slice(5).trim(); if (d === '[DONE]') continue
        try { const t = JSON.parse(d).choices?.[0]?.delta?.content; if (t) ctrl.enqueue(out.encode(`data: ${JSON.stringify({ t })}\n\n`)) } catch { /* 忽略不完整的行 */ }
      }
    },
    cancel() { reader.cancel() },
  })
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' } })
}

async function api(req: Request, env: Env, parts: string[]) {
  const country = (req as any).cf?.country
  if (country !== 'CN' && env.ALLOW_ALL !== '1') return json({ error: 'region', message: '本书原文仅向中国大陆读者提供。' }, 451)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // 防跨站请求：写操作必须来自本站
    const o = req.headers.get('origin'); if (o && env.ALLOW_ALL !== '1' && new URL(o).host !== new URL(req.url).host) return err(403, 'forbidden')
  }
  if (parts[0] === 'auth' || parts[0] === 'sync' || parts[0] === 'ai') {
    await schema(env.DB)
    if (parts[0] === 'auth') return auth(req, env, parts[1] || '')
    if (parts[0] === 'sync') return sync(req, env, parts[1])
    return ai(req, env)
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return err(405, 'method not allowed')
  let key: string | null = null
  if (parts[0] === 'toc') key = 'toc.json'
  else if (parts[0] === 'ch' && /^\d{1,2}$/.test(parts[1] || '')) key = `ch${parts[1].padStart(2, '0')}.json`
  if (!key) return new Response('not found', { status: 404 })
  const data = await env.BOOK.get(key)
  if (!data) return new Response('not found', { status: 404 })
  return new Response(data, { headers: { 'content-type': TYPES.json, 'cache-control': 'private, max-age=3600', vary: 'cf-ipcountry' } })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const path = decodeURIComponent(url.pathname)
    if (path.startsWith('/api/')) {
      try { return await api(req, env, path.slice(5).split('/')) } catch (e) { return err(500, '服务器出错了：' + String((e as Error).message || e).slice(0, 200)) }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed', { status: 405 })
    let key = path === '/' ? 'index.html' : path.slice(1)
    let buf = await env.SITE.get(key, 'arrayBuffer')
    if (!buf && !/\.[a-z0-9]+$/i.test(key)) { key = 'index.html'; buf = await env.SITE.get(key, 'arrayBuffer') }
    if (!buf) return new Response('not found', { status: 404 })
    const ext = key.split('.').pop()!.toLowerCase()
    const cache = key.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300'
    return new Response(req.method === 'HEAD' ? null : buf, { headers: { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': cache } })
  },
}

