"""仅监听本机的工作助手服务；网页、API、任务进程与本地状态。"""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import threading
import time
from urllib.parse import parse_qs, urlsplit
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from workbench.environment import clean_env, inspect_python, scan_nas
from workbench.files import Workspace
from kylin_app import redact, validate_url


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


class App:
    def __init__(self, root=ROOT, data=None):
        self.root = Path(root)
        self.data = Path(data) if data else self.root / 'data'
        self.lock = threading.RLock()
        self.token = secrets.token_urlsafe(32)
        self.key = os.environ.get('LLM_API_KEY', '')
        self.redaction_keys = {self.key} if self.key else set()
        self.jobs = {}
        self.cache = {}
        self.data.mkdir(parents=True, exist_ok=True)
        state_path = self.data / 'state.json'
        if state_path.exists(): self.state = json.loads(state_path.read_text(encoding='utf-8'))
        else:
            current = {'id': 'current', 'name': '已验证 core 环境', 'path': sys.executable, 'kind': 'private'}
            self.state = {'interpreters': [current], 'workspaces': [], 'bundles': [], 'selected': None,
                          'settings': {'base_url': '', 'model': 'deepseek_v4', 'models': ['deepseek_v4', 'qwen3.8'], 'request_timeout': 45}}
            previous = self.root.parent / 'AgentApp/config.json'
            if previous.is_file():
                try:
                    values = json.loads(previous.read_text(encoding='utf-8'))
                    validate_url(values.get('base_url', ''))
                    for field in ('base_url', 'model', 'models'):
                        if field in values: self.state['settings'][field] = values[field]
                except (ValueError, OSError): pass
            runtime = self.root.parent / 'AgentRuntime/runtime'
            if runtime.exists():
                for path in runtime.glob('*/bin/python3'):
                    self.state['interpreters'].append({'id': uuid.uuid4().hex, 'name': path.parents[1].name,
                                                      'path': str(path.absolute()), 'kind': 'runtime'})
            system = Path('/usr/bin/python3')
            if system.is_file(): self.state['interpreters'].append({'id': 'system', 'name': '系统 Python · 只读',
                                                                  'path': str(system), 'kind': 'system'})
            samples = self.root / 'samples'
            if samples.is_dir():
                self.state['workspaces'].append({'id': 'sample', 'name': '示例工作区', 'root': str(samples.resolve()), 'interpreter': 'current'})
                self.state['selected'] = 'sample'
            self.save()

    def save(self): atomic_json(self.data / 'state.json', self.state)

    def find(self, category, identifier):
        result = next((x for x in self.state[category] if x['id'] == identifier), None)
        if result is None: raise ValueError('未找到对应项目')
        return result

    def workspace(self, identifier=None): return self.find('workspaces', identifier or self.state['selected'])

    def interpreter(self, identifier): return self.find('interpreters', identifier)

    def session_path(self, identifier):
        if not isinstance(identifier, str) or len(identifier) != 32 or any(c not in '0123456789abcdef' for c in identifier):
            raise ValueError('无效会话编号')
        return self.data / 'sessions' / (identifier + '.json')

    def session(self, identifier): return json.loads(self.session_path(identifier).read_text(encoding='utf-8'))

    def sessions(self, workspace):
        result = []
        for path in (self.data / 'sessions').glob('*.json'):
            item = json.loads(path.read_text(encoding='utf-8'))
            if item['workspace'] == workspace:
                result.append({k: item[k] for k in ('id', 'title', 'updated')})
        return sorted(result, key=lambda x: x['updated'], reverse=True)[:50]

    def new_session(self, workspace):
        self.workspace(workspace)
        item = {'id': uuid.uuid4().hex, 'workspace': workspace, 'title': '新对话', 'updated': time.time(),
                'messages': [], 'history': []}
        atomic_json(self.session_path(item['id']), item)
        return item

    def public_state(self):
        return dict(self.state, has_key=bool(self.key), suggested_bundle='',
                    jobs=[{k: j[k] for k in ('id', 'kind', 'status', 'title', 'created', 'session')} for j in self.jobs.values()])

    def inspect(self, identifier, refresh=False):
        interpreter = self.interpreter(identifier)
        cached = self.cache.get(identifier)
        if cached and not refresh and time.time() - cached[0] < 60: return cached[1]
        info = inspect_python(interpreter['path'])
        self.cache[identifier] = (time.time(), info)
        return info

    def append(self, job, event):
        def scrub(value):
            if isinstance(value, str):
                for key in self.redaction_keys: value = redact(value, key)
                return value
            if isinstance(value, dict): return {k: scrub(v) for k, v in value.items()}
            if isinstance(value, list): return [scrub(v) for v in value]
            return value
        clean = scrub(event)
        with self.lock:
            if len(job['events']) < 1000: job['events'].append(dict(clean, at=time.time()))

    def start(self, kind, python, payload, title, session=None, on_success=None):
        with self.lock:
            if any(j['kind'] == 'install' and not j.get('settled', False) for j in self.jobs.values()):
                raise ValueError('正在管理环境中的包，请等待完成')
            if sum(j['status'] == 'running' for j in self.jobs.values()) >= 3: raise ValueError('已有 3 个任务运行，请等待或停止')
            if session and any(j['session'] == session and j['status'] == 'running' for j in self.jobs.values()):
                raise ValueError('该对话正在运行')
            identifier = uuid.uuid4().hex
            job = {'id': identifier, 'kind': kind, 'title': title, 'session': session, 'created': time.time(),
                   'status': 'running', 'events': [], 'process': None, 'settled': False}
            self.jobs[identifier] = job
            thread = threading.Thread(target=self.run_job, args=(job, python, payload, on_success), daemon=True)
            thread.start()
            return {'id': identifier}

    def run_job(self, job, python, payload, on_success):
        process = None
        timer = None
        result = None
        error = None
        try:
            with self.lock:
                if job['status'] != 'running': return
                options = {'start_new_session': True} if os.name != 'nt' else {'creationflags': subprocess.CREATE_NO_WINDOW}
                process = subprocess.Popen([python, '-B', str(self.root / 'workbench/worker.py')], stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, encoding='utf-8', errors='replace', env=clean_env(), **options)
                job['process'] = process
            timer = threading.Timer(1200 if job['kind'] == 'install' else 300, lambda: self.cancel(job['id'], timed_out=True))
            timer.daemon = True
            timer.start()
            process.stdin.write(json.dumps(payload, ensure_ascii=False))
            process.stdin.close()
            for line in process.stdout:
                try: event = json.loads(line)
                except ValueError:
                    self.append(job, {'type': 'log', 'text': line.strip()[:2000]})
                    continue
                if event.get('type') == 'result': result = event['value']
                elif event.get('type') == 'error':
                    error = event.get('text', '任务失败')
                    self.append(job, event)
                else: self.append(job, event)
            exit_code = process.wait()
            with self.lock:
                if job['status'] == 'running':
                    if exit_code or result is None: raise RuntimeError(error or '任务进程未返回结果')
                    if on_success: on_success(result)
                    job['status'] = 'done'
                    if job['kind'] == 'chat': self.append(job, {'type': 'answer', 'text': result['answer']})
                    else: self.append(job, {'type': 'status', 'text': '任务完成'})
        except Exception as exc:
            with self.lock:
                if job['status'] == 'running':
                    job['status'] = 'failed'
                    self.append(job, {'type': 'error', 'text': str(exc)[:3000]})
        finally:
            if timer: timer.cancel()
            if process:
                if process.stdout: process.stdout.close()
                if process.stdin and not process.stdin.closed: process.stdin.close()
            with self.lock:
                if job['session'] and job['status'] != 'done':
                    item = self.session(job['session'])
                    item['messages'].append({'role': 'assistant', 'text': '任务已停止。' if job['status'] == 'cancelled'
                                             else '本次任务未完成，请查看执行记录。', 'events': job['events']})
                    atomic_json(self.session_path(item['id']), item)
                if job['kind'] == 'install': self.cache.clear()
                job['process'] = None
                job['settled'] = True
                atomic_json(self.data / 'jobs' / (job['id'] + '.json'), {k: v for k, v in job.items() if k != 'process'})

    def cancel(self, identifier, timed_out=False):
        with self.lock:
            job = self.jobs[identifier]
            if job['status'] != 'running': return {'status': job['status']}
            job['status'] = 'timeout' if timed_out else 'cancelled'
            self.append(job, {'type': 'status', 'text': '任务超时，已终止进程' if timed_out else '已停止任务进程'})
            process = job['process']
            if process and process.poll() is None:
                try:
                    if os.name == 'nt':
                        stopped = subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True,
                                                 timeout=10, creationflags=subprocess.CREATE_NO_WINDOW)
                        if stopped.returncode and process.poll() is None: process.kill()
                    else: os.killpg(process.pid, signal.SIGTERM)
                except (OSError, subprocess.TimeoutExpired): process.kill()
            return {'status': job['status']}

    def chat(self, payload):
        item = self.session(payload['session'])
        workspace = self.workspace(item['workspace'])
        if any(j['session'] == item['id'] and j['status'] == 'running' for j in self.jobs.values()):
            raise ValueError('请先等待当前回答或停止任务')
        text = payload.get('text', '').strip()
        if not text or len(text) > 16000: raise ValueError('消息长度需为 1 到 16000 字符')
        settings = self.state['settings']
        validate_url(settings['base_url'])
        if not self.key: raise ValueError('请先在模型设置中填写 API Key')
        if len(json.dumps(item['history'])) > 250000: raise ValueError('当前对话上下文已较长，请新建对话')
        interpreter = self.interpreter(workspace['interpreter'])
        model = payload.get('model', settings['model'])
        if model not in settings['models']: raise ValueError('请选择已配置的模型')
        packet = {'mode': 'chat', 'root': workspace['root'], 'text': text, 'history': item['history'],
                  'key': self.key, 'model': model, 'config': settings}
        def success(result):
            current = self.session(item['id'])
            current['history'] = result['history']
            current['messages'].append({'role': 'assistant', 'text': result['answer'],
                                        'events': self.jobs[job_id]['events'][:]})
            current['updated'] = time.time()
            atomic_json(self.session_path(current['id']), current)
        # HTTP 调用持有全局锁，子进程回调会等待用户消息落盘。
        job_id = self.start('chat', interpreter['path'], packet, text[:40], item['id'], success)['id']
        item['messages'].append({'role': 'user', 'text': text})
        if item['title'] == '新对话': item['title'] = text[:24]
        item['updated'] = time.time()
        atomic_json(self.session_path(item['id']), item)
        return {'id': job_id}

    def read_file(self, workspace_id, path, start):
        if any(j['kind'] == 'install' and not j.get('settled', False) for j in self.jobs.values()):
            raise ValueError('正在管理环境中的包，请等待完成')
        workspace = self.workspace(workspace_id)
        interpreter = self.interpreter(workspace['interpreter'])
        packet = {'mode': 'read', 'root': workspace['root'], 'path': path, 'start': start}
        result = subprocess.run([interpreter['path'], '-B', str(self.root / 'workbench/worker.py')],
            input=json.dumps(packet), capture_output=True, encoding='utf-8', errors='replace', env=clean_env(), timeout=45)
        for line in reversed(result.stdout.splitlines()):
            try: event = json.loads(line)
            except ValueError: continue
            if event['type'] == 'result': return event['value']
            if event['type'] == 'error': raise ValueError(event['text'])
        raise ValueError('文件读取进程失败：' + result.stderr[-500:])

    def get(self, path, query):
        q = lambda name, default='': query.get(name, [default])[0]
        if path == '/api/state': return self.public_state()
        if path == '/api/files': return Workspace(self.workspace(q('workspace'))['root']).list(q('path', '.'))
        if path == '/api/read': return self.read_file(q('workspace'), q('path'), int(q('start', '1')))
        if path == '/api/search': return Workspace(self.workspace(q('workspace'))['root']).search(q('q'), q('path', '.'))
        if path == '/api/sessions': return self.sessions(q('workspace'))
        if path == '/api/session':
            item = self.session(q('id'))
            return {k: v for k, v in item.items() if k != 'history'}
        if path == '/api/interpreter': return self.inspect(q('id'), q('refresh') == '1')
        if path == '/api/job':
            job = self.jobs[q('id')]
            after = max(0, int(q('after', '0')))
            status = job['status'] if job['status'] == 'running' or job['settled'] else 'stopping'
            return {'id': job['id'], 'status': status, 'events': job['events'][after:], 'cursor': len(job['events'])}
        if path == '/api/job-history':
            records = []
            for file in (self.data / 'jobs').glob('*.json'):
                item = json.loads(file.read_text(encoding='utf-8'))
                if item['kind'] == 'install': records.append(item)
            return sorted(records, key=lambda r: r['created'], reverse=True)[:30]
        raise ValueError('接口不存在')

    def post(self, path, payload):
        if path == '/api/settings':
            settings = payload['settings']
            validate_url(settings['base_url'])
            models = settings['models']
            if not isinstance(models, list) or not 1 <= len(models) <= 10 or any(not isinstance(m, str) or not m.strip() or len(m) > 100 for m in models):
                raise ValueError('请填写有效模型列表')
            if settings['model'] not in models: raise ValueError('默认模型不在列表中')
            self.state['settings'] = {'base_url': settings['base_url'].rstrip('/'), 'model': settings['model'],
                                      'models': models, 'request_timeout': 45}
            if payload.get('key'):
                if not isinstance(payload['key'], str) or len(payload['key']) > 4096: raise ValueError('API Key 格式错误')
                self.key = payload['key']
                self.redaction_keys.add(self.key)
            if payload.get('clear_key'): self.key = ''
            self.save()
            return {'saved': True}
        if path == '/api/test-model':
            settings = self.state['settings']
            validate_url(settings['base_url'])
            if not self.key: raise ValueError('尚未填写 API Key')
            workspace = self.workspace()
            return self.start('test', self.interpreter(workspace['interpreter'])['path'],
                {'mode': 'test_model', 'config': settings, 'key': self.key}, '验证模型连接')
        if path == '/api/workspace':
            root = Workspace(payload['root']).root
            interpreter = self.interpreter(payload['interpreter'])
            if interpreter['kind'] == 'system': raise ValueError('系统解释器仅展示，请选择私有环境')
            item = {'id': uuid.uuid4().hex, 'name': (payload.get('name') or root.name)[:50],
                    'root': str(root), 'interpreter': interpreter['id']}
            self.state['workspaces'].append(item)
            self.state['selected'] = item['id']
            self.save()
            return item
        if path == '/api/select-workspace':
            item = self.workspace(payload['id'])
            self.state['selected'] = item['id']
            self.save()
            return item
        if path == '/api/switch-interpreter':
            item = self.workspace(payload['workspace'])
            if any(j['status'] == 'running' for j in self.jobs.values()): raise ValueError('请先等待当前任务完成或停止')
            info = self.inspect(payload['interpreter'], True)
            if not info['modules'].get('langchain_openai') or not info['modules'].get('langchain'):
                raise ValueError('此解释器没有核心 Agent 依赖，无法用于工作区对话')
            item['interpreter'] = payload['interpreter']
            self.save()
            return item
        if path == '/api/new-session': return self.new_session(payload['workspace'])
        if path == '/api/chat': return self.chat(payload)
        if path == '/api/cancel': return self.cancel(payload['id'])
        if path == '/api/interpreter':
            info = inspect_python(payload['path'])
            item = {'id': uuid.uuid4().hex, 'name': payload.get('name', '私有解释器')[:60],
                    'path': info['path'], 'kind': 'system' if info['system'] else 'private'}
            self.state['interpreters'].append(item)
            self.cache[item['id']] = (time.time(), info)
            self.save()
            return item
        if path == '/api/import-bundle':
            validated = scan_nas(payload['path'])
            item = dict(validated, id=uuid.uuid4().hex)
            self.state['bundles'] = [b for b in self.state['bundles'] if b['path'] != item['path']] + [item]
            self.save()
            return item
        if path == '/api/install':
            if any(not j.get('settled', False) for j in self.jobs.values()):
                raise ValueError('请先等待所有任务结束，再修改现有环境')
            base = self.interpreter(payload['interpreter'])
            if base['kind'] == 'system': raise ValueError('系统 Python 只读')
            action = payload.get('action', 'install')
            if action not in ('install','uninstall'): raise ValueError('无效包操作')
            packet = {'mode': 'install', 'action': action, 'python': base['path'],
                      'cache': str(self.data / 'package-cache' / uuid.uuid4().hex)}
            if action == 'install':
                bundle = self.find('bundles', payload['bundle'])
                if 'packages' not in bundle: raise ValueError('请重新扫描 NAS 目录')
                packages = payload.get('packages')
                available = {p['name']+'=='+p['version'] for p in bundle['packages']}
                if not isinstance(packages,list) or not packages or any(n not in available for n in packages):
                    raise ValueError('请选择 NAS 中的包版本')
                if len({n.split('==')[0] for n in packages}) != len(packages): raise ValueError('同一个包只能选择一个版本')
                packet.update(nas=bundle['path'], catalog=bundle['packages'], packages=packages)
                title = 'NAS 安装 · ' + ', '.join(packages)[:120]
            else:
                packet['package'] = payload['package']
                title = '卸载 · ' + payload['package'][:100]
            def success(info):
                self.cache.clear()
            self.cache.clear()
            return self.start('install', sys.executable, packet, title, on_success=success)
        raise ValueError('接口不存在')


