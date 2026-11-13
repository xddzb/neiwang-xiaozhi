import * as fs from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const ROUTE='/opgview/socket.io/';
export function normalizeToken(value){
 if(typeof value!=='string'||value.length>16384)throw Error('isu_token_invalid');
 const token=value.replace(/^opgview-/,'');
 if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Error('isu_token_invalid');
 let payload;try{payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'))}catch{throw Error('isu_token_invalid')}
 // This is an expiry check, not JWT signature verification. The ISU server authenticates it.
 if(!Number.isFinite(payload.exp)||payload.exp*1000<=Date.now())throw Error('isu_credentials_expired');
 return {token,expires:payload.exp*1000};
}
function cookiePair(cookies){
 const read=name=>{const values=[...new Set(cookies.filter(c=>c.name===name).map(c=>c.value))];if(values.length!==1||!values[0]||/[\r\n;\x00]/.test(values[0]))throw Error('isu_browser_login_required');return values[0]};
 return {baseCookie:'OPGview8088='+read('OPGview8088'),sidCookie:read('sid')};
}
const fingerprint=c=>createHash('sha256').update(JSON.stringify(c)).digest('hex');
export class IsuSession {
 constructor(root){this.root=root;this.records=new Map();this.rejected=new Set();this.pending=new Set();this.sequence=0;this.attached=new WeakSet()}
 async config(){
  let source,c;try{
   source=JSON.parse(await fs.readFile(join(this.root,'extensions/apis/sources/isu-instruments.json'),'utf8'));
   const id=source.connection||'weekly-isu';if(!/^[A-Za-z0-9_-]{1,64}$/.test(id))throw Error();
   c=JSON.parse(await fs.readFile(join(this.root,'extensions/apis/connections',id+'.json'),'utf8'));
  }catch{throw Error('isu_browser_not_configured')}
  let u;try{u=new URL(c.base_url)}catch{throw Error('isu_browser_not_configured')}
  if(source.enabled!==true||source.read_only!==true||source.transport!=='isu-engineio3'||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||c.browser_session?.driver!=='playwright'||!c.browser_session.allowed_origins?.includes(u.origin))throw Error('isu_browser_not_configured');
  if(c.verify_tls!==undefined&&typeof c.verify_tls!=='boolean')throw Error('isu_browser_not_configured');
  let pageURL;
  if(c.browser_session.isu_realtime_url){try{const p=new URL(c.browser_session.isu_realtime_url);if(p.origin!==u.origin||p.username||p.password||p.pathname===ROUTE||[...p.searchParams.keys()].some(k=>/token|ticket|secret|password|authorization|session|^code$/i.test(k))||/token|ticket|secret|password|authorization/i.test(p.hash))throw Error();pageURL=p.href}catch{throw Error('isu_browser_page_not_configured')}}
  return {origin:u.origin,verify_tls:c.verify_tls===true,pageURL};
 }
 attach(context){
  if(this.attached.has(context))return;this.attached.add(context);
  const enqueue=job=>{const promise=job.catch(()=>{});this.pending.add(promise);promise.finally(()=>this.pending.delete(promise))};
  const pageEvents=page=>{page.on('websocket',socket=>enqueue(this.observe(socket.url(),page,context)));page.on('close',()=>this.records.delete(page))};
  for(const page of context.pages())pageEvents(page);context.on('page',pageEvents);
  context.on('request',request=>{let page;try{page=request.frame().page()}catch{return}enqueue(this.observe(request.url(),page,context))});
  context.on('response',response=>{if([401,403].includes(response.status()))enqueue(this.rejectRequest(response.url()))});
  context.on('close',()=>{this.records.clear();this.rejected.clear()});
 }
 async observe(value,page,context){
  // Discard every unrelated request before reading any token or deployment configuration.
  let url;try{url=new URL(value)}catch{return}
  if(!['https:','wss:'].includes(url.protocol)||url.pathname!==ROUTE||url.username||url.password||url.searchParams.get('EIO')!=='3'||!['polling','websocket'].includes(url.searchParams.get('transport')))return;
  const serial=++this.sequence,c=await this.config(),target=url.protocol==='wss:'?'https://'+url.host:url.origin;
  if(target!==c.origin||new URL(page.url()).origin!==c.origin)return;
  if(url.searchParams.getAll('token').length!==1)return;
  let token;try{token=normalizeToken(url.searchParams.get('token'))}catch{this.records.delete(page);return}
  const cookies=cookiePair(await context.cookies(c.origin+ROUTE));
  if(this.rejected.has(fingerprint(token.token)))return;
  if(page.isClosed?.())return;
  if((this.records.get(page)?.serial||0)>serial)return;
  this.records.set(page,{...token,origin:c.origin,cookieHash:fingerprint(cookies),serial});
  const p=new URL(page.url());if(p.pathname!==ROUTE&&!p.username&&!p.password&&![...p.searchParams.keys()].some(k=>/token|ticket|secret|password|authorization|session|^code$/i.test(k))&&!/token|ticket|secret|password|authorization/i.test(p.hash))this.lastPageURL=p.href;
 }
 async rejectRequest(value){
  let url;try{url=new URL(value)}catch{return}
  const c=await this.config();if(url.origin!==c.origin||url.pathname!==ROUTE)return;
  const token=url.searchParams.get('token')?.replace(/^opgview-/,'');this.invalidate(token);
 }
 invalidate(token){if(typeof token!=='string')return;this.rejected.add(fingerprint(token));for(const [page,row]of this.records)if(row.token===token)this.records.delete(page)}
 async refresh(context,{timeout=25000,createPage=()=>context.newPage()}={}){
  await Promise.all([...this.pending]);const c=await this.config();
  const pages=context.pages().filter(p=>{try{return !p.isClosed()&&new URL(p.url()).origin===c.origin}catch{return false}});
  const recorded=pages.filter(p=>this.records.has(p));
  if(recorded.length>1&&new Set(recorded.map(p=>this.records.get(p).token)).size>1)throw Error('isu_browser_accounts_ambiguous');
  const target=c.pageURL||(this.lastPageURL&&new URL(this.lastPageURL).origin===c.origin?this.lastPageURL:null);
  let page=recorded.sort((a,b)=>this.records.get(b).serial-this.records.get(a).serial)[0]||pages.find(p=>target&&p.url()===target);
  if(!page&&!target)throw Error('isu_browser_page_not_configured');
  const before=page?this.records.get(page)?.token:undefined,created=!page;
  if(!page)page=await createPage();
  let start=this.sequence;const deadline=Date.now()+timeout;this.records.delete(page);
  // A real top-level navigation must begin before a capture may satisfy this refresh.
  let navigated=false;const onNavigation=frame=>{if(frame===page.mainFrame()){navigated=true;start=this.sequence;this.records.delete(page)}};page.on('framenavigated',onNavigation);
  try{
   try{if(created)await page.goto(target,{waitUntil:'domcontentloaded',timeout:Math.min(timeout,10000)});else await page.reload({waitUntil:'domcontentloaded',timeout:Math.min(timeout,10000)})}catch{if(!navigated)throw Error('isu_browser_navigation_failed')}
   while(Date.now()<deadline){
    if(page.isClosed())throw Error('isu_browser_page_closed');
    await Promise.all([...this.pending]);const row=this.records.get(page);
    if(navigated&&row&&row.serial>start){
     const result=await this.credentials(context);
     return {...result,refresh:{action:created?'opened':'reloaded',captured:true,token_changed:before===undefined?null:before!==result.token}};
    }
    await new Promise(r=>setTimeout(r,200));
   }
   throw Error('isu_browser_refresh_timeout');
  }finally{page.off('framenavigated',onNavigation)}
 }
 async credentials(context){
  await Promise.all([...this.pending]);const c=await this.config();
  const cookies=cookiePair(await context.cookies(c.origin+ROUTE)),hash=fingerprint(cookies),tokens=new Map();
  for(const [page,row]of this.records){
   let same=false;try{same=new URL(page.url()).origin===c.origin}catch{}
   if(!same||row.origin!==c.origin||row.expires<=Date.now()||row.cookieHash!==hash||page.isClosed?.()){this.records.delete(page);continue}
   tokens.set(row.token,row);
  }
  if(tokens.size>1)throw Error('isu_browser_accounts_ambiguous');
  if(!tokens.size)throw Error('isu_browser_token_pending');
  return {base_url:c.origin,token:tokens.keys().next().value,...cookies,verify_tls:c.verify_tls};
 }
}
