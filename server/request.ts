import { AgentError } from './mercury.ts'

export function sameOrigin(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin) throw new AgentError('请从书库页面提交。', 403)
}

export async function readJson(req: Request, maxBytes = 10 * 1024 * 1024): Promise<unknown> {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new AgentError('请使用 JSON 提交。', 415)
  const reader = req.body?.getReader()
  if (!reader) throw new AgentError('没有收到内容。')
  const parts: Uint8Array[] = []; let bytes = 0
  while (true) {
    const { value, done } = await reader.read(); if (done) break
    bytes += value.byteLength
    if (bytes > maxBytes) { await reader.cancel(); throw new AgentError('提交内容过长，请缩短后重试。', 413) }
    parts.push(value)
  }
  const all = new Uint8Array(bytes); let offset = 0
  for (const part of parts) { all.set(part, offset); offset += part.length }
  try { return JSON.parse(new TextDecoder().decode(all)) } catch { throw new AgentError('提交的数据格式无效。') }
}
