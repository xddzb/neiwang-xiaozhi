"""现有私有解释器与 NAS wheel 包管理；不创建环境。"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import shutil
import zipfile
from email.parser import BytesParser


def normalized(name):
    return re.sub(r'[-_.]+', '-', name).lower()


def scan_nas(directory):
    root = Path(directory).resolve(strict=True)
    if not root.is_dir(): raise ValueError('NAS 路径必须是已挂载的共享目录')
    wheels = root / 'wheelhouse' if (root / 'wheelhouse').is_dir() else root
    packages = []
    for path in sorted(wheels.glob('*.whl')):
        path.resolve().relative_to(root)
        if len(packages) >= 1000: raise ValueError('单个 NAS 目录最多支持 1000 个 wheel')
        if path.stat().st_size > 512 * 1024 * 1024: raise ValueError('单个 wheel 超过 512 MB')
        with zipfile.ZipFile(path) as archive:
            names = [n for n in archive.namelist() if n.endswith('.dist-info/METADATA')]
            if len(names) != 1 or archive.getinfo(names[0]).file_size > 2 * 1024 * 1024:
                raise ValueError('wheel 元数据无效：' + path.name)
            metadata = BytesParser().parsebytes(archive.read(names[0]))
        name, version = metadata.get('Name', ''), metadata.get('Version', '')
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', name) or not re.fullmatch(r'[A-Za-z0-9.+!_-]+', version):
            raise ValueError('wheel 包名或版本无效')
        if any('@' in r or '://' in r for r in metadata.get_all('Requires-Dist', [])):
            raise ValueError('NAS 包含外部地址依赖，拒绝安装：' + name)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        packages.append({'name': normalized(name), 'version': version, 'filename': path.name,
                         'sha256': digest, 'path': str(path)})
    if not packages: raise ValueError('目录中未发现 wheel；请放在目录根部或 wheelhouse 子目录')
    return {'path': str(root), 'packages': packages, 'count': len(packages)}


def manage_packages(payload, emit):
    info = inspect_python(payload['python'])
    if info['system']: raise ValueError('系统 Python 只读')
    if not info['modules']['pip']: raise ValueError('现有解释器没有 pip，无法管理包；不会创建新环境')
    cache = Path(payload['cache']); cache.mkdir(parents=True, exist_ok=False)
    (cache / 'before.json').write_text(json.dumps(info, ensure_ascii=False), encoding='utf-8')
    python = info['path']
    def run(args):
        process = subprocess.Popen([python, '-I', '-B', '-m', 'pip', '--isolated', '--disable-pip-version-check'] + args,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, encoding='utf-8', errors='replace', env=clean_env())
        with process.stdout:
            for line in process.stdout: emit('log', text=line.rstrip()[:2000])
        if process.wait(): raise ValueError('包操作或依赖检查失败；查看日志和操作前清单，已发生的修改不会自动回滚')
    run(['check'])
    if payload.get('action') == 'uninstall':
        name = normalized(payload['package'])
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', name): raise ValueError('无效包名')
        if name in {'pip','setuptools','wheel','langchain','langchain-core','langchain-openai','langgraph','openai','httpx','pydantic'}:
            raise ValueError('运行基础包不允许卸载')
        code = '''import importlib.metadata as m,json,re,sys
norm=lambda n:re.sub(r'[-_.]+','-',n).lower()
name=sys.argv[1]
print(json.dumps([d.metadata['Name'] for d in m.distributions() if norm(d.metadata['Name'])!=name and any(norm(re.split(r'[\\s\\[<>=!~;(@]',r,1)[0])==name for r in (d.requires or []))]))'''
        result = subprocess.run([python,'-I','-c',code,name],capture_output=True,text=True,encoding='utf-8',timeout=20,env=clean_env(),check=True)
        users = json.loads(result.stdout)
        if users: raise ValueError('其他包声明依赖此包（含可选依赖），不能卸载：' + ', '.join(users))
        if name not in {normalized(p['name']) for p in info['packages']}: raise ValueError('此包未安装')
        emit('status',text='正在从现有环境卸载 ' + name)
        run(['uninstall','--yes',name])
    else:
        source = scan_nas(payload['nas'])
        if source['packages'] != payload['catalog']: raise ValueError('NAS 包清单已变化，请重新扫描后安装')
        selected = payload['packages']
        available = {p['name']+'=='+p['version'] for p in source['packages']}
        if not selected or any(n not in available for n in selected): raise ValueError('请选择 NAS 中的有效包版本')
        wheels = cache/'wheelhouse'; wheels.mkdir()
        emit('status',text='从 NAS 复制 wheel 到本机缓存并校验 SHA256')
        for package in source['packages']:
            target = wheels/package['filename']; shutil.copyfile(package['path'],target)
            if hashlib.sha256(target.read_bytes()).hexdigest() != package['sha256']: raise ValueError('复制校验失败：'+target.name)
        report = cache/'plan.json'
        emit('status',text='检查兼容性与依赖；仅使用 NAS 缓存，不访问其他软件源')
        run(['install','--dry-run','--no-index','--no-cache-dir','--only-binary=:all:',
             '--find-links',str(wheels),'--report',str(report)] + selected)
        plan = json.loads(report.read_text(encoding='utf-8'))['install']
        lines=[]
        for item in plan:
            name=normalized(item['metadata']['name']); version=item['metadata']['version']
            digest=item['download_info']['archive_info']['hashes']['sha256']
            if not any(p['name']==name and p['version']==version and p['sha256']==digest for p in source['packages']):
                raise ValueError('安装计划含 NAS 清单外的包')
            lines.append(name+'=='+version+' --hash=sha256:'+digest)
        if lines:
            lock=cache/'install.lock'; lock.write_text('\n'.join(lines)+'\n',encoding='utf-8')
            emit('status',text='安装到现有解释器：'+python+'；不创建环境')
            run(['install','--no-index','--no-cache-dir','--no-deps','--only-binary=:all:',
                 '--require-hashes','--find-links',str(wheels),'-r',str(lock)])
        else: emit('status',text='选中的版本已安装，无需修改')
    run(['check'])
    result=inspect_python(python)
    (cache/'after.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
    emit('status',text='包管理完成，依赖检查通过')
    return result


def clean_env():
    env = {k: v for k, v in os.environ.items() if not k.startswith(('PIP_', 'PYTHON', 'LANGSMITH', 'LANGCHAIN'))
           and k not in ('VIRTUAL_ENV', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'LLM_API_KEY')}
    env.update(PYTHONIOENCODING='utf-8', PYTHONNOUSERSITE='1', PYTHONDONTWRITEBYTECODE='1',
               PIP_CONFIG_FILE=os.devnull, LANGSMITH_TRACING='false', LANGCHAIN_TRACING_V2='false')
    return env


PROBE = '''import sys,json,platform,importlib.util,importlib.metadata
print(json.dumps({"version":platform.python_version(),"machine":platform.machine(),
"executable":sys.executable,"base_executable":getattr(sys,"_base_executable",sys.executable),
"prefix":sys.prefix,"base_prefix":sys.base_prefix,
"modules":{n:importlib.util.find_spec(n) is not None for n in ["langchain","langchain_openai","openpyxl","docx","pypdf","pptx","pip","ensurepip"]},
"packages":sorted([{"name":d.metadata.get("Name","unknown"),"version":d.version} for d in importlib.metadata.distributions()],key=lambda x:x["name"].lower())}))'''


def inspect_python(executable):
    path = Path(executable).absolute()
    if not path.is_file(): raise ValueError('解释器文件不存在')
    result = subprocess.run([str(path), '-I', '-B', '-c', PROBE], capture_output=True,
                            encoding='utf-8', errors='replace', timeout=20, env=clean_env())
    if result.returncode: raise ValueError('解释器自检失败：' + result.stderr[-1000:])
    info = json.loads(result.stdout)
    info['path'] = str(path)
    info['system'] = str(Path(info['prefix']).resolve()).startswith(('/usr', '/bin', '/sbin'))
    return info
