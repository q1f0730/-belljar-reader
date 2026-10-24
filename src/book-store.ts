const STORE = 'kv'
const databases = new Map<string, Promise<IDBDatabase>>()
const KEYS = ['highlights', 'progress', 'prefs', 'flips', 'mode', 'trOn', 'notes', 'chats', 'conv'] as const

export function createBookStore(bookId: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(bookId)) throw new Error('无效的书籍编号')
  function db() {
    let pending = databases.get(bookId)
    if (!pending) {
      pending = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(`reading-library:${bookId}`, 1)
        request.onupgradeneeded = () => request.result.createObjectStore(STORE)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      databases.set(bookId, pending)
    }
    return pending
  }
  async function get<T>(key: string): Promise<T | undefined> {
    const database = await db()
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE).objectStore(STORE).get(key)
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => reject(request.error)
    })
  }
  async function set(key: string, value: unknown): Promise<void> {
    const database = await db()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put(value, key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }
  async function persist() {
    try {
      if (await navigator.storage?.persisted?.()) return true
      return (await navigator.storage?.persist?.()) ?? false
    } catch { return false }
  }
  async function exportAll() {
    const data: Record<string, unknown> = { app: 'reading-library', v: 2, bookId, at: new Date().toISOString() }
    for (const key of KEYS) data[key] = await get(key)
    return data
  }
  async function importAll(data: Record<string, unknown>) {
    if (data.app === 'belljar-reader' && bookId === 'belljar' && !data.bookId) {
      // Compatibility with the original reader's backups.
    } else if (data.app !== 'reading-library' || data.bookId !== bookId) {
      throw new Error('这份备份不属于当前这本书，请打开对应书籍后再导入。')
    }
    for (const key of KEYS) if (data[key] !== undefined) await set(key, data[key])
  }
  return { get, set, persist, exportAll, importAll }
}
