"""Synthetic checks for the simplified offline build input manifest."""
import importlib.util,tempfile,json,hashlib,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('release',Path(__file__).with_name('build-release.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Inputs(unittest.TestCase):
 def test_consolidated_private_input_and_hash_guard(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d)
   for n in ['windows/config/app.json','windows/plugin-pack/pack.json','private/config/defaults/model.enc','private/config/defaults/dify.enc','private/offline-api-tool/example.txt','private/plugin-pack/payload/extensions/apis/sources/example.json','node','baseline.tar.gz','core-linux/node_modules/@deepseek-ai/dsh/package.json','core-windows/node_modules/@deepseek-ai/dsh/package.json']:
    p=root/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('{"version":"0.2.1-rc.3"}' if '/dsh/package.json' in n else '{}')
   for core,target in [('core-linux','linux-arm64-gnu'),('core-windows','win32-x64-msvc')]:
    (root/core/('node_modules/node-addon-require-builtin-'+target)).mkdir()
   p=root/'build.local.json';value={'schemaVersion':1,'linuxBaseline':'baseline.tar.gz','linuxBaselineSha256':hashlib.sha256(b'{}').hexdigest(),'windowsBaseline':'windows','privateApp':'private','node':'node','outputRoot':'output','coreLinux':'core-linux','coreWindows':'core-windows'};p.write_text(json.dumps(value));plan=module.plan(p);self.assertEqual(plan['docs'],root/'private/offline-api-tool');self.assertEqual(plan['sources'],root/'private/plugin-pack/payload');value['linuxBaselineSha256']='0'*64;p.write_text(json.dumps(value));self.assertRaises(ValueError,module.plan,p)
if __name__=='__main__':unittest.main()
