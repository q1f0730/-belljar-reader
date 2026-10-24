import { AgentError } from './mercury.ts'

// A browser-scoped capability for unpublished uploads; no account or sign-in.
const cookieName = '__Host-yuejian-upload'
export async function uploadOwner(req: Request): Promise<string | null> {
  const token = req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return 'browser:' + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
}
export async function requireUploadOwner(req: Request) {
  const owner = await uploadOwner(req)
  if (!owner) throw new AgentError('请刷新上书页面后重试，并允许此站点使用 Cookie 保存任务。', 401)
  return owner
}
export function newUploadCookie() {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('')
  return `${cookieName}=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
}
