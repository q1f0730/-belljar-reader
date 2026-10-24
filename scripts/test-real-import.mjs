// Explicit, opt-in integration test. Reads {key} from hidden-parent stdin.
// Processes caller-supplied books through the actual handler and Mercury API.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createInterface } from 'node:readline'
import assert from 'node:assert/strict'
import { libraryRequest } from '../server/library-agent.ts'

const rl=createInterface({input:process.stdin});const line=await new Promise(resolve=>rl.once('line',resolve));rl.close()
const {key}=JSON.parse(line)
if(typeof key!=='string'||!key)throw new Error('Missing runtime test credential')
const root=path.resolve('work/anonymous-import-test'),r2=path.join(root,'normal-people-r2');fs.mkdirSync(r2,{recursive:true})
const input=JSON.parse(fs.readFileSync(path.resolve('work/normal-people-input.json'),'utf8'))
const db=new DatabaseSync(path.join(root,'normal-people-test.sqlite'))
if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='library_import_jobs'").get())db.exec(fs.readFileSync('drizzle/0000_dizzy_kitty_pryde.sql','utf8').replaceAll('--> statement-breakpoint',''))
class Statement{
  constructor(sql,args=[]){this.sql=sql;this.args=args}
  bind(...args){return new Statement(this.sql,args)}
  async first(){return db.prepare(this.sql).get(...this.args)||null}
  async all(){return{results:db.prepare(this.sql).all(...this.args)}}
  async run(){return{meta:{changes:Number(db.prepare(this.sql).run(...this.args).changes)}}}
}
const bucket={async put(k,v){const p=path.join(r2,k);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p+'.tmp',v);fs.renameSync(p+'.tmp',p)},async get(k){const p=path.join(r2,k);if(!fs.existsSync(p))return null;const raw=fs.readFileSync(p,'utf8');return{json:async()=>JSON.parse(raw),body:raw}}}
const env={DB:{prepare:s=>new Statement(s),batch:async statements=>{db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}},BUCKET:bucket,INCEPTION_API_KEY:key}
async function call(route,data,authorized=true){
  const headers={'Content-Type':'application/json',Origin:'https://local-integration.example.test',...(authorized?{cookie:'__Host-yuejian-upload='+'c'.repeat(64)}:{})}
  const response=await libraryRequest(new Request('https://local-integration.example.test'+route,{method:data===undefined?'GET':'POST',headers,...(data===undefined?{}:{body:JSON.stringify(data)})}),env)
  const result=await response.json()
  if(!response.ok){console.log(JSON.stringify({failed:true,status:response.status,error:result.error}));process.exit(1)}
  return result
}
let job=(await call('/api/agent/jobs',input)).job
console.log(JSON.stringify({started:job,environment:'local persistent SQLite/object store, real Mercury-3 API'}))
for(let i=0;i<1502&&!['draft','published'].includes(job.status);i++){
  job=(await call('/api/agent/jobs/'+job.id+'/step',{})).job
  console.log(JSON.stringify({status:job.status,cursor:job.cursor,total:job.total,percent:job.percent,chapters:job.chapters}))
}
assert.equal(job.status,'draft')
const bundle=await call('/api/agent/jobs/'+job.id+'/export')
fs.writeFileSync(path.join(root,'normal-people-prepared.json'),JSON.stringify(bundle))
assert.equal(bundle.chapters.length,18)
const normalize=s=>s.replace(/\s/g,'');let units=0,emptyEnglish=0,emptyChinese=0;const ids=new Set()
bundle.chapters.forEach((ch,i)=>{
  const us=ch.paras.flatMap(p=>p.u)
  assert.equal(normalize(us.flatMap(u=>u.en).join('')),normalize(input.primary.chapters[i+2].paragraphs.join('')),`English coverage, chapter ${i+1}`)
  assert.equal(normalize(us.map(u=>u.zh).join('')),normalize(input.companion.chapters[i+5].paragraphs.join('')),`Chinese coverage, chapter ${i+1}`)
  us.forEach(u=>{assert(!ids.has(u.id));ids.add(u.id);units++;emptyEnglish+=!u.en.length;emptyChinese+=!u.zh})
})
const publicBooks=await call('/api/library/books',undefined,false);assert.equal(publicBooks.books.length,0)
const report={model:'mercury-3',execution:'Real Mercury API; same application handler with local persistent SQLite and file-store adapters. This harness tests the local handler; hosted browser verification is separate.',chapters:18,units,emptyEnglish,emptyChinese,needsReviewBatches:bundle.review?.reviewBatches??bundle.review?.codeAlignedBatches??0,reviewChapters:bundle.review?.chapters||[],englishSourceCoverage:'100% after whitespace normalization',chineseSourceCoverage:'100% after whitespace normalization',privateDraft:true,job}
fs.writeFileSync(path.join(root,'normal-people-test-report.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({verified:report}));db.close()
