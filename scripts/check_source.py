"""Check tracked/candidate source without executing application code or printing secrets."""
from pathlib import Path
import ast,json,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
FORBIDDEN={'.exe','.dll','.whl','.zip','.gz','.7z','.iso','.enc','.pem','.key','.pdf','.docx','.xlsx','.jsonl','.db'}
PATTERNS=[r'sk-[A-Za-z0-9_-]{16,}',r'gh[pousr]_[A-Za-z0-9]{20,}',r'github_pat_[A-Za-z0-9_]{20,}',r'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY',r'(?<![\w.])(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)']
def main():
 result=subprocess.run(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=ROOT,capture_output=True,check=True)
 files=sorted(set(result.stdout.decode('utf8').split('\0'))-{''});errors=[]
 for name in files:
  p=ROOT/name
  if not p.is_file():continue
  if p.suffix.lower() in FORBIDDEN or '接口' in name or p.name in {'contracts.json','owner.json'}:errors.append(name+': excluded file type')
  if p.suffix.lower() in {'.png','.ico'}:continue
  text=p.read_text(encoding='utf-8-sig')
  if any(re.search(pattern,text) for pattern in PATTERNS):errors.append(name+': possible sensitive content')
  try:
   if p.suffix=='.py':ast.parse(text,filename=name)
   elif p.suffix=='.json':json.loads(text)
   elif p.suffix in {'.js','.mjs','.cjs'}:
    module=p.suffix=='.mjs'
    if p.suffix=='.js':
     for parent in p.parents:
      manifest=parent/'package.json'
      if manifest.exists():
       module=json.loads(manifest.read_text(encoding='utf8')).get('type')=='module';break
      if parent==ROOT:break
    check=subprocess.run(['node','--check','--input-type='+('module' if module else 'commonjs')],input=text.encode('utf8'),capture_output=True)
    if check.returncode:errors.append(name+': JavaScript syntax check failed')
  except (SyntaxError,ValueError):errors.append(name+': syntax check failed')
 if errors:print('\n'.join(errors));return 1
 print(f'PASS: {len(files)} source files; Python/JSON/JavaScript syntax and exclusion checks')
 return 0
if __name__=='__main__':sys.exit(main())
