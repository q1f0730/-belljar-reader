import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, FileText, Pause, Play, Plus, UploadSimple } from '@phosphor-icons/react'
import { strToU8, zipSync } from 'fflate'
import type { ImportInput } from './import-format'
import { parseUpload } from './parse-upload'
import './import-agent.css'

type Job={id:string;title:string;status:string;cursor:number;total:number;percent:number;error?:string;bookId:string;chapters:number;reviewBatches?:number;reviewChapters?:number[]}
type Status={configured:boolean;model:string}
export async function agentApi<T>(path:string,post?:unknown):Promise<T>{const response=await fetch(path,{...(post!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(post)}:{}),cache:'no-store'});const data=await response.json() as T&{error?:string};if(!response.ok)throw new Error(data.error||'暂时无法连接书库。');return data}
const id=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('')

export default function ImportAgent({onClose,onOpen}:{onClose():void;onOpen(id:string):void}){
  const [status,setStatus]=useState<Status|null>(null),[jobs,setJobs]=useState<Job[]>([])
  const [primary,setPrimary]=useState<File|null>(null),[companion,setCompanion]=useState<File|null>(null)
  const [loading,setLoading]=useState(false),[active,setActive]=useState<string|null>(null),[message,setMessage]=useState(''),[error,setError]=useState('')
  const working=useRef(false)
  const refresh=async()=>{const r=await agentApi<{jobs:Job[]}>('/api/agent/jobs');setJobs(r.jobs)}
  useEffect(()=>{let alive=true;agentApi<Status>('/api/agent/status').then(s=>{if(!alive)return;setStatus(s);refresh().catch(e=>setError(e.message))}).catch(e=>setError(e.message));return()=>{alive=false;working.current=false}},[])
  const update=(job:Job)=>setJobs(list=>[job,...list.filter(j=>j.id!==job.id)].sort((a,b)=>b.id===job.id?1:a.id===job.id?-1:0))
  const run=async(jobId:string)=>{
    if(working.current)return
    working.current=true;setActive(jobId);setError('');setMessage('')
    try{while(working.current){const r=await agentApi<{job:Job}>(`/api/agent/jobs/${jobId}/step`,{});update(r.job);if(['draft','published'].includes(r.job.status)){window.dispatchEvent(new Event('library-updated'));break}}}
    catch(e){setError(e instanceof Error?e.message:'处理暂时中断。');await refresh().catch(()=>{})}
    finally{working.current=false;setActive(null)}
  }
  const start=async()=>{
    if(!primary)return
    setLoading(true);setError('');setMessage('正在读取书籍文件…')
    try{
      let first=await parseUpload(primary),second=companion?await parseUpload(companion):undefined
      if(second&&first.language==='zh'&&second.language==='en')[first,second]=[second,first]
      const input:ImportInput={primary:first,companion:second,requestId:id()}
      setMessage('正在保存上传内容…')
      const r=await agentApi<{job:Job}>('/api/agent/jobs',input);update(r.job);setPrimary(null);setCompanion(null);setMessage('');await run(r.job.id)
    }catch(e){setError(e instanceof Error?e.message:'读取失败，请检查文件。')}
    finally{setLoading(false);setMessage('')}
  }
  const publish=async(job:Job)=>{setError('');try{const r=await agentApi<{job:Job}>(`/api/agent/jobs/${job.id}/publish`,{});update(r.job);window.dispatchEvent(new Event('library-updated'))}catch(e){setError((e as Error).message)}}
  const download=async(job:Job)=>{
    setError('')
    try{const b=await agentApi<{toc:unknown;chapters:{n:number}[];review?:unknown}>(`/api/agent/jobs/${job.id}/export`),files:Record<string,Uint8Array>={'book/toc.json':strToU8(JSON.stringify(b.toc))};if(b.review)files['book/review.json']=strToU8(JSON.stringify(b.review));for(const ch of b.chapters)files[`book/ch${String(ch.n).padStart(2,'0')}.json`]=strToU8(JSON.stringify(ch));const bytes=zipSync(files),url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download=`${job.title}-网页书.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError((e as Error).message)}
  }
  return <div className="library import-library"><div className="library-sheet import-sheet">
    <header className="import-header"><button onClick={onClose}><ArrowLeft/>返回书库</button><span>阅间 · 上书 Agent</span><span className="import-model"><i/>{status?.configured?'Mercury‑3 已配置':'连接状态确认中'}</span></header>
    <main className="import-main"><p className="lib-eyebrow">A NEW BOOK, A NEW WORLD</p><h1>把一本书，<br/><span>变成你的网页书。</span></h1><p className="import-lead">上传原著。剩下的章节整理、双语对齐和阅读排版，交给 Agent。</p>
      {error&&<div className="import-alert" role="alert">{error}</div>}
      {!status&&!error&&<p className="import-muted">正在连接上书服务…</p>}
      {status&&<>
        <section className="import-upload" aria-label="上传书籍"><div className="import-upload-title"><span><UploadSimple size={21}/>添加一本书</span><small>EPUB / UTF-8 TXT · 每个文件不超过 20 MB</small></div>
          <div className="import-files"><label><input type="file" accept=".epub,.txt" disabled={loading||!!active} onChange={e=>setPrimary(e.target.files?.[0]||null)} aria-label="上传原著"/><FileText size={29}/><b>{primary?.name||'选择原著'}</b><span>英文或中文，自动识别</span></label><span className="import-plus"><Plus/></span><label><input type="file" accept=".epub,.txt" disabled={loading||!!active} onChange={e=>setCompanion(e.target.files?.[0]||null)} aria-label="上传对照译本"/><FileText size={29}/><b>{companion?.name||'添加对照译本'}</b><span>选填 · 有译本就直接对齐</span></label></div>
          <div className="import-upload-bottom"><p><b>有两个版本？</b>保留原著和现有译文，不重新翻译。<br/>只有一个版本时，Agent 会生成另一种语言。</p><button className="lib-primary" disabled={!primary||loading||!!active||!status.configured} onClick={start}>{loading?'正在处理':'开始整理'}<ArrowRight/></button></div>
          {message&&<p className="import-message" role="status">{message}</p>}
        </section>
        <div className="import-notes"><span><Check/>免登录，直接上传</span><span><Check/>完成后先生成草稿</span><span><Check/>书籍正文不进入 GitHub</span></div>
        <section className="import-tasks" aria-label="处理任务"><div className="import-section-title"><h2>你的上书任务</h2><button onClick={()=>refresh().catch(e=>setError(e.message))}>刷新进度</button></div>
          {!jobs.length&&<div className="import-no-jobs">还没有上传任务。选一本你想读的书开始。</div>}
          {jobs.map(job=><article className="import-job" key={job.id}><div className="import-job-top"><div><span className={'import-badge '+(['draft','published'].includes(job.status)?'complete':'')}>{job.status==='published'?'已加入书库':job.status==='draft'?'草稿已就绪':active===job.id?'正在处理':job.status==='paused'?'等待继续':'等待处理'}</span><h3>{job.title}</h3><p>{job.chapters?`${job.chapters} 个正文章节 · `:''}{job.total?`已完成 ${job.cursor} / ${job.total} 批`:'识别目录、匹配两个版本'}{active===job.id&&job.cursor===job.total&&job.total>0?' · 正在生成网页书':''}</p></div><b>{job.percent}%</b></div><div className="import-progress"><i style={{width:`${job.percent}%`}}/></div>{!!job.reviewBatches&&<p className="import-review-note">有 {job.reviewBatches} 批需要复核（AI 检查发现疑点或未能完成）。建议复核第 {job.reviewChapters?.join("、")} 章。</p>}{job.error&&<p className="import-job-error">{job.error}</p>}
            <div className="import-job-actions">{['draft','published'].includes(job.status)?<><button onClick={()=>onOpen(job.bookId)}>预览网页书<ArrowRight/></button><button onClick={()=>download(job)}>下载网页书数据</button>{job.status==='draft'&&<><span>加入后，所有访客都能阅读。</span><button className="import-publish" onClick={()=>publish(job)}>加入公开书库</button></>}</>:active===job.id?<><span>可暂停。关闭页面后，回来继续处理。</span><button onClick={()=>{working.current=false;setMessage('当前批次完成后暂停。')}}><Pause/>暂停</button></>:<button disabled={!!active||loading} onClick={()=>run(job.id)}><Play/>{job.cursor?'继续处理':'开始处理'}</button>}</div>
          </article>)}
        </section>
      </>}
      <footer className="import-footer">书名封面由代码生成。整本书分批处理，请保持页面打开；关闭后可在同一浏览器继续。清除此站点的 Cookie 后，将无法找回未发布的任务，请及时下载备份。</footer>
    </main>
  </div></div>
}
