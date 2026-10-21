"""Run a user-authorized workspace script with the bundled interpreter; not a sandbox."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

def main():
    p=argparse.ArgumentParser();p.add_argument('--workspace',required=True);p.add_argument('--script',required=True);p.add_argument('--args',default='[]');a=p.parse_args()
    root=Path(a.workspace).resolve(strict=True);script=(root/a.script).resolve(strict=True);script.relative_to(root)
    if not script.is_file() or script.suffix!='.py':raise ValueError()
    args=json.loads(a.args)
    if not isinstance(args,list) or any(not isinstance(v,str) for v in args):raise ValueError()
    # stdout/stderr go to bounded reads of temporary files, not unbounded pipes.
    with tempfile.TemporaryFile() as out,tempfile.TemporaryFile() as err:
        child=subprocess.Popen([sys.executable,'-I','-B','-X','utf8',str(script),*args],cwd=root,stdout=out,stderr=err)
        try:code=child.wait(timeout=300)
        except subprocess.TimeoutExpired:
            if os.name=='nt':subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            else:child.kill()
            child.wait();return {'ok':False,'status':'script_timeout'}
        out.seek(0);err.seek(0);stdout=out.read(32001);stderr=err.read(8001)
        return {'ok':code==0,'exit_code':code,'stdout':stdout[:32000].decode('utf8','replace'),
                'stderr':stderr[:8000].decode('utf8','replace'),'truncated':len(stdout)>32000 or len(stderr)>8000}

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf8')
    try:print(json.dumps(main(),ensure_ascii=False))
    except Exception:
        print(json.dumps({'ok':False,'status':'invalid_script_or_arguments'},ensure_ascii=False));sys.exit(1)
