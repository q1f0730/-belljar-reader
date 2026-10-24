import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { DOMParser } from 'linkedom'
import { zipSync, strToU8 } from 'fflate'
import { parseEpub } from '../src/parse-upload.ts'
import { applyAlignment, makeTasks, validatePlan } from '../src/import-format.ts'
import { libraryRequest, coverSvg } from '../server/library-agent.ts'
import { processTask, ContentFiltered } from '../server/mercury.ts'

globalThis.DOMParser=DOMParser
const files={
  'META-INF/container.xml':'<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>',
  'book.opf':'<package><metadata><title>Test Book</title><creator>Test Author</creator><language>en</language></metadata><manifest><item id="c1" href="one.xhtml"/></manifest><spine><itemref idref="c1"/></spine></package>',
  'one.xhtml':'<html><body><h1>One</h1><p>A door opened. She smiled.</p><p>He left.</p><script>ignore me</script></body></html>',
}
const parsed=parseEpub(zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)]))))
assert.equal(parsed.chapters[0].paragraphs[0],'A door opened. She smiled.')
assert.equal(parsed.language,'en')
assert(!JSON.stringify(parsed).includes('ignore me'))
const input={requestId:'agent-test-id-12345',primary:parsed,companion:{title:'测试书',author:'测试作者',language:'zh',chapters:[{title:'一',paragraphs:['门开了。她笑了。','他离开了。']}]}}
const plan={title:'测试书',englishTitle:'Test Book',author:'测试作者',originalAuthor:'Test Author',description:'测试书籍。',chapters:[{primary:0,companion:0,en:'One',zh:'一'}]}
const tasks=makeTasks(input,plan)
assert.equal(tasks.length,1)
const groups=tasks[0].en.map((_,i)=>({en:[i],zh:[i]}))
assert.equal(applyAlignment(tasks[0],groups).length,3)
assert.throws(()=>applyAlignment(tasks[0],[{en:[0,0],zh:[0]}]),/遗漏|重复|乱序/)
assert.throws(()=>applyAlignment(tasks[0],[{en:[0],zh:[0]}]),/遗漏/)
assert.throws(()=>validatePlan({...plan,chapters:[{primary:0,companion:50,en:'One',zh:'一'}]},input))

