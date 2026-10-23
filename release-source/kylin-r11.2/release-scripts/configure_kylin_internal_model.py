from pathlib import Path
import sys,json,tarfile,io,copy,hashlib
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'builds/Neiwang-Xiaozhi-Win10-x64-R11/tools'))
import model_config
SOURCE=ROOT/'dist/R11.2-Kylin-ARM64';OUT=ROOT/'dist/R11.2-Kylin-ARM64-Internal';NAME='Neiwang-Xiaozhi-Kylin-ARM64-R11.2'
def main():
 key=sys.stdin.readline().strip();assert key
 config={'version':1,'base_url':'http://127.0.0.1:8080/v1','api_key':key,'models':['qwen3.8','deepseek_v4'],'default_model':'qwen3.8'}
 encrypted=model_config.encode(config);assert model_config.decode(encrypted)==config
 rag_seed=(ROOT/'builds/Neiwang-Xiaozhi-Kylin-ARM64-R10/config/defaults/dify.enc').read_bytes()
 OUT.mkdir(exist_ok=True)
 guide=(SOURCE/'安装说明.txt').read_text(encoding='utf8')
 guide=guide.replace('首次运行先执行 sh 配置模型.sh，填入模型地址、模型名称和API密钥（隐藏输入），然后执行 sh start.sh。','已内置本组织内网模型配置，新目录安装后直接执行 sh start.sh；无需运行配置模型.sh。已有data/config/model.enc会保留，不自动覆盖。')
 guide=guide.replace('交付包不含个人密钥、机器人绑定、聊天或钉钉授权；不提供内置免费模型额度。','本内网预配置包包含本组织模型接口的加密配置，仅向有权使用该接口的人员分发；加密不等于接收者无法取出密钥。包内不含机器人绑定、聊天或钉钉授权；不提供内置免费模型额度。')
 guide+='\n内网模型：http://127.0.0.1:8080/v1；可选模型qwen3.8、deepseek_v4；默认qwen3.8。仅验证配置加解密及包内文件，未从当前电脑验证该内网接口连通性。\n'
 meta=json.loads((SOURCE/'build.json').read_text(encoding='utf8'));meta['internalModelConfigured']=True
 for archive in meta['archives']:
  source=SOURCE/archive['file'];target=OUT/archive['file'];count=0
  with tarfile.open(source,'r:gz') as old,tarfile.open(target,'w:gz',compresslevel=6) as new:
   for e in old:
    n=copy.copy(e);data=old.extractfile(e).read() if e.isfile() else None
    relative=e.name.removeprefix(NAME+'/')
    if data is not None and relative in ['安装说明.txt','README-先看这里.txt','维护与升级说明.txt','plugin-pack/安装说明.txt']:data=guide.encode('utf8')
    if data is None:new.addfile(n)
    else:n.size=len(data);new.addfile(n,io.BytesIO(data))
    count+=1
   if '-Core.' in archive['file']:
    n=tarfile.TarInfo(NAME+'/config/defaults/model.enc');n.mode=0o600;n.size=len(encrypted);new.addfile(n,io.BytesIO(encrypted));count+=1
    n=tarfile.TarInfo(NAME+'/config/defaults/dify.enc');n.mode=0o600;n.size=len(rag_seed);new.addfile(n,io.BytesIO(rag_seed));count+=1
  archive.update(bytes=target.stat().st_size,members=count,sha256=hashlib.sha256(target.read_bytes()).hexdigest())
  (OUT/(target.name+'.sha256')).write_text(archive['sha256']+'  '+target.name+'\n',encoding='utf8');print('Configured '+target.name,flush=True)
 # Verify that only documentation and the encrypted model seed changed.
 checked=0
 for archive in meta['archives']:
  with tarfile.open(SOURCE/archive['file'],'r:gz') as original,tarfile.open(OUT/archive['file'],'r:gz') as updated:
   originals={e.name:hashlib.sha256(original.extractfile(e).read()).hexdigest() for e in original if e.isfile()}
   for e in updated:
    if not e.isfile():continue
    data=updated.extractfile(e).read();r=e.name.removeprefix(NAME+'/')
    if r=='config/defaults/model.enc':assert model_config.decode(data)==config
    elif r=='config/defaults/dify.enc':assert data==rag_seed
    elif r in ['安装说明.txt','README-先看这里.txt','维护与升级说明.txt','plugin-pack/安装说明.txt']:assert data==guide.encode('utf8')
    else:assert hashlib.sha256(data).hexdigest()==originals[e.name];checked+=1
 report=json.loads((SOURCE/'validation.json').read_text(encoding='utf8'));report.update(archives=meta['archives'],internalModel={'base_url':config['base_url'],'models':config['models'],'default_model':config['default_model'],'encryptedSeedRoundTrip':'PASS','endpointConnectivity':'not tested'},unchangedFilesVerified=checked)
 (OUT/'build.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf8');(OUT/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');(OUT/'安装说明.txt').write_text(guide,encoding='utf8')
 print('PASS encrypted model seed; unchanged application files; key omitted from output',flush=True)
if __name__=='__main__':main()
