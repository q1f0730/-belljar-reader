import { makeTasks, validateInput, type ImportInput, type ImportPlan, type ImportTask, type PreparedUnit } from '../src/import-format.ts'
import type { Book } from '../src/library'
import type { Chapter, Toc } from '../src/types'
import { AgentError, mercury, planImport, processTask, type Usage } from './mercury.ts'
import { readJson, sameOrigin } from './request.ts'
import { newUploadCookie, requireUploadOwner, uploadOwner } from './upload-access.ts'
import { readingAi } from './reading-ai.ts'

type Job={id:string;fingerprint:string;owner:string;title:string;status:string;cursor:number;total:number;metadata:string|null;error:string|null;lease_until:number;input_tokens:number;output_tokens:number;created:number;updated:number}
type StoredBook={id:string;job_id:string;metadata:string;status:string;created:number}
type State={plan:ImportPlan;paired:boolean;language:'en'|'zh';reviewBatches?:number;reviewChapters?:number[]}
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}})
function storage(env:Cloudflare.Env){if(!env.DB||!env.BUCKET)throw new AgentError('书库服务正在准备，请稍后再试。',503);return{db:env.DB,bucket:env.BUCKET}}
async function fromBucket<T>(bucket:R2Bucket,key:string):Promise<T|null>{const v=await bucket.get(key);return v?await v.json<T>():null}
const put=(bucket:R2Bucket,key:string,v:unknown)=>bucket.put(key,JSON.stringify(v),{httpMetadata:{contentType:'application/json'}})
function view(job:Job){const state=job.metadata?JSON.parse(job.metadata) as State:null;return{id:job.id,title:job.title,status:job.status,cursor:job.cursor,total:job.total,percent:['draft','published'].includes(job.status)?100:job.total?Math.min(98,Math.round(job.cursor/job.total*98)):0,error:job.error,bookId:`import-${job.id}`,chapters:state?.plan.chapters.length||0,reviewBatches:state?.reviewBatches||0,reviewChapters:state?.reviewChapters||[],inputTokens:job.input_tokens,outputTokens:job.output_tokens,updated:job.updated}}
async function jobById(db:D1Database,id:string){const job=await db.prepare('SELECT * FROM library_import_jobs WHERE id=?').bind(id).first<Job>();if(!job)throw new AgentError('没有找到这项任务。',404);return job}
async function createJob(req:Request,env:Cloudflare.Env,owner:string){
  const input:unknown=await readJson(req);validateInput(input)
  const {db,bucket}=storage(env)
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({owner,primary:input.primary,companion:input.companion}))))).map(x=>x.toString(16).padStart(2,'0')).join('')
  const existing=await db.prepare('SELECT * FROM library_import_jobs WHERE fingerprint=?').bind(fingerprint).first<Job>();if(existing)return json({job:view(existing)})
  const id=crypto.randomUUID(),now=Date.now()
  // Store content privately; metadata creation never publishes a new book.
  await put(bucket,`imports/${id}/input.json`,input)
  try{await db.prepare('INSERT INTO library_import_jobs (id,fingerprint,owner,title,status,created,updated) VALUES (?,?,?,?,?,?,?)').bind(id,fingerprint,owner,input.primary.title,'planning',now,now).run()}
  catch{const found=await db.prepare('SELECT * FROM library_import_jobs WHERE fingerprint=?').bind(fingerprint).first<Job>();if(found)return json({job:view(found)});throw new AgentError('保存上传任务失败，请重试。',503)}
  return json({job:view(await jobById(db,id))},201)
}
async function finalize(db:D1Database,bucket:R2Bucket,job:Job,state:State){
  const chapters:Chapter[]=state.plan.chapters.map((_,i)=>({n:i+1,paras:[]}))
  for(let i=0;i<job.total;i++){
    const result=await fromBucket<{n:number;units:PreparedUnit[]}>(bucket,`imports/${job.id}/chunks/${i}.json`)
    if(!result)throw new AgentError('部分批次尚未保存，已保留进度。',503)
    const chapter=chapters[result.n-1]
    for(const unit of result.units){
      // Paragraph tags are only layout hints. Unit identifiers are monotonic,
      // independent of array sizes and stable after import.
      const last=chapter.paras.at(-1) as (Chapter['paras'][number]&{sourceP?:number})|undefined
      if(!last||last.sourceP!==unit.p)chapter.paras.push({u:[],sourceP:unit.p} as Chapter['paras'][number])
      const para=chapter.paras.at(-1)!
      para.u.push({id:`${chapter.n}.${chapter.paras.length-1}.${para.u.length}`,en:unit.en,zh:unit.zh})
    }
  }
  if(chapters.some(ch=>!ch.paras.length))throw new AgentError('存在空章节，尚未加入书库。',503)
  const id=`import-${job.id}`
  const toc:Toc={title:state.plan.englishTitle,author:state.plan.originalAuthor,chapters:state.plan.chapters.map((p,i)=>({n:i+1,en:p.en,zh:p.zh}))}
  for(const ch of chapters){for(const para of ch.paras)delete (para as unknown as Record<string,unknown>).sourceP;await put(bucket,`library/${id}/ch${String(ch.n).padStart(2,'0')}.json`,ch)}
  await put(bucket,`library/${id}/toc.json`,toc)
  await put(bucket,`library/${id}/review.json`,{reviewBatches:state.reviewBatches||0,chapters:state.reviewChapters||[],notice:'这些批次的 AI 检查发现疑点或未能完成。文字完整性不代表语义匹配准确，发布前请复核。'})
  const metadata:Book={id,title:state.plan.title,englishTitle:state.plan.englishTitle,author:state.plan.author,originalAuthor:state.plan.originalAuthor,description:state.plan.description,chapters:chapters.length,languages:state.paired?['英文原著','中文译本']:state.language==='en'?['英文原著','AI 中译']:['AI 英译','中文原著'],addedAt:new Date().toISOString().slice(0,10),color:'#463936',cover:{src:`/api/library/books/${id}/cover.svg`,alt:`《${state.plan.title}》代码生成的书名封面`},dataBase:`/api/library/books/${id}`}
  await db.batch([
    db.prepare('INSERT INTO library_books (id,job_id,metadata,status,created) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata').bind(id,job.id,JSON.stringify(metadata),'draft',Date.now()),
    db.prepare('UPDATE library_import_jobs SET status=?,lease_until=0,error=NULL,updated=? WHERE id=?').bind('draft',Date.now(),job.id),
  ])
}
async function step(env:Cloudflare.Env,id:string){
  const {db,bucket}=storage(env);let job=await jobById(db,id)
  if(['draft','published'].includes(job.status))return json({job:view(job)})
  const lock=await db.prepare('UPDATE library_import_jobs SET lease_until=?,status=?,error=NULL WHERE id=? AND lease_until<? AND cursor=?').bind(Date.now()+180000,'processing',id,Date.now(),job.cursor).run()
  if(!lock.meta.changes)throw new AgentError('上一批仍在处理中，请稍后刷新。',409)
  job=await jobById(db,id)
  try{
    if(!job.metadata){
      const input=await fromBucket<ImportInput>(bucket,`imports/${id}/input.json`);if(!input)throw new AgentError('找不到上传内容。',404)
      const result=await fromBucket<{plan:ImportPlan;usage:Usage}>(bucket,`imports/${id}/plan.json`)||await planImport(env.INCEPTION_API_KEY||'',input)
      await put(bucket,`imports/${id}/plan.json`,{plan:result.plan,usage:result.usage})
      const tasks=makeTasks(input,result.plan);if(!tasks.length)throw new AgentError('没有识别到可处理的正文。')
      await put(bucket,`imports/${id}/tasks.json`,tasks)
      const state:State={plan:result.plan,paired:!!input.companion,language:input.primary.language}
      await db.prepare('UPDATE library_import_jobs SET title=?,metadata=?,total=?,input_tokens=input_tokens+?,output_tokens=output_tokens+?,lease_until=0,updated=? WHERE id=?').bind(result.plan.title,JSON.stringify(state),tasks.length,result.usage.prompt_tokens||0,result.usage.completion_tokens||0,Date.now(),id).run()
    }else if(job.cursor<job.total){
      const tasks=await fromBucket<ImportTask[]>(bucket,`imports/${id}/tasks.json`);const task=tasks?.[job.cursor];if(!task)throw new AgentError('处理任务缺失，请联系书库主人。',503)
      const result=await fromBucket<{n:number;units:PreparedUnit[];usage:Usage;method?:string}>(bucket,`imports/${id}/chunks/${job.cursor}.json`)||{n:task.n,...await processTask(env.INCEPTION_API_KEY||'',task)}
      await put(bucket,`imports/${id}/chunks/${job.cursor}.json`,result)
      const state=JSON.parse(job.metadata) as State
      if(result.method==='length'){state.reviewBatches=(state.reviewBatches||0)+1;state.reviewChapters=[...new Set([...(state.reviewChapters||[]),task.n])]}
      await db.prepare('UPDATE library_import_jobs SET cursor=cursor+1,metadata=?,input_tokens=input_tokens+?,output_tokens=output_tokens+?,lease_until=0,updated=? WHERE id=? AND cursor=?').bind(JSON.stringify(state),result.usage.prompt_tokens||0,result.usage.completion_tokens||0,Date.now(),id,job.cursor).run()
    }else await finalize(db,bucket,job,JSON.parse(job.metadata) as State)
    return json({job:view(await jobById(db,id))})
  }catch(error){
    const message=error instanceof Error?error.message:'当前批次处理失败，进度已保留。'
    await db.prepare('UPDATE library_import_jobs SET status=?,error=?,lease_until=0,updated=? WHERE id=?').bind('paused',message.slice(0,300),Date.now(),id).run()
    throw error
  }
}
const escapeXml=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!))
export function coverSvg(book:Book){const title=escapeXml(book.title.slice(0,30)),author=escapeXml(book.originalAuthor.slice(0,50)),en=escapeXml(book.englishTitle.slice(0,45));return `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1152" viewBox="0 0 768 1152"><defs><pattern id="cloth" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 0h5M0 0v5" stroke="#fff" stroke-opacity=".045" stroke-width="1"/></pattern></defs><rect width="768" height="1152" fill="#463936"/><rect width="768" height="1152" fill="url(#cloth)"/><path d="M25 0v1152" stroke="#211c1b" stroke-width="8"/><rect x="68" y="68" width="632" height="1016" rx="4" stroke="#c8bba4" stroke-opacity=".45" fill="none"/><path d="M210 780V560a174 174 0 0 1 348 0v220M210 780h348M250 780V565a134 134 0 0 1 268 0v215" stroke="#c8bba4" stroke-opacity=".5" stroke-width="2" fill="none"/><text x="384" y="234" text-anchor="middle" fill="#eee4d5" font-size="${book.title.length>8?34:60}" font-family="serif" letter-spacing="7">${title}</text><text x="384" y="310" text-anchor="middle" fill="#d3c7b8" font-size="24" font-family="Georgia,serif">${en}</text><text x="384" y="960" text-anchor="middle" fill="#e4d8c6" font-size="18" font-family="serif" letter-spacing="3">${author}</text><text x="384" y="1024" text-anchor="middle" fill="#baa993" font-size="12" font-family="serif" letter-spacing="5">BETWEEN PAGES</text></svg>`}

