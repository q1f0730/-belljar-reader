import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Transaction adapter: tests the store's public isolation and backup contracts.
const databaseData = new Map();
globalThis.indexedDB = { open(name) {
  const request = {};
  queueMicrotask(() => {
    const created = !databaseData.has(name);
    if (created) databaseData.set(name, new Map());
    const values = databaseData.get(name);
    request.result = {
      createObjectStore() {},
      transaction() {
        const transaction = { objectStore: () => ({
          get(key) {
            const result = {};
            queueMicrotask(() => { result.result = structuredClone(values.get(key)); result.onsuccess?.(); });
            return result;
          },
          put(value, key) {
            values.set(key, structuredClone(value));
            queueMicrotask(() => transaction.oncomplete?.());
          },
        }) };
        return transaction;
      },
    };
    if (created) request.onupgradeneeded?.();
    request.onsuccess?.();
  });
  return request;
} };
const source = ts.transpileModule(fs.readFileSync('src/book-store.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
const { createBookStore } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const first = createBookStore('first-book'), second = createBookStore('second-book');
await first.set('progress', { ch: 3 });
await second.set('progress', { ch: 8 });
await first.set('notes', [{ id: 'same-unit', text: 'First book note' }]);
await second.set('notes', [{ id: 'same-unit', text: 'Second book note' }]);
assert.deepEqual(await first.get('progress'), { ch: 3 });
assert.deepEqual(await second.get('progress'), { ch: 8 });
assert.equal((await first.get('notes'))[0].text, 'First book note');
assert.equal((await second.get('notes'))[0].text, 'Second book note');
const backup = await first.exportAll();
assert.equal(backup.bookId, 'first-book');
assert(backup.notes);
await assert.rejects(() => second.importAll(backup), /不属于当前这本书/);
await first.set('notes', []);
await first.importAll(backup);
assert.equal((await first.get('notes'))[0].text, 'First book note');
assert.equal(databaseData.size, 2);
console.log('Verified separate progress and notes, full backup round trip, and cross-book import rejection.');
