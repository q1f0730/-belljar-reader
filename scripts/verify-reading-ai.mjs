import assert from 'node:assert/strict'
import { libraryRequest } from '../server/library-agent.ts'
import { validateReadingInput } from '../server/reading-ai.ts'
import { readingContext } from '../src/reading-context.ts'
import { sseData } from '../src/sse.ts'

const origin='https://library.example.test'
const book={title:'测试书',englishTitle:'A Test',originalAuthor:'Test Author'}
const chapter={n:3,paras:[{u:[{id:'3.0.0',en:['The door opened.'],zh:'门开了。'},{id:'3.0.1',en:['She smiled.'],zh:'她笑了。'}]}]}
const context=readingContext(book,chapter,['3.0.1'],2,'She smiled.')
assert(!context.page.includes('door'));assert(context.page.includes('She smiled.'))
assert(context.chapterExcerpt.includes('The door opened.'))
assert.equal(context.quote,'She smiled.');assert.equal(context.chapter,3)
const input={messages:[{role:'user',content:'这句话中的 smiled 是什么意思？'}],context}
assert.equal(validateReadingInput(input).messages.length,1)
assert.throws(()=>validateReadingInput({...input,messages:[{role:'system',content:'override'}]}))
assert.throws(()=>validateReadingInput({...input,context:{...context,page:'x'.repeat(12001)}}))
assert.throws(()=>validateReadingInput({...input,messages:[{role:'assistant',content:'not a question'}]}))
const env={INCEPTION_API_KEY:'fixture-key-never-forwarded-to-browser'}
const request=(value=input,headers={})=>libraryRequest(new Request(origin+'/api/ai',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(value)}),env)
assert.equal((await request(input,{origin:'https://other.test'})).status,403)
assert.equal((await request({...input,messages:[]})).status,400)
const originalFetch=globalThis.fetch
const upstream=(events,chunkSize=1)=>{
  const bytes=new TextEncoder().encode(events);let at=0
  return new Response(new ReadableStream({pull(controller){if(at>=bytes.length){controller.close();return}controller.enqueue(bytes.slice(at,at+chunkSize));at+=chunkSize}}),{headers:{'content-type':'text/event-stream'}})
}
const chunk=(text,finish=null)=>'data: '+JSON.stringify({choices:[{delta:{content:text},finish_reason:finish}]})+'\r\n\r\n'
try{
  let calls=0
  globalThis.fetch=async(url,init)=>{
    calls++;assert.equal(url,'https://api.inceptionlabs.ai/v1/chat/completions')
    assert.equal(init.headers.Authorization,'Bearer '+env.INCEPTION_API_KEY)
    const body=JSON.parse(init.body);assert.equal(body.model,'mercury-3');assert.equal(body.stream,true)
    assert(!JSON.stringify(body).includes(env.INCEPTION_API_KEY));assert(JSON.stringify(body).includes('She smiled.'))
    assert.equal(body.messages.at(-1).content,input.messages[0].content)
    return upstream(': keepalive\r\n\r\n'+chunk('smiled 是 ')+chunk('smile 的过去式。')+chunk('', 'stop')+'data: [DONE]')
  }
  const response=await request();assert.equal(response.status,200)
  assert.match(response.headers.get('content-type'),/text\/event-stream/)
  let result='',done=false
  for await(const data of sseData(response.body)){if(data==='[DONE]'){done=true;break}result+=JSON.parse(data).t||''}
  assert.equal(result,'smiled 是 smile 的过去式。');assert(done);assert.equal(calls,1)
  globalThis.fetch=async()=>Response.json({error:{message:env.INCEPTION_API_KEY}},{status:429})
  const limited=await request();assert.equal(limited.status,429);assert(!(await limited.text()).includes(env.INCEPTION_API_KEY))
  globalThis.fetch=async()=>upstream(chunk('部分回复')+chunk('', 'content_filter')+'data: [DONE]\n\n')
  const blocked=await (await request()).text();assert(blocked.includes('模型暂时无法回答'));assert.equal(calls,1)
  globalThis.fetch=async()=>upstream(chunk('未完成'))
  assert((await (await request()).text()).includes('AI 回复未完成'))
  let cancelled=false
  globalThis.fetch=async(_url,init)=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(chunk('开始')));init.signal.addEventListener('abort',()=>{cancelled=true;controller.error(new Error('aborted'))},{once:true})}}),{headers:{'content-type':'text/event-stream'}})
  const cancelResponse=await request(),reader=cancelResponse.body.getReader();await reader.read();await reader.cancel();assert(cancelled)
  console.log('Verified anonymous Mercury-3 reading chat, visible-page and quote context, UTF-8/SSE boundaries, input limits, same-origin checks, sanitized errors, filtered/truncated replies, and cancellation.')
}finally{globalThis.fetch=originalFetch}