// Exercise the real request handler with SQLite and a private object-store adapter.
// Vendor responses are fixtures here; hosted tests separately exercise Mercury-3.
const sqlite=new DatabaseSync(':memory:')
sqlite.exec(fs.readFileSync(new URL('../drizzle/0000_dizzy_kitty_pryde.sql',import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''))
class Statement{
  constructor(sql,args=[]){this.sql=sql;this.args=args}
  bind(...args){return new Statement(this.sql,args)}
  async first(){return sqlite.prepare(this.sql).get(...this.args)||null}
  async all(){return{results:sqlite.prepare(this.sql).all(...this.args)}}
  async run(){const r=sqlite.prepare(this.sql).run(...this.args);return{meta:{changes:Number(r.changes)}}}
}
const objects=new Map()
const bucket={async put(k,v){objects.set(k,v)},async get(k){if(!objects.has(k))return null;return{json:async()=>JSON.parse(objects.get(k)),body:objects.get(k)}}}
const env={DB:{prepare:s=>new Statement(s),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}},BUCKET:bucket,INCEPTION_API_KEY:'fixture-not-a-secret'}
const headers={'content-type':'application/json',origin:'https://library.example.test',cookie:'__Host-yuejian-upload='+'a'.repeat(64)}
const request=(path,post,authorized=true)=>libraryRequest(new Request('https://library.example.test'+path,{method:post===undefined?'GET':'POST',headers:authorized?headers:{origin:headers.origin,'content-type':'application/json'},...(post!==undefined?{body:JSON.stringify(post)}:{})}),env)
assert.equal((await request('/api/agent/jobs',input,false)).status,401)
const wrongOrigin=await libraryRequest(new Request('https://library.example.test/api/agent/jobs',{method:'POST',headers:{...headers,origin:'https://other.test'},body:'{}'}),env)
assert.equal(wrongOrigin.status,403)
const status=await request('/api/agent/status',undefined,false)
assert.match(status.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/)
assert.equal((await status.json()).signIn,undefined)
const created=await request('/api/agent/jobs',input);assert.equal(created.status,201)
const jobId=(await created.json()).job.id
assert.notEqual(jobId,input.requestId)
assert.equal((await request('/api/agent/jobs',{...input,requestId:'duplicate-test-id'})).status,200)
assert.equal((await request('/api/agent/jobs')).status,200)
const originalFetch=globalThis.fetch
let calls=0,fail=false
globalThis.fetch=async(_url,init)=>{
  calls++
  assert(!JSON.stringify(JSON.parse(init.body).messages).includes(env.INCEPTION_API_KEY))
  if(fail)return new Response('{}',{status:429})
  const data=calls===1?plan:{groups}
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}],usage:{prompt_tokens:10,completion_tokens:5}})
}
try{
  await request('/api/agent/jobs/'+jobId+'/step',{})
  fail=true;assert.equal((await request('/api/agent/jobs/'+jobId+'/step',{})).status,429)
  let state=await (await request('/api/agent/jobs/'+jobId)).json();assert.equal(state.job.cursor,0);assert.equal(state.job.status,'paused')
  fail=false;await request('/api/agent/jobs/'+jobId+'/step',{})
  await request('/api/agent/jobs/'+jobId+'/step',{})
  state=await (await request('/api/agent/jobs/'+jobId)).json();assert.equal(state.job.status,'draft')
  const otherHeaders={...headers,cookie:'__Host-yuejian-upload='+'b'.repeat(64)}
  const other=(path,post)=>libraryRequest(new Request('https://library.example.test'+path,{headers:otherHeaders,method:post===undefined?'GET':'POST',...(post===undefined?{}:{body:JSON.stringify(post)})}),env)
  for(const action of ['', '/export', '/step', '/publish'])assert.equal((await other('/api/agent/jobs/'+jobId+action,['/step','/publish'].includes(action)?{}:undefined)).status,404)
  assert.equal((await (await other('/api/agent/jobs')).json()).jobs.length,0)
  assert.equal((await (await other('/api/library/books?drafts=1')).json()).books.length,0)
  const publicBooks=await (await request('/api/library/books',undefined,false)).json();assert.equal(publicBooks.books.length,0)
  const bookId=state.job.bookId
  assert.equal((await request(`/api/library/books/${bookId}/toc.json`,undefined,false)).status,404)
  assert.equal((await other(`/api/library/books/${bookId}/cover.svg`)).status,404)
  assert.equal((await request(`/api/library/books/${bookId}/toc.json`)).status,200)
  assert.equal((await (await request('/api/library/books?drafts=1')).json()).books.length,1)
  const second=await (await other('/api/agent/jobs',input)).json();assert.notEqual(second.job.id,jobId)
  assert.equal((await request('/api/agent/jobs/'+jobId)).status,200)
  const exported=await (await request('/api/agent/jobs/'+jobId+'/export')).json();assert.equal(exported.chapters[0].paras.flatMap(p=>p.u).length,3)
  assert.equal(exported.chapters[0].paras.flatMap(p=>p.u).map(u=>u.en.join(' ')).join(' '),'A door opened. She smiled. He left.')
  const callsBefore=calls;await request('/api/agent/jobs/'+jobId+'/step',{});assert.equal(calls,callsBefore)
  await request('/api/agent/jobs/'+jobId+'/publish',{})
  assert.equal((await (await request('/api/library/books',undefined,false)).json()).books.length,1)
  assert.equal((await request(`/api/library/books/${bookId}/toc.json`,undefined,false)).status,200)
  assert(!coverSvg({title:'<script>alert(1)</script>',englishTitle:'x',originalAuthor:'x'}).includes('<script>'))
  globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({groups:[{en:[0,0],zh:[0]}]})}}]})
  const invalidAlignment=await processTask(env.INCEPTION_API_KEY,tasks[0])
  assert.equal(invalidAlignment.method,'length')
  assert.equal(invalidAlignment.reviewReason,'unavailable_ai_review')
  globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{"issues":[]}'}}]})
  const reviewed=await processTask(env.INCEPTION_API_KEY,tasks[0]);assert.equal(reviewed.method,'ai-reviewed')
  globalThis.fetch=async()=>Response.json({error:{code:'content_filter',type:'content_filter_error'}},{status:400})
  const codeAligned=await processTask(env.INCEPTION_API_KEY,tasks[0])
  assert.equal(codeAligned.method,'length')
  assert.equal(codeAligned.units.flatMap(u=>u.en).join(''),tasks[0].en.map(s=>s.text).join(''))
  assert.equal(codeAligned.units.map(u=>u.zh).join(''),tasks[0].zh.map(s=>s.text).join(''))
  await assert.rejects(()=>processTask(env.INCEPTION_API_KEY,{...tasks[0],zh:[],paired:false}),ContentFiltered)
}finally{globalThis.fetch=originalFetch;sqlite.close()}
console.log('Verified EPUB extraction, exact source coverage, alignment rejection, anonymous upload isolation, origin checks, duplicate uploads, resumable errors, private drafts, publication, export, and safe SVG covers.')
