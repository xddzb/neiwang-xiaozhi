"""Historical release entry retired; current sources use the consolidated builder."""
import importlib.util
from pathlib import Path
_spec=importlib.util.spec_from_file_location('current_release',Path(__file__).with_name('build-r115-release.py'));_module=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_module)
private=_module.private
if __name__=='__main__':
 raise SystemExit('旧R11.4构建入口已停用。请运行 python scripts/build-release.py；历史发行实现通过Git提交追溯。')
