"""Losslessly split an existing release into core and plugin-pack archives."""
from pathlib import Path
import argparse, tarfile, hashlib, json, copy

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024), b''): h.update(block)
    return h.hexdigest()

def record(entry, data):
    return (entry.type.decode('ascii'), entry.mode, entry.linkname,
            hashlib.sha256(data).hexdigest() if data is not None else None)

def main():
    p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('--output',required=True);a=p.parse_args()
    source=Path(a.archive);out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
    stem=source.name.removesuffix('.tar.gz')
    paths={kind:out/(stem+'-'+kind+'.tar.gz') for kind in ['Core','Plugins']}
    expected={};counts={kind:0 for kind in paths}
    streams={kind:tarfile.open(path,'w:gz',compresslevel=3) for kind,path in paths.items()}
    try:
        with tarfile.open(source,'r:gz') as src:
            for entry in src:
                if entry.name in expected: raise ValueError('Duplicate member: '+entry.name)
                rel=entry.name.partition('/')[2]
                kind='Plugins' if rel=='plugin-pack' or rel.startswith('plugin-pack/') else 'Core'
                data=src.extractfile(entry).read() if entry.isfile() else None
                expected[entry.name]=record(entry,data);counts[kind]+=1
                import io
                streams[kind].addfile(copy.copy(entry),io.BytesIO(data) if data is not None else None)
    finally:
        for stream in streams.values(): stream.close()
    observed={}
    for kind,path in paths.items():
        with tarfile.open(path,'r:gz') as archive:
            for entry in archive:
                if entry.name in observed: raise ValueError('Overlapping member: '+entry.name)
                data=archive.extractfile(entry).read() if entry.isfile() else None
                observed[entry.name]=record(entry,data)
    if expected!=observed: raise ValueError('Split does not reconstruct the original release')
    report={'status':'PASS','source':source.name,'sourceSha256':sha(source),
            'verification':'All member names, types, modes, link targets and file SHA256 match the original; no missing or overlapping members.',
            'members':len(expected),'assets':[]}
    for kind,path in paths.items():
        digest=sha(path);Path(str(path)+'.sha256').write_text(digest+'  '+path.name+'\n',encoding='ascii')
        report['assets'].append({'name':path.name,'kind':kind,'bytes':path.stat().st_size,'members':counts[kind],'sha256':digest})
    (out/(stem+'-split-validation.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(report,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
