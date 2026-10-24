'use client'
import { useEffect, useState, type ComponentType } from 'react'
export default function Page() {
  const [Reader, setReader] = useState<ComponentType | null>(null)
  useEffect(() => { import('../src/Library').then(m => setReader(() => m.default)) }, [])
  return Reader ? <Reader /> : <div style={{ padding: 40, color: '#71717a' }}>正在打开书库…</div>
}
