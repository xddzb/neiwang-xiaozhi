"""Exercise preinstallation and Unix archive metadata using synthetic inputs."""
import hashlib, importlib.util, io, json, tarfile, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('ready',ROOT/'scripts/build-kylin-ready.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ReadyTest(unittest.TestCase):
    def test_preinstalled_payload_unicode_links_and_source_overlay(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp)/'base';base.mkdir();out=Path(temp)/'out'
            name='工具.sh';data=b'#!/bin/sh\necho fixture\n'
            pack={'release':'R11.6','platform':'Kylin-ARM64','bundles':['@anionex/dsh-turn-rewind'],'files':[{'path':name,'sha256':module.sha(data),'mode':0o755}],'links':[{'path':'tools/example','target':'../工具.sh'}]}
            filesets={'Core':{'config/app.json':module.encode({'bundles':[]}), 'core/official':b'fixed-core','launcher/bootstrap.cjs':b'old-bootstrap','extensions/node_modules/@neiwang/brand/client.js':b'old-brand'},'Plugins':{'plugin-pack/pack.json':module.encode(pack),'plugin-pack/payload/'+name:data,'plugin-pack/payload/'+module.REWIND+'lib/obsolete.js':b'obsolete'}}
            assets=[]
            filesets['Core']['config/overrides.json']=module.encode([{'id':'compaction-basic','disabled':True,'config':{'headroomTokens':65536}},{'id':'ui-settings-models','disabled':True},{'id':'unrelated','config':{'keep':True}}])
            for kind,files in filesets.items():
                p=base/(kind+'.tar.gz')
                with tarfile.open(p,'w:gz',format=tarfile.PAX_FORMAT) as t:
                    for rel,content in files.items():
                        m=tarfile.TarInfo('OLD/'+rel);m.size=len(content);m.mode=0o755 if rel.endswith('.sh') else 0o644;t.addfile(m,io.BytesIO(content))
                assets.append({'name':p.name,'sha256':module.file_sha(p)})
            (base/'release-assets.json').write_bytes(module.encode(assets))
            module.build(base,out,'fixture',100_000)
            stream=b''.join(p.read_bytes() for p in sorted(out.glob('*.tar.gz.*')))
            with tarfile.open(fileobj=io.BytesIO(stream),mode='r:gz') as t:
                prefix='Neiwang-Xiaozhi-Kylin-ARM64-R11.6-fixture/'
                self.assertEqual(t.extractfile(prefix+name).read(),data)
                self.assertEqual(t.getmember(prefix+name).mode,0o755)
                self.assertEqual(t.getmember(prefix+'tools/example').linkname,'../工具.sh')
                self.assertEqual(json.load(t.extractfile(prefix+'config/app.json'))['edition'],'full')
                policies=json.load(t.extractfile(prefix+'config/overrides.json'))
                self.assertEqual(next(r for r in policies if r['id']=='compaction-basic')['config']['headroomTokens'],16384)
                self.assertFalse(next(r for r in policies if r['id']=='ui-settings-models')['disabled'])
                self.assertTrue(next(r for r in policies if r['id']=='unrelated')['config']['keep'])
                self.assertEqual(t.extractfile(prefix+'launcher/bootstrap.cjs').read(),(ROOT/'launcher/bootstrap.cjs').read_bytes())
                self.assertEqual(t.extractfile(prefix+'extensions/node_modules/@neiwang/brand/client.js').read(),(ROOT/'extensions/@neiwang/brand/client.js').read_bytes())
                self.assertNotIn(prefix+module.REWIND+'lib/obsolete.js',t.getnames())
                self.assertIn(prefix+module.REWIND+'lib/build-source.json',t.getnames())
                self.assertEqual(t.extractfile(prefix+'core/official').read(),b'fixed-core')

if __name__=='__main__':unittest.main()
