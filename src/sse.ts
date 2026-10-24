// Buffer complete SSE events, including split UTF-8, CRLF, and final EOF events.
export async function* sseData(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader(), decoder = new TextDecoder(); let buffer = ''
  const data = (event: string) => event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n')
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let match: RegExpExecArray | null
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const event = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length)
        const text = data(event); if (text) yield text
      }
      if (buffer.length > 512 * 1024) throw new Error('AI 回复格式异常，请重试。')
      if (done) { const text = data(buffer); if (text) yield text; break }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
