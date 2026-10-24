import type { ReactNode } from 'react'
import '@fontsource-variable/newsreader'
import '@fontsource-variable/newsreader/wght-italic.css'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '../src/index.css'

export const metadata = { title: '阅间 · 我的书库', description: '双语阅读、翻译与笔记。' }
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body><div id="root">{children}</div></body></html>
}
