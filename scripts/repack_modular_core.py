from pathlib import Path
import sys,tarfile,zipfile,io,hashlib,os
ROOT=Path(__file__).resolve().parents[1]
for platform in sys.argv[1:]:
 linux=platform=='Kylin-ARM64';name='Neiwang-Xiaozhi-'+platform+'-R10';app=ROOT/'builds'/name
 dest=ROOT/'dist/R10-Modular'/(name+'-Core'+('.tar.gz' if linux else '.zip'));temp=dest.with_name(dest.name+'.new')
 replacements={name+'/workspace/AGENTS.md':(ROOT/'scripts/r10-workspace-instructions.txt').read_bytes()}
 replacements[name+'/launcher/shell/main.js']=(app/'launcher/shell/main.js').read_bytes()
 if linux:replacements[name+'/launcher/bootstrap.cjs']=(app/'launcher/bootstrap.cjs').read_bytes()
 if linux:
  with tarfile.open(str(dest),'r|gz') as source,tarfile.open(str(temp),'w|gz',compresslevel=6) as target:
   for item in source:
    if item.name.startswith((name+'/runtime/sandbox/',name+'/runtime/ui-fonts/')):continue
    if item.name in replacements:
     content=replacements[item.name];item.size=len(content);target.addfile(item,io.BytesIO(content))
    elif item.isfile():target.addfile(item,source.extractfile(item))
    else:target.addfile(item)
   for p in sorted(list((app/'runtime/sandbox').rglob('*'))+list((app/'runtime/ui-fonts').rglob('*'))):
    if not p.is_file():continue
    info=target.gettarinfo(str(p),arcname=name+'/'+p.relative_to(app).as_posix());info.uid=info.gid=0;info.uname=info.gname='';info.mode=0o755 if p.name=='bwrap' else 0o644
    with p.open('rb') as f:target.addfile(info,f)
 else:
  with zipfile.ZipFile(dest) as source,zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as target:
   for item in source.infolist():target.writestr(item,replacements.get(item.filename,source.read(item)),compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)
 assert temp.stat().st_size<450_000_000;os.replace(temp,dest)
 (dest.parent/(dest.name+'.sha256')).write_text(hashlib.sha256(dest.read_bytes()).hexdigest()+'  '+dest.name+'\n',encoding='utf8');print(dest.name,dest.stat().st_size,flush=True)
