// 本机存储：IndexedDB。刷新、关浏览器、重启都不会丢；申请持久存储避免被浏览器清理。
const DB = 'belljar-reader', STORE = 'kv'
let dbp: Promise<IDBDatabase> | null = null
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  return dbp
}
export async function get<T>(key: string): Promise<T | undefined> {
  const d = await db()
  return new Promise((res, rej) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key)
    r.onsuccess = () => res(r.result as T); r.onerror = () => rej(r.error)
  })
}
export async function set(key: string, val: unknown) {
  const d = await db()
  return new Promise<void>((res, rej) => {
    const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(val, key)
    t.oncomplete = () => res(); t.onerror = () => rej(t.error)
  })
}
export async function persist(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch { return false }
}
export const KEYS = ['highlights', 'progress', 'prefs', 'flips', 'mode'] as const
export async function exportAll() {
  const out: Record<string, unknown> = { app: 'belljar-reader', v: 1, at: new Date().toISOString() }
  for (const k of KEYS) out[k] = await get(k)
  return out
}
export async function importAll(data: Record<string, unknown>) {
  if (data.app !== 'belljar-reader') throw new Error('不是本书的备份文件')
  for (const k of KEYS) if (data[k] !== undefined) await set(k, data[k])
}
