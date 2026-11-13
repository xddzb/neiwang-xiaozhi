"""Verify the installer seed and its manifest are updated together, regardless of tar order."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('isu_build', ROOT/'scripts/build-isu-kylin-release.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class IsuReleaseTest(unittest.TestCase):
    def test_private_seed_and_manifest_match_and_core_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)/'baseline';base.mkdir()
            seed = 'plugin-pack/payload/extensions/apis/connections/weekly-isu.json'
            connection = {'base_url':'https://isu.example.invalid','verify_tls':True,'auth_mode':'none','browser_session':{'driver':'playwright','allowed_origins':['https://isu.example.invalid']}}
            seed_bytes = json.dumps(connection).encode()
            pack = {'files':[{'path':seed.removeprefix('plugin-pack/payload/'),'sha256':hashlib.sha256(seed_bytes).hexdigest(),'mode':420}]}
            assets = []
            for kind, files in [('Core',{'config/app.json':b'{"coreVersion":"0.2.1-rc.3"}','core/official.bin':b'unchanged official core'}),('Plugins',{'plugin-pack/pack.json':json.dumps(pack).encode(),seed:seed_bytes})]:
                name = 'Neiwang-Xiaozhi-Kylin-ARM64-R11.6-Internal-'+kind+'.tar.gz'
                with tarfile.open(base/name,'w:gz') as archive:
                    for relative,data in files.items():
                        row=tarfile.TarInfo('APP/'+relative);row.size=len(data);archive.addfile(row,io.BytesIO(data))
                assets.append({'name':name,'sha256':hashlib.sha256((base/name).read_bytes()).hexdigest()})
            (base/'release-assets.json').write_text(json.dumps(assets),encoding='utf8')
            (base/'合并安装R11.6.sh').write_text('#!/bin/sh\nHERE=.\nDEST=${1:-"$HERE/合并后的R11.6"}\n',encoding='utf8')
            output=Path(temp)/'result';module.build(base,output,'https://isu.example.invalid/#/externalLink/synthetic')
            with tarfile.open(next(output.glob('*-Plugins.tar.gz'))) as archive:
                actual=archive.extractfile('APP/'+seed).read();value=json.loads(actual)
                self.assertIs(value['verify_tls'],False)
                self.assertEqual(value['browser_session']['isu_realtime_url'],'https://isu.example.invalid/#/externalLink/synthetic')
                value.pop('verify_tls');value['browser_session'].pop('isu_realtime_url');connection.pop('verify_tls');self.assertEqual(value,connection)
                packed=json.load(archive.extractfile('APP/plugin-pack/pack.json'))
                self.assertEqual(next(r['sha256'] for r in packed['files'] if r['path']==seed.removeprefix('plugin-pack/payload/')),hashlib.sha256(actual).hexdigest())
                self.assertIsNotNone(archive.getmember('APP/plugin-pack/payload/extensions/node_modules/@neiwang/browser-automation/browser-toolbar.html'))
            with tarfile.open(next(output.glob('*-Core.tar.gz'))) as archive:
                self.assertEqual(archive.extractfile('APP/core/official.bin').read(),b'unchanged official core')
            self.assertIn('sha256sum -c SHA256SUMS.txt',(output/'安装麒麟ISU版.sh').read_text(encoding='utf8'))

if __name__=='__main__':unittest.main()
