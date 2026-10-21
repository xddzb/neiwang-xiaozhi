"""Check extraction boundaries and cached artifact integrity without network access."""
from pathlib import Path
import io,runpy,tarfile,tempfile,unittest
MODULE=runpy.run_path(str(Path(__file__).with_name('prepare-dev-runtime.py')))
class RuntimePreparationTests(unittest.TestCase):
 def test_reject_parent_traversal(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);archive=root/'bad.tar.gz'
   with tarfile.open(archive,'w:gz') as t:
    item=tarfile.TarInfo('../outside');item.size=1;t.addfile(item,io.BytesIO(b'x'))
   with self.assertRaises(ValueError):MODULE['safe_extract'](archive,root/'dest')
   self.assertFalse((root/'outside').exists())
 def test_reject_link_traversal(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);archive=root/'bad.tar.gz'
   with tarfile.open(archive,'w:gz') as t:
    link=tarfile.TarInfo('directory');link.type=tarfile.SYMTYPE;link.linkname='other';t.addfile(link)
    item=tarfile.TarInfo('directory/file');item.size=1;t.addfile(item,io.BytesIO(b'x'))
   with self.assertRaises(ValueError):MODULE['safe_extract'](archive,root/'dest')
 def test_reject_modified_cached_asset(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'artifact').write_bytes(b'modified')
   with self.assertRaises(ValueError):MODULE['download']({'name':'artifact','sha256':'0'*64,'url':'https://example.invalid/unreachable'},root)
if __name__=='__main__':unittest.main()
