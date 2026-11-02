'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const statuses=new Set(['isu_browser_login_required','isu_browser_not_configured','isu_browser_token_pending','isu_browser_accounts_ambiguous']);
function browserConfigured(root){
 const file=path.join(root,'extensions/apis/connections/weekly-isu.json');
 if(!fs.existsSync(file))return false;
 try{return JSON.parse(fs.readFileSync(file,'utf8')).browser_session?.driver==='playwright'}catch{throw Error('isu_browser_not_configured')}
}
function bridge(root,body={},signal){
 let runtime;try{runtime=JSON.parse(fs.readFileSync(path.join(process.env.NEIWANG_DATA_DIR||path.join(root,'data'),'runtime/browser-automation.json'),'utf8'))}catch{return Promise.reject(Error('isu_browser_login_required'))}
 if(!Number.isInteger(runtime.port)||runtime.port<1||runtime.port>65535||! /^[a-f0-9]{64}$/.test(runtime.token))return Promise.reject(Error('isu_browser_login_required'));
 return new Promise((resolve,reject)=>{
  const data=JSON.stringify(body),req=http.request({hostname:'127.0.0.1',port:runtime.port,path:'/isu-session',method:'POST',signal,headers:{Authorization:'Bearer '+runtime.token,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{
   let value='',size=0;res.on('data',b=>{size+=b.length;if(size>65536)req.destroy();else value+=b});res.on('error',()=>reject(Error('isu_browser_session_unavailable')));
   res.on('end',()=>{try{const r=JSON.parse(value);if(res.statusCode!==200||!r.ok)return reject(Error(statuses.has(r.status)?r.status:'isu_browser_session_unavailable'));resolve(r)}catch{reject(Error('isu_browser_session_unavailable'))}});
  });req.on('error',()=>reject(Error(signal?.aborted?'cancelled':'isu_browser_session_unavailable')));req.setTimeout(10000,()=>req.destroy());req.end(data);
 });
}
async function credentials(root,signal){
 const result=await bridge(root,{},signal),c=result.credentials;
 let expected;try{expected=new URL(JSON.parse(fs.readFileSync(path.join(root,'extensions/apis/connections/weekly-isu.json'),'utf8')).base_url).origin}catch{throw Error('isu_browser_not_configured')}
 if(!c||c.base_url!==expected)throw Error('isu_browser_session_unavailable');return c;
}
async function invalidate(root,token){await bridge(root,{invalidateToken:token}).catch(()=>{})}
module.exports={browserConfigured,credentials,invalidate};