def handler_for(app):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def respond(self, status, content, content_type='application/json; charset=utf-8'):
            data = content if isinstance(content, bytes) else json.dumps(content, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            self.end_headers()
            try: self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError): pass
        def authorized(self, api=False):
            port = self.server.server_port
            hosts = {'127.0.0.1:{}'.format(port), 'localhost:{}'.format(port)}
            if self.headers.get('Host') not in hosts: return False
            origin = self.headers.get('Origin')
            if origin and origin not in {'http://' + h for h in hosts}: return False
            if api and not secrets.compare_digest(self.headers.get('X-Workbench-Token', ''), app.token): return False
            return True
        def do_GET(self):
            parsed = urlsplit(self.path)
            if not self.authorized(parsed.path.startswith('/api/')):
                return self.respond(403, {'error': '仅允许本机工作助手页面访问'})
            try:
                if parsed.path.startswith('/api/'):
                    # 读文件/解释器检查不持有状态锁，避免阻塞取消请求。
                    result = app.get(parsed.path, parse_qs(parsed.query))
                    return self.respond(200, result)
                static = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
                          '/style.css': ('style.css', 'text/css; charset=utf-8')}
                if parsed.path not in static: return self.respond(404, {'error': '页面不存在'})
                filename, mime = static[parsed.path]
                data = (app.root / 'workbench/static' / filename).read_bytes()
                if filename == 'index.html': data = data.replace(b'__TOKEN__', app.token.encode())
                return self.respond(200, data, mime)
            except Exception as exc:
                return self.respond(400, {'error': redact(str(exc), app.key)[:2000]})
        def do_POST(self):
            if not self.authorized(True): return self.respond(403, {'error': '请求来源或会话令牌无效'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 100000: raise ValueError('请求大小无效')
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict): raise ValueError('请求必须是 JSON 对象')
                # 长时间只读校验在锁外完成；修改配置与任务创建串行提交。
                with app.lock: result = app.post(urlsplit(self.path).path, payload)
                return self.respond(200, result)
            except Exception as exc:
                return self.respond(400, {'error': redact(str(exc), app.key)[:2000]})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--data', type=Path)
    args = parser.parse_args()
    app = App(data=args.data)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler_for(app))
    server.daemon_threads = True
    print('本地工作助手已启动：http://127.0.0.1:{}'.format(server.server_port), flush=True)
    print('保持此终端打开；按 Ctrl+C 退出。')
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally:
        for identifier in list(app.jobs): app.cancel(identifier)
        server.server_close()


if __name__ == '__main__': main()