export async function libraryRequest(req:Request,env:Cloudflare.Env):Promise<Response>{
  try{
    const url=new URL(req.url),path=url.pathname.replace(/\/$/,'')
    if(req.method==='POST')sameOrigin(req)
    if(path==='/api/ai'&&req.method==='POST')return await readingAi(req,env)
    if(path==='/api/agent/status'&&req.method==='GET'){
      const response=json({configured:!!env.INCEPTION_API_KEY,model:'mercury-3'})
      if(!await uploadOwner(req))response.headers.append('Set-Cookie',newUploadCookie())
      return response
    }
    if(path==='/api/library/books'&&req.method==='GET'){
      if(!env.DB)return json({books:[]})
      const owner=url.searchParams.get('drafts')==='1'?await uploadOwner(req):null
      const query=owner?env.DB.prepare("SELECT * FROM library_books WHERE status='published' OR job_id IN (SELECT id FROM library_import_jobs WHERE owner=?) ORDER BY created DESC").bind(owner):env.DB.prepare("SELECT * FROM library_books WHERE status='published' ORDER BY created DESC")
      const rows=await query.all<StoredBook>();return json({books:rows.results.map(r=>({...JSON.parse(r.metadata),draft:r.status==='draft'}))})
    }
    const asset=path.match(/^\/api\/library\/books\/([a-zA-Z0-9-]{8,100})\/(toc\.json|ch\d+\.json|cover\.svg)$/)
    if(asset&&req.method==='GET'){
      const {db,bucket}=storage(env);const book=await db.prepare('SELECT * FROM library_books WHERE id=?').bind(asset[1]).first<StoredBook>()
      if(!book)throw new AgentError('没有找到这本书。',404)
      if(book.status!=='published'){
        const owner=await uploadOwner(req),job=await jobById(db,book.job_id)
        if(!owner||owner!==job.owner)throw new AgentError('没有找到这本书。',404)
      }
      if(asset[2]==='cover.svg')return new Response(coverSvg(JSON.parse(book.metadata)),{headers:{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}})
      const value=await bucket.get(`library/${book.id}/${asset[2]}`);if(!value)throw new AgentError('章节还没有准备好。',404)
      return new Response(value.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}})
    }
    if(!path.startsWith('/api/agent/'))throw new AgentError('没有这个页面。',404)
    const owner=await requireUploadOwner(req)
    if(path==='/api/agent/check'&&req.method==='POST'){await mercury(env.INCEPTION_API_KEY||'','Return {"ok":true}.',{test:'connection'},{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false});return json({ok:true,model:'mercury-3'})}
    if(path==='/api/agent/jobs'&&req.method==='GET'){const {db}=storage(env);const rows=await db.prepare('SELECT * FROM library_import_jobs WHERE owner=? ORDER BY created DESC LIMIT 50').bind(owner).all<Job>();return json({jobs:rows.results.map(view)})}
    if(path==='/api/agent/jobs'&&req.method==='POST')return await createJob(req,env,owner)
    const route=path.match(/^\/api\/agent\/jobs\/([a-zA-Z0-9-]{8,80})(?:\/(step|publish|export))?$/)
    if(!route)throw new AgentError('没有这个操作。',404)
    const {db,bucket}=storage(env),id=route[1],action=route[2]
    if((await jobById(db,id)).owner!==owner)throw new AgentError('没有找到这项任务。',404)
    if(!action&&req.method==='GET')return json({job:view(await jobById(db,id))})
    if(action==='step'&&req.method==='POST')return await step(env,id)
    if(action==='publish'&&req.method==='POST'){
      const job=await jobById(db,id);if(!['draft','published'].includes(job.status))throw new AgentError('请先完成书籍处理。')
      await db.batch([db.prepare("UPDATE library_books SET status='published' WHERE job_id=?").bind(id),db.prepare("UPDATE library_import_jobs SET status='published',updated=? WHERE id=?").bind(Date.now(),id)])
      return json({job:view(await jobById(db,id))})
    }
    if(action==='export'&&req.method==='GET'){
      const job=await jobById(db,id);if(!['draft','published'].includes(job.status))throw new AgentError('请先完成书籍处理。')
      const bookId=`import-${id}`,toc=await fromBucket<Toc>(bucket,`library/${bookId}/toc.json`);if(!toc)throw new AgentError('书籍数据缺失。',404)
      const chapters:Chapter[]=[];for(const ch of toc.chapters){const value=await fromBucket<Chapter>(bucket,`library/${bookId}/ch${String(ch.n).padStart(2,'0')}.json`);if(!value)throw new AgentError('书籍数据缺失。',404);chapters.push(value)}
      const review=await fromBucket(bucket,`library/${bookId}/review.json`)
      return json({toc,chapters,review})
    }
    throw new AgentError('不支持的操作。',405)
  }catch(error){const message=error instanceof AgentError?error.message:error instanceof Error&&error.message.startsWith('AI ')?error.message:'处理失败，已经保留当前进度。请稍后重试。';return json({error:message},error instanceof AgentError?error.status:500)}
}
