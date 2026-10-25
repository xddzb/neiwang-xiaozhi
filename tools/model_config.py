"""Portable configuration protection, not protection against client reverse engineering."""
import base64
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'extensions/python'))
from local_aead import AESGCM

# Shared deployment key: deliberately portable per the user's deployment choice.
def local_key():
    target = CONFIG/'.local-key'
    target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists():
        try:
            with target.open('xb') as f: f.write(os.urandom(32))
            target.chmod(0o600)
        except FileExistsError: pass
    value=target.read_bytes()
    if len(value)!=32: raise ValueError('invalid local configuration key')
    return value
CONFIG=Path(os.environ.get('NEIWANG_CONFIG_DIR',str(Path(os.environ.get('NEIWANG_DATA_DIR',str(ROOT/'data')))/'config')))
KEY = local_key()
AAD = b'NEIWANG-MODEL-1'

def validate(value):
    if not isinstance(value, dict) or value.get('version') != 1:
        raise ValueError('invalid configuration')
    parsed = urlsplit(value['base_url'])
    if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('invalid address')
    if not isinstance(value['api_key'],str) or not value['api_key'].strip() or any(x in value['api_key'] for x in '\r\n'):
        raise ValueError('invalid key')
    models = value['models']
    if not isinstance(models,list) or not 1 <= len(models) <= 30 or any(not isinstance(x,str) or not x.strip() or len(x)>200 for x in models):
        raise ValueError('invalid models')
    if value['default_model'] not in models:
        raise ValueError('invalid default')
    return value

def encode(value):
    raw = json.dumps(validate(value),ensure_ascii=False).encode('utf-8')
    nonce = os.urandom(12)
    return json.dumps({'format':AAD.decode(),'payload':base64.b64encode(nonce+AESGCM(KEY).encrypt(nonce,raw,AAD)).decode()},indent=2).encode()

def decode(raw):
    envelope = json.loads(raw)
    if envelope['format'] != AAD.decode(): raise ValueError('invalid format')
    data = base64.b64decode(envelope['payload'],validate=True)
    return validate(json.loads(AESGCM(KEY).decrypt(data[:12],data[12:],AAD)))

if __name__ == '__main__':
    try:
        path = CONFIG/'model.enc'
        if sys.argv[1:] == ['generate']:
            value = json.load(sys.stdin)
            encrypted = encode(value)
            path.parent.mkdir(parents=True,exist_ok=True)
            temporary = path.with_suffix('.enc.new')
            temporary.write_bytes(encrypted)
            os.replace(temporary,path)
            print('OK')
        elif sys.argv[1:] == ['check']:
            decode(path.read_bytes())
            print('OK')
        else:
            raise ValueError('invalid operation')
    except Exception:
        print('模型配置缺失、损坏或格式无效。请用配置生成工具重新生成 data/config/model.enc。',file=sys.stderr)
        sys.exit(1)
