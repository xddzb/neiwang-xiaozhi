"""Build a workspace Python script with this platform's bundled PyInstaller."""
import argparse,json,os,re,subprocess,sys,tempfile
from pathlib import Path
def main():
 p=argparse.ArgumentParser();p.add_argument('--workspace',required=True);p.add_argument('--script',required=True);p.add_argument('--name',default='');p.add_argument('--onefile',action='store_true');p.add_argument('--hidden-imports',default='[]');a=p.parse_args()
 root=Path(a.workspace).resolve(strict=True);script=(root/a.script).resolve(strict=True);script.relative_to(root)
 if not script.is_file() or script.suffix.lower()!='.py':raise ValueError('需要工作区内的.py文件')
 name=a.name or script.stem
 if not re.fullmatch(r'[A-Za-z0-9_\-\u4e00-\u9fff]{1,80}',name):raise ValueError('应用名称包含不支持的字符')
 imports=json.loads(a.hidden_imports)
 if not isinstance(imports,list) or len(imports)>50 or any(not isinstance(v,str) or not re.fullmatch(r'[A-Za-z_]\w*(\.[A-Za-z_]\w*)*',v) for v in imports):raise ValueError('hidden-imports格式无效')
 out=root/'python-dist';out.mkdir(exist_ok=True);out.resolve().relative_to(root)
 destination=out/(name+('.exe' if os.name=='nt' and a.onefile else ''))
 if destination.exists():raise ValueError('打包目标已存在，请指定新名称或由用户先处理已有文件')
 with tempfile.TemporaryDirectory(prefix='neiwang-pyi-') as work,tempfile.TemporaryFile() as log:
  cmd=[sys.executable,'-I','-B','-m','PyInstaller','--noconfirm','--clean','--name',name,'--distpath',str(out),'--workpath',str(Path(work)/'build'),'--specpath',work,'--onefile' if a.onefile else '--onedir']
  for value in imports:cmd+=['--hidden-import',value]
  cmd.append(str(script));child=subprocess.Popen(cmd,cwd=root,stdout=log,stderr=subprocess.STDOUT)
  try:code=child.wait(timeout=300)
  except subprocess.TimeoutExpired:
   if os.name=='nt':subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   else:child.kill()
   child.wait();return {'ok':False,'status':'package_timeout','output_directory':str(out)}
  log.seek(0,2);size=log.tell();log.seek(max(0,size-12000));text=log.read().decode('utf8','replace')
  return {'ok':code==0,'exit_code':code,'platform':sys.platform,'output_directory':str(out),'application':str(destination),'log_tail':text,'note':'仅生成当前操作系统和CPU架构的程序，不能跨平台编译。'}
if __name__=='__main__':
 sys.stdout.reconfigure(encoding='utf8')
 try:print(json.dumps(main(),ensure_ascii=False))
 except Exception as e:print(json.dumps({'ok':False,'status':'invalid_package_request','message':str(e)},ensure_ascii=False));sys.exit(1)
