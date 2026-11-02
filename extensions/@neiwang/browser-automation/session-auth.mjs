import * as fs from 'node:fs/promises';
import {join} from 'node:path';

const FORBIDDEN=new Set(['cookie','host','connection','content-length','content-type','origin','referer','proxy-authorization','set-cookie']);
function origin(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('invalid_origin');return u.origin}
function headerName(name){if(typeof name!=='string'||! /^[a-zA-Z0-9-]+$/.test(name)||FORBIDDEN.has(name.toLowerCase()))throw Error('invalid_auth_header');return name.toLowerCase()}
function headerValue(value){if(typeof value!=='string'||!value||value.length>16384||/[\r\n\x00]/.test(value))throw Error('invalid_auth_value');return value}

// Values never leave the private bridge or enter tool descriptions/logs.
export class SessionAuth {
 constructor(root){this.root=root}
 async connection(id,url){
  if(typeof id!=='string'||! /^[a-zA-Z0-9_-]{1,64}$/.test(id))throw Error('invalid_connection');
  const c=JSON.parse(await fs.readFile(join(this.root,'extensions/apis/connections',id+'.json'),'utf8'));
  const target=origin(url),settings=c.browser_session;
  if(settings?.driver!=='playwright'||origin(c.base_url)!==target||!settings.allowed_origins?.includes(target))throw Error('origin_not_registered');
  const sources=join(this.root,'extensions/apis/sources');let registered=false;
  for(const file of await fs.readdir(sources)){
   if(!file.endsWith('.json'))continue;
   const s=JSON.parse(await fs.readFile(join(sources,file),'utf8'));
   if(s.connection===id&&s.enabled===true&&s.read_only===true&&['GET','POST'].includes((s.method||'GET').toUpperCase())&&typeof s.path==='string'){
    const u=new URL(c.base_url+s.path),requested=new URL(url);
    if(u.origin===target&&u.pathname===requested.pathname)registered=true;
   }
  }
  if(!registered)throw Error('endpoint_not_registered');return c;
 }
 async headers(context,id,url){
  const c=await this.connection(id,url),settings=c.browser_session,headers={};
  const cookies=await context.cookies(url);
  const cookie=cookies.filter(c=>!/[\r\n;]/.test(c.name+c.value)).map(c=>c.name+'='+c.value).join('; ');
  if(cookie)headers.cookie=cookie;
  if(settings.auth_headers!==undefined&&!Array.isArray(settings.auth_headers))throw Error('invalid_auth_mapping');
  for(const rule of settings.auth_headers||[]){
   if(!rule||typeof rule.key!=='string'||!rule.key||rule.key.length>200)throw Error('invalid_auth_mapping');
   const name=headerName(rule.header);let value;
   if(rule.source==='cookie')value=cookies.find(c=>c.name===rule.key)?.value;
   else if(['localStorage','sessionStorage'].includes(rule.source)){
    // Never read a different origin, or pick one of multiple logged-in accounts silently.
    const pages=context.pages().filter(p=>{try{return origin(p.url())===origin(url)}catch{return false}});
    const values=[];
    for(const page of pages){
     const candidate=await page.evaluate(({source,key,expected})=>location.origin===expected?window[source].getItem(key):null,{source:rule.source,key:rule.key,expected:origin(url)});
     if(candidate!==null)values.push(candidate);
    }
    const unique=[...new Set(values)];if(unique.length>1)throw Error('ambiguous_browser_session');value=unique[0];
   }else throw Error('invalid_auth_source');
   if(rule.json_path){if(!Array.isArray(rule.json_path)||rule.json_path.some(x=>typeof x!=='string'||['__proto__','constructor','prototype'].includes(x)))throw Error('invalid_auth_path');value=JSON.parse(value);for(const key of rule.json_path)value=value&&Object.hasOwn(value,key)?value[key]:undefined}
   if(value===undefined||value===null||value===''){if(rule.required!==false)throw Error('playwright_login_required');delete headers[name];continue}
   if(rule.decode_uri===true)value=decodeURIComponent(value);
   headers[name]=headerValue((rule.prefix||'')+headerValue(value));
  }
  if(!Object.keys(headers).length)throw Error('playwright_login_required');return headers;
 }
}
