'use strict';
// Read-only ISU Engine.IO v3 snapshot adapter. Credentials never enter tool output.
const https=require('node:https');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const spec={id:'isu-instruments',enabled:true,description:'ISU 智慧调试平台仪表当前值（只读快照，不使用 RAG 缓存）',
 parameters:{points:{type:'array',required:true,description:'1–20 个点名；子串匹配，结果必须核对 PN/GN'},limit:{type:'integer',default:50,minimum:1,maximum:50}},
 response_notes:'AV 数值、EU 单位、DS 原始状态、TM 原始采样时间；保留 PN/GN/ED。匹配不唯一不得冒充指定仪表。truncated 表示尚有更多匹配。'};
function frames(body){
 const out=[];let i=0;
 while(i<body.length){const c=body.indexOf(':',i);if(c<0||!/^\d+$/.test(body.slice(i,c)))throw Error('invalid_frame');
 const n=Number(body.slice(i,c));if(n<1||c+1+n>body.length)throw Error('invalid_frame');out.push(body.slice(c+1,c+1+n));i=c+1+n;}
 return out;
}
class Client {
 constructor(creds,signal,request){this.creds=creds;this.signal=signal;this.request=request||https.request;this.origin=new URL(creds.base_url);this.sid='';this.pending=new Set();}
 close(){for(const r of this.pending)r.destroy();this.pending.clear();}
 req(method,packet){
  if(this.signal?.aborted)return Promise.reject(Error('cancelled'));
  const q=new URLSearchParams({token:this.creds.token.replace(/^opgview-/,''),preview:'false',EIO:'3',transport:'polling',t:String(Date.now())});
  if(this.sid)q.set('sid',this.sid);
  const body=packet==null?null:packet.length+':'+packet;
  return new Promise((resolve,reject)=>{
   const headers={Accept:'*/*',Cookie:this.creds.baseCookie+'; sid='+this.creds.sidCookie,Referer:new URL('/opgview/dataView',this.origin).href,Origin:this.origin.origin};
   if(body!=null){headers['Content-Type']='text/plain;charset=UTF-8';headers['Content-Length']=Buffer.byteLength(body);}
   const r=this.request({hostname:this.origin.hostname,port:this.origin.port||443,path:'/opgview/socket.io/?'+q,method,headers,rejectUnauthorized:this.creds.verify_tls!==false},res=>{
    let size=0;const chunks=[];
    res.on('data',b=>{size+=b.length;if(size>2*1024*1024)r.destroy(Error('response_too_large'));else chunks.push(b);});
    res.on('error',()=>reject(Error('transport_error')));
    res.on('end',()=>{if(res.statusCode===401||res.statusCode===403)return reject(Error('auth_required'));
     if(res.statusCode!==200)return reject(Error('http_'+res.statusCode));
     try{
      let b=Buffer.concat(chunks);const enc=res.headers['content-encoding'];
      const decode={gzip:zlib.gunzipSync,deflate:zlib.inflateSync,br:zlib.brotliDecompressSync}[enc];
      if(enc&&enc!=='identity'&&!decode)throw Error();
      if(decode)b=decode(b,{maxOutputLength:2*1024*1024});
      resolve(b.toString('utf8'));
     }catch{reject(Error('invalid_response'));}});
   });
   this.pending.add(r);const abort=()=>r.destroy(Error('cancelled'));this.signal?.addEventListener('abort',abort,{once:true});
   r.on('close',()=>{this.pending.delete(r);this.signal?.removeEventListener('abort',abort);});
   r.on('error',e=>reject(Error(e.message==='cancelled'?'cancelled':e.code==='SELF_SIGNED_CERT_IN_CHAIN'||e.code==='DEPTH_ZERO_SELF_SIGNED_CERT'?'certificate_error':'transport_error')));
   r.setTimeout(10000,()=>r.destroy(Error('timeout')));r.end(body);
  });
 }
 async connect(){
  const open=frames(await this.req('GET')).find(f=>f[0]==='0');
  if(!open)throw Error('invalid_handshake');
  this.sid=JSON.parse(open.slice(1)).sid;if(typeof this.sid!=='string'||!this.sid)throw Error('invalid_handshake');
  await this.req('POST','40');const ack=frames(await this.req('GET'));
  if(ack.some(f=>f.startsWith('44')))throw Error('auth_required');
  if(!ack.includes('40'))throw Error('invalid_handshake');
 }
 async query(pointName,limit){
  // EIO3 clients send ping; queries are sequential to avoid ambiguous CB correlation.
  await this.req('POST','2');
  await this.req('POST','42'+JSON.stringify(['dataView/getPointInfo',{groupId:'',limit,offset:0,pointNode:'',pointType:'',statusValue:'',pointName,pointDesc:'',sort:'',order:''}]));
  for(let i=0;i<5;i++){
   for(const f of frames(await this.req('GET'))){
    if(f.startsWith('44')||f==='1'||f==='41')throw Error('auth_required');
    if(f.startsWith('42[')){const [event,data]=JSON.parse(f.slice(2));
     if(event==='dataView/getPointInfoCB'){
      if(!data||!Array.isArray(data.rows)||!Number.isFinite(Number(data.total)))throw Error('invalid_response');
      return {query:pointName,total:Number(data.total),truncated:Number(data.total)>data.rows.length,rows:data.rows.map(row=>Object.fromEntries(['ID','PN','GN','ED','RT','AV','EU','KR','DS','TM'].filter(k=>k in row).map(k=>[k,row[k]])))};
     }}
   }
  }throw Error('response_timeout');
 }
}
function load(root){
 const file=path.join(process.env.NEIWANG_DATA_DIR||path.join(root,'data'),'config/isu-instruments.json');
 if(!fs.existsSync(file))throw Error('isu_credentials_missing');
 const c=JSON.parse(fs.readFileSync(file,'utf8'));
 // Older credentials did not carry an endpoint. Reuse the private deployment
 // connection definition; never embed an organization's address in source.
 if(!c.base_url){
  try{c.base_url=JSON.parse(fs.readFileSync(path.join(root,'extensions/apis/connections/weekly-isu.json'),'utf8')).base_url}catch{throw Error('isu_endpoint_missing')}
 }
 let u;try{u=new URL(c.base_url)}catch{throw Error('isu_endpoint_invalid')}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('isu_endpoint_invalid');
 for(const k of ['token','baseCookie','sidCookie'])if(typeof c[k]!=='string'||!c[k]||/[\r\n]/.test(c[k]))throw Error('isu_credentials_invalid');
 if(!c.baseCookie.startsWith('OPGview8088=')||c.baseCookie.includes(';'))throw Error('isu_credentials_invalid');
 if(c.verify_tls!==undefined&&typeof c.verify_tls!=='boolean')throw Error('isu_credentials_invalid');
 try{const jwt=JSON.parse(Buffer.from(c.token.replace(/^opgview-/, '').split('.')[1],'base64url'));if(jwt.exp&&jwt.exp*1000<=Date.now())throw Error('expired');}catch(e){if(e.message==='expired')throw Error('isu_credentials_expired');}
 return c;
}
async function execute(args,exec,root,workspace){
 if(args.operation==='describe')return {ok:true,source:spec.id,...spec};
 let client,timer;
 try{
  const c=load(root);
  if(args.operation==='session-check')return {ok:true,status:'credentials_present',note:'仅本机配置检查，尚未验证服务端登录。'};
  if(args.operation!=='query')throw Error('unsupported_operation');
  const p=JSON.parse(args.params_json||'{}');
  if(!p||Array.isArray(p)||Object.keys(p).some(k=>!['points','limit'].includes(k)))throw Error('invalid_parameters');
  if(!Array.isArray(p.points)||p.points.length<1||p.points.length>20||p.points.some(x=>typeof x!=='string'||!x.trim()||x.length>200))throw Error('invalid_points');
  const limit=p.limit??50;if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('invalid_limit');
  const dir=fs.realpathSync(workspace),dest=path.resolve(dir,args.output||`isu-${Date.now()}.json`);
  const rel=path.relative(dir,fs.realpathSync(path.dirname(dest)));
  if(path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep)||fs.existsSync(dest))throw Error('invalid_output');
  const control=new AbortController(),abort=()=>control.abort();
  if(exec.signal?.aborted)throw Error('cancelled');
  exec.signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(abort,90000);client=new Client(c,control.signal);
  const results=[];try{await client.connect();for(const pnt of [...new Set(p.points)])results.push(await client.query(pnt.trim(),limit));}
  finally{exec.signal?.removeEventListener('abort',abort);}
  const result={ok:true,source:spec.id,queried_at:new Date().toISOString(),results,note:'当前查询快照；TM 是源系统采样时间。子串匹配须核对点名，不将超时/坏质量当正常值。'};
  fs.writeFileSync(dest,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  return {...result,results:results.map(r=>({...r,rows:r.rows.slice(0,5)})),output:dest,preview_only:true};
 }catch(e){return {ok:false,source:spec.id,status:/^(isu_|invalid_|auth_required|http_|transport_error|certificate_error|response_timeout|cancelled|unsupported_operation)/.test(e.message)?e.message:'isu_query_failed'};}
 finally{clearTimeout(timer);client?.close();}
}
module.exports={spec,frames,Client,load,execute};
