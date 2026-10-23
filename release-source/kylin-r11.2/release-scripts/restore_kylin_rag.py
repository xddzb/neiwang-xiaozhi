from pathlib import Path
import sys,json,tarfile,io,copy,hashlib,shutil,os
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'dist/R11.2-Kylin-ARM64-Internal-LF-Fix';OUT=ROOT/'dist/R11.2-Kylin-ARM64-Internal-LF-Fix-RAG';NAME='Neiwang-Xiaozhi-Kylin-ARM64-R11.2'
sys.path.insert(0,str(ROOT/'builds/Neiwang-Xiaozhi-Win10-x64-R11/tools'));import rag_tool
seed_file=ROOT/'builds/Neiwang-Xiaozhi-Kylin-ARM64-R10/config/defaults/dify.enc';rag_tool.FILE=seed_file;config=rag_tool.load_config();assert config['api_key'] and config['app_type']=='workflow'
seed=seed_file.read_bytes();patch=ROOT/'outputs/rag-restore';patch.mkdir(exist_ok=True);(patch/'dify.enc').write_bytes(seed);(patch/'dify.enc.sha256').write_bytes((hashlib.sha256(seed).hexdigest()+'\n').encode('ascii'))
patch_archive=ROOT/'outputs/麒麟RAG配置恢复补丁.tar.gz'
with tarfile.open(patch_archive,'w:gz') as tf:
 for p in sorted(patch.iterdir()):
  if not p.is_file():continue
  data=p.read_bytes().replace(b'\r\n',b'\n') if p.suffix=='.sh' else p.read_bytes();n=tarfile.TarInfo('rag-restore/'+p.name);n.mode=0o755 if p.suffix=='.sh' else 0o600;n.size=len(data);tf.addfile(n,io.BytesIO(data))
print('RAG hotfix prepared; original encrypted configuration validated',flush=True)
OUT.mkdir(exist_ok=True);meta=json.loads((SRC/'build.json').read_text(encoding='utf8'));guide=(SRC/'安装说明.txt').read_text(encoding='utf8')+'\n2026-10-23 RAG修复：恢复原有Dify Workflow加密默认配置。新目录首次启动自动生成data/config/dify.enc，不覆盖已有配置；左下角开启RAG后使用。该包含组织模型和知识库接口加密凭据，只限授权人员。已验证本机配置，不代表已验证内网服务连通性。\n'
core_archive=None
for item in meta['archives']:
 dest=OUT/item['file']
 if '-Core.' not in item['file']:shutil.copyfile(SRC/item['file'],dest)
 else:
  core_archive=dest
  with tarfile.open(SRC/item['file'],'r:gz') as old,tarfile.open(dest,'w:gz',compresslevel=6) as new:
   for e in old:
    n=copy.copy(e);data=old.extractfile(e).read() if e.isfile() else None
    if e.name.removeprefix(NAME+'/') in ['安装说明.txt','README-先看这里.txt','维护与升级说明.txt']:data=guide.encode('utf8')
    if data is None:new.addfile(n)
    else:n.size=len(data);new.addfile(n,io.BytesIO(data))
   n=tarfile.TarInfo(NAME+'/config/defaults/dify.enc');n.size=len(seed);n.mode=0o600;new.addfile(n,io.BytesIO(seed))
  item['members']=item.get('members',0)+1
 item.update(bytes=dest.stat().st_size,sha256=hashlib.sha256(dest.read_bytes()).hexdigest());(OUT/(dest.name+'.sha256')).write_text(item['sha256']+'  '+dest.name+'\n',encoding='utf8');print('Updated '+dest.name,flush=True)
with tarfile.open(core_archive,'r:gz') as tf:
 found=tf.extractfile(NAME+'/config/defaults/dify.enc').read();assert found==seed
 assert any(e.name==NAME+'/config/defaults/model.enc' for e in tf)
meta['ragConfigured']=True;report=json.loads((SRC/'validation.json').read_text(encoding='utf8'));report.update(archives=meta['archives'],rag={'defaultSeedPresent':True,'encryptedConfigurationValidated':True,'appType':config['app_type'],'queryInput':config.get('query_input'),'answerOutput':config.get('answer_output'),'endpointConnectivity':'not tested','priorSourceFilesIdentical':True},ragFixRuntimeTest='pending')
(OUT/'build.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf8');(OUT/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');(OUT/'安装说明.txt').write_text(guide,encoding='utf8')
shutil.copyfile(patch_archive,OUT/patch_archive.name);print('PASS RAG seed restored; model and DingTalk plugin retained',flush=True)
