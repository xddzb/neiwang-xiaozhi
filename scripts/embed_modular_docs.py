"""Add distribution documents to release archives without using runtime/user-data trees."""
from pathlib import Path
import hashlib,io,json,os,tarfile,zipfile
ROOT=Path(__file__).resolve().parents[1];folder=ROOT/'dist/R10-Modular'
DOCS={'安装说明.txt':(ROOT/'docs/R10安装说明.txt').read_bytes(),'R10更新说明.txt':(ROOT/'docs/R10更新说明.txt').read_bytes()}
def archive_records(file):
 records={}
 if file.name.endswith('.zip'):
  with zipfile.ZipFile(file) as a:
   for i in a.infolist():
    with a.open(i) as s:h=hashlib.file_digest(s,'sha256').hexdigest()
    assert i.filename not in records
    records[i.filename]=(i.file_size,h,i.external_attr)
 else:
  with tarfile.open(str(file),'r|gz') as a:
   for i in a:
    assert i.name not in records
    h=hashlib.file_digest(a.extractfile(i),'sha256').hexdigest() if i.isfile() else ''
    records[i.name]=(i.size,h,i.mode,i.type.decode('ascii'),i.linkname)
 return records
def embed(file):
 old=archive_records(file);prefix=next(iter(old)).split('/')[0]+'/'
 base=prefix+('plugin-pack/' if '-Plugins.' in file.name else '')
 docs={base+n:data for n,data in DOCS.items()};temp=file.with_name(file.name+'.docs-new')
 try:
  if file.name.endswith('.zip'):
   with zipfile.ZipFile(file) as src,zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as dst:
    for i in src.infolist():
     if i.filename in docs:continue
     with src.open(i) as inp,dst.open(i,'w',force_zip64=True) as out:
      while chunk:=inp.read(1024*1024):out.write(chunk)
    for name,data in docs.items():dst.writestr(name,data)
  else:
   with tarfile.open(str(file),'r|gz') as src,tarfile.open(str(temp),'w|gz',compresslevel=6) as dst:
    for i in src:
     if i.name in docs:continue
     dst.addfile(i,src.extractfile(i) if i.isfile() else None)
    for name,data in docs.items():
     i=tarfile.TarInfo(name);i.size=len(data);i.mode=0o644;dst.addfile(i,io.BytesIO(data))
  # Identify archive type for the temporary filename while verifying every old member.
  check=temp.with_name(file.stem+'.docs-checked'+('.zip' if file.name.endswith('.zip') else '.tar.gz'))
  os.replace(temp,check)
  try:
   new=archive_records(check)
   assert {n:v for n,v in old.items() if n not in docs}=={n:v for n,v in new.items() if n not in docs},'Application payload changed'
   for n,data in docs.items():assert new[n][0]==len(data) and new[n][1]==hashlib.sha256(data).hexdigest()
   assert check.stat().st_size<450_000_000
   os.replace(check,file)
  finally:
   if check.exists():check.unlink()
  digest=hashlib.sha256(file.read_bytes()).hexdigest()
  (file.parent/(file.name+'.sha256')).write_text(digest+'  '+file.name+'\n',encoding='utf8')
  print(json.dumps({'file':file.name,'bytes':file.stat().st_size,'documents':list(docs),'applicationPayloadUnchanged':True},ensure_ascii=False),flush=True)
 finally:
  if temp.exists():temp.unlink()
if __name__=='__main__':
 for file in sorted(folder.iterdir()):
  if file.name.endswith(('.zip','.tar.gz')):embed(file)
 (ROOT/'outputs/R10-embedded-documents.json').write_text(json.dumps({'documents':{n:hashlib.sha256(data).hexdigest() for n,data in DOCS.items()},'applicationPayloadUnchanged':True},ensure_ascii=False,indent=2),encoding='utf8')
