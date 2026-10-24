'use strict';
// Explicit offline copy into a new installation. The old application is read-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Manager,safe,atomic,hash}=require('./offline-plugin-manager.cjs');
function keyFor(root){
 const module=path.join(root,'tools/model_config.py'),text=fs.existsSync(module)?fs.readFileSync(module,'utf8'):'';
 const match=text.match(/KEY\s*=\s*bytes\.fromhex\(['"]([a-fA-F0-9]{64})['"]\)/);
 if(match)return Buffer.from(match[1],'hex');
 const local=path.join(root,'data/config/.local-key');
 if(fs.existsSync(local)){const value=fs.readFileSync(local);if(value.length!==32)throw Error('Invalid source local key');return value}
 throw Error('Cannot identify source configuration key; old files were not changed');
}
function convert(raw,sourceKey,targetKey){
 const envelope=JSON.parse(raw);if(!['NEIWANG-MODEL-1','NEIWANG-DIFY-1'].includes(envelope.format))throw Error('Unsupported encrypted configuration');
 const data=Buffer.from(envelope.payload,'base64'),aad=Buffer.from(envelope.format);
 const decipher=crypto.createDecipheriv('aes-256-gcm',sourceKey,data.subarray(0,12));decipher.setAAD(aad);decipher.setAuthTag(data.subarray(-16));
 const plain=Buffer.concat([decipher.update(data.subarray(12,-16)),decipher.final()]);JSON.parse(plain);
 const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',targetKey,nonce);cipher.setAAD(aad);
 return Buffer.from(JSON.stringify({format:envelope.format,payload:Buffer.concat([nonce,cipher.update(plain),cipher.final(),cipher.getAuthTag()]).toString('base64')},null,2));
}
function migrate(source,target,{stopped}={}){
 source=fs.realpathSync(source);target=fs.realpathSync(target);
 const within=(a,b)=>a===b||a.startsWith(b+path.sep);
 if(within(source,target)||within(target,source))throw Error('Use separate old and new APP directories');
 const manager=new Manager(target,stopped?{stopped}:{});
 return manager.withLock(()=>{
  manager.ensureIdle();new Manager(source,stopped?{stopped}:{}).ensureIdle();
  const keyPath=safe(target,'data/config/.local-key'),encrypted=['model.enc','dify.enc'];
  if(!fs.existsSync(keyPath)&&encrypted.some(n=>fs.existsSync(safe(target,'data/config/'+n))))throw Error('Target encrypted settings have no local key');
  const targetKey=fs.existsSync(keyPath)?fs.readFileSync(keyPath):crypto.randomBytes(32);if(targetKey.length!==32)throw Error('Invalid target local key');
  const factory={};for(const rel of ['manifests/release.json','plugin-pack/pack.json']){
   const file=safe(target,rel);if(!fs.existsSync(file))continue;const v=JSON.parse(fs.readFileSync(file,'utf8'));
   Object.assign(factory,v.shippedUserFiles||{});for(const f of v.files||[])if(f.path.startsWith('extensions/apis/'))factory[f.path]=f.sha256;
  }
  const untouched=rel=>factory[rel]&&fs.existsSync(safe(target,rel))&&hash(fs.readFileSync(safe(target,rel)))===factory[rel];
  const writes=[],skipped=[];
  function add(rel,data){const dst=safe(target,rel),before=fs.existsSync(dst)?fs.readFileSync(dst):null;if(before&&(before.equals(data)||!untouched(rel))){skipped.push(rel);return}writes.push({rel,dst,data,before})}
  function tree(rel){const from=path.join(source,rel);if(!fs.existsSync(from))return;for(const e of fs.readdirSync(from,{withFileTypes:true})){
   if(e.isSymbolicLink()||['node_modules','runtime','cache','__pycache__'].includes(e.name))continue;
   const next=rel+'/'+e.name;if(e.isDirectory())tree(next);else if(e.isFile()){
    if(next==='data/config/.local-key'||encrypted.some(n=>next==='data/config/'+n))continue;
    add(next,fs.readFileSync(path.join(source,next)));
   }
  }}
  const present=encrypted.filter(n=>fs.existsSync(path.join(source,'data/config',n))&&(!fs.existsSync(safe(target,'data/config/'+n))||untouched('data/config/'+n)));
  if(present.length){const sourceKey=keyFor(source);if(!fs.existsSync(keyPath))add('data/config/.local-key',targetKey);for(const n of present)add('data/config/'+n,convert(fs.readFileSync(path.join(source,'data/config',n)),sourceKey,targetKey))}
  for(const rel of ['data/config','data/dingtalk-official','data/dws','extensions/apis','offline-api-tool','private-docs','晓光agent'])tree(rel);
  // Keep profile configuration and credentials, never copy installed dependencies or chats.
  for(const rel of ['data/dsh/.credentials.yaml','data/dsh/.credentials.yml']){const file=path.join(source,rel);if(fs.existsSync(file))add(rel,fs.readFileSync(file))}
  tree('data/dsh/profiles');
  const applied=[];try{for(const w of writes){fs.mkdirSync(path.dirname(w.dst),{recursive:true});if(w.before){atomic(w.dst,w.data);applied.push(w)}else{const fd=fs.openSync(w.dst,'wx',0o600);applied.push(w);try{fs.writeFileSync(fd,w.data);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}}}
  catch(e){for(const w of applied.reverse())if(w.before)atomic(w.dst,w.before);else fs.unlinkSync(w.dst);throw e}
  return {status:'MIGRATED',copied:writes.length,replacedFactoryFiles:writes.filter(w=>w.before).length,keptExisting:skipped.length,sourceUntouched:true,networkRequests:false,restartRequired:true};
 });
}
module.exports={migrate,keyFor,convert};
if(require.main===module){try{if(process.argv.length!==3)throw Error('用法：使用新版APP自带Node运行 tools/migrate-settings.cjs 旧APP目录');console.log(JSON.stringify(migrate(process.argv[2],path.resolve(__dirname,'..')),null,2))}catch{console.error('配置迁移失败：请关闭新旧APP，使用两个独立目录，并确认旧配置完整；未输出密钥。');process.exitCode=1}}
