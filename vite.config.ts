import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// 本地开发：从 private/book 读书本数据（该目录不进 git）。线上由 functions/api 从 R2 读取。
function localBook(): Plugin {
  return {
    name: 'local-book',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/api\/(toc|ch\/(\d{1,2}))$/)
        if (!m) return next()
        const file = m[2] ? `ch${m[2].padStart(2, '0')}.json` : 'toc.json'
        const p = path.resolve(__dirname, 'private/book', file)
        if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('{}') }
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(fs.readFileSync(p))
      })
    },
  }
}

// 账号/同步/AI 走本地 wrangler dev（npx wrangler dev --port 8787）
export default defineConfig({ plugins: [react(), tailwindcss(), localBook()], server: { proxy: { '^/api/(auth|sync|ai)': 'http://localhost:8787' } } })
