import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

let books = 0, chapters = 0, units = 0;
for (const entry of fs.readdirSync('public/books', { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const root = path.join('public/books', entry.name);
  const toc = JSON.parse(fs.readFileSync(path.join(root, 'toc.json'), 'utf8'));
  assert(toc.title && toc.author && toc.chapters.length, `Invalid contents: ${entry.name}`);
  const ids = new Set();
  for (let i = 0; i < toc.chapters.length; i++) {
    const n = i + 1;
    assert.equal(toc.chapters[i].n, n);
    const chapter = JSON.parse(fs.readFileSync(path.join(root, `ch${String(n).padStart(2, '0')}.json`), 'utf8'));
    assert.equal(chapter.n, n);
    assert(chapter.paras.length > 0);
    for (const paragraph of chapter.paras) for (const unit of paragraph.u) {
      assert(!ids.has(unit.id), `Duplicate unit ${unit.id}`);
      assert.equal(Number(unit.id.split('.')[0]), n);
      assert(Array.isArray(unit.en) && unit.en.every(s => typeof s === 'string'));
      assert.equal(typeof unit.zh, 'string');
      ids.add(unit.id); units++;
    }
    chapters++;
  }
  books++;
}
const dictionary = JSON.parse(fs.readFileSync('public/data/dict.json', 'utf8'));
assert(Object.keys(dictionary).length > 1000, 'Dictionary is missing');
console.log(JSON.stringify({ books, chapters, units, dictionaryEntries: Object.keys(dictionary).length, verified: true }));
