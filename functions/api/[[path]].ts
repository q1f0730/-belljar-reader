// Cloudflare Pages Function：书本内容只对中国大陆开放，数据放在私有 R2 桶（绑定名 BOOK）。
interface Env { BOOK: R2Bucket }

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const country = (request as any).cf?.country
  if (country !== 'CN') {
    return Response.json({ error: 'region', message: '本书原文仅向中国大陆读者提供。' }, { status: 451 })
  }
  const parts = (params.path as string[]) || []
  let key: string | null = null
  if (parts[0] === 'toc') key = 'toc.json'
  else if (parts[0] === 'ch' && /^\d{1,2}$/.test(parts[1] || '')) key = `ch${parts[1].padStart(2, '0')}.json`
  if (!key) return new Response('not found', { status: 404 })
  const obj = await env.BOOK.get(key)
  if (!obj) return new Response('not found', { status: 404 })
  return new Response(obj.body, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, max-age=3600' },
  })
}
