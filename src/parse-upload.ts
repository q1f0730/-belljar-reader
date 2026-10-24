import { unzipSync, strFromU8 } from 'fflate'
import type { ParsedBook, RawChapter } from './import-format'

const tags=(d:Document|Element,name:string)=>Array.from(d.querySelectorAll('*')).filter(e=>e.localName.split(':').at(-1)===name)
const clean=(s:string)=>s.replace(/\s+/g,' ').trim()
function xml(text:string){const d=new DOMParser().parseFromString(text,'application/xml');if(tags(d,'parsererror').length)throw new Error('EPUB 目录损坏，无法解析。');return d}
function resolve(base:string,href:string){const a=base.split('/').slice(0,-1);for(const p of decodeURIComponent(href.split('#')[0]).split('/')){if(p==='..')a.pop();else if(p&&p!=='.')a.push(p)}return a.join('/')}

export function parseEpub(bytes: Uint8Array): ParsedBook {
  if(bytes.length>20*1024*1024)throw new Error('EPUB 请控制在 20 MB 以内。')
  let expanded=0
  const files=unzipSync(bytes,{filter:f=>{
    if(!/\.(xml|opf|xhtml|html|htm)$/i.test(f.name))return false
    expanded+=f.originalSize
    if(expanded>30*1024*1024||f.originalSize>5*1024*1024)throw new Error('EPUB 解压内容过大。')
    return true
  }})
  const read=(p:string)=>{if(!files[p])throw new Error('EPUB 缺少文件：'+p);return strFromU8(files[p])}
  const container=xml(read('META-INF/container.xml'))
  const root=tags(container,'rootfile')[0]?.getAttribute('full-path');if(!root)throw new Error('找不到 EPUB 书籍目录。')
  const opf=xml(read(root));const title=clean(tags(opf,'title')[0]?.textContent||'未命名').replace(/【.*$/,'')
  const author=clean(tags(opf,'creator')[0]?.textContent||'作者待确认')
  const language=/^zh/i.test(tags(opf,'language')[0]?.textContent||'')?'zh':'en'
  const manifest=new Map(tags(opf,'item').map(e=>[e.getAttribute('id'),e.getAttribute('href')||'']))
  const chapters:RawChapter[]=[]
  for(const entry of tags(opf,'itemref')){
    const href=manifest.get(entry.getAttribute('idref'));if(!href)continue
    const doc=new DOMParser().parseFromString(read(resolve(root,href)),'text/html')
    for(const el of Array.from(doc.querySelectorAll('script,style,nav,svg')))el.remove()
    const head=Array.from(doc.querySelectorAll('h1,h2,h3')).map(e=>clean(e.textContent||'')).filter(Boolean)
    const ps=Array.from(doc.querySelectorAll('p')).map(e=>clean(e.textContent||'')).filter(Boolean)
    // Keep paragraph text untouched; chapter headings are represented in the TOC.
    if(ps.length)chapters.push({title:head.slice(0,2).join(' · ')||ps[0].slice(0,100),paragraphs:ps})
  }
  if(!chapters.length)throw new Error('没有找到可读取的文字。图片版或加密 EPUB 暂不支持。')
  return {title,author,language,chapters}
}

export async function parseUpload(file: File): Promise<ParsedBook> {
  if(/\.epub$/i.test(file.name))return parseEpub(new Uint8Array(await file.arrayBuffer()))
  if(!/\.txt$/i.test(file.name))throw new Error('当前支持 EPUB 或 UTF-8 TXT。')
  if(file.size>5*1024*1024)throw new Error('TXT 请控制在 5 MB 以内。')
  const text=(await file.text()).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')
  if(text.includes('\uFFFD'))throw new Error('TXT 需要使用 UTF-8 编码。')
  const paragraphs=text.split(/\n\s*\n|\n/).map(clean).filter(Boolean)
  const language=(text.match(/[\u4e00-\u9fff]/g)?.length||0)>text.length*.15?'zh':'en'
  const chapters:RawChapter[]=[];let ch:RawChapter={title:'Chapter 1',paragraphs:[]}
  for(const p of paragraphs){if(/^(?:chapter\s+(?:\d+|[ivxlcdm]+)|第[一二三四五六七八九十百零\d]+[章节卷部])(?:\s|[：:、.．]|$)/i.test(p)&&p.length<100){if(ch.paragraphs.length)chapters.push(ch);ch={title:p,paragraphs:[]}}else ch.paragraphs.push(p)}
  if(ch.paragraphs.length)chapters.push(ch)
  return {title:file.name.replace(/\.txt$/i,''),author:'作者待确认',language,chapters}
}
