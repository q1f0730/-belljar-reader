// Cloudflare Worker：网页静态文件放 KV(SITE)，书本数据放私有 KV(BOOK)。
// 书本原文/译文只对中国大陆请求开放（cf.country === 'CN'），其余返回 451。
interface Env { BOOK: KVNamespace; SITE: KVNamespace }

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', woff2: 'font/woff2', png: 'image/png', ico: 'image/x-icon',
}

async function api(req: Request, env: Env, parts: string[]) {
  const country = (req as any).cf?.country
  if (country !== 'CN') return Response.json({ error: 'region', message: '本书原文仅向中国大陆读者提供。' }, { status: 451 })
  let key: string | null = null
  if (parts[0] === 'toc') key = 'toc.json'
  else if (parts[0] === 'ch' && /^\d{1,2}$/.test(parts[1] || '')) key = `ch${parts[1].padStart(2, '0')}.json`
  if (!key) return new Response('not found', { status: 404 })
  const body = await env.BOOK.get(key)
  if (!body) return new Response('not found', { status: 404 })
  return new Response(body, { headers: { 'content-type': TYPES.json, 'cache-control': 'private, max-age=3600', vary: 'cf-ipcountry' } })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed', { status: 405 })
    const path = decodeURIComponent(url.pathname)
    if (path.startsWith('/api/')) return api(req, env, path.slice(5).split('/'))
    let key = path === '/' ? 'index.html' : path.slice(1)
    let buf = await env.SITE.get(key, 'arrayBuffer')
    if (!buf && !/\.[a-z0-9]+$/i.test(key)) { key = 'index.html'; buf = await env.SITE.get(key, 'arrayBuffer') }
    if (!buf) return new Response('not found', { status: 404 })
    const ext = key.split('.').pop()!.toLowerCase()
    const cache = key.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300'
    return new Response(req.method === 'HEAD' ? null : buf, { headers: { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': cache } })
  },
}
