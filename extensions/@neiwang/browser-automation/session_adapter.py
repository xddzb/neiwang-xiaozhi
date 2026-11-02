"""Private loopback cookie bridge; never returns credentials to model-facing output."""
import json,os
from pathlib import Path
import urllib.parse,urllib.request

def _request(settings,url,connection=None):
    parsed=urllib.parse.urlsplit(url)
    origin=f'{parsed.scheme}://{parsed.netloc}'
    if parsed.scheme not in ('http','https') or parsed.username or parsed.password or origin not in settings.get('allowed_origins',[]):
        raise ValueError('origin_not_allowed')
    root=Path(os.environ['NEIWANG_APP_ROOT'])
    data=Path(os.environ.get('NEIWANG_DATA_DIR',str(root/'data')))
    runtime=json.loads((data/'runtime/browser-automation.json').read_text(encoding='utf8'))
    port=runtime.get('port');token=runtime.get('token','')
    if type(port) is not int or not 1<=port<=65535 or len(token)!=64:
        raise ValueError('browser_runtime_unavailable')
    body=json.dumps({'url':url,'connection':connection}).encode('utf8')
    endpoint='session-headers' if connection else 'session-cookie'
    req=urllib.request.Request(f'http://127.0.0.1:{port}/{endpoint}',data=body,headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req,timeout=10) as response:
        raw=response.read(65537)
    if len(raw)>65536:raise ValueError('invalid_browser_response')
    result=json.loads(raw)
    if connection:
        headers=result.get('headers')
        if not result.get('ok') or not isinstance(headers,dict) or not headers:
            raise ValueError('playwright_login_required')
        import re
        for key,value in headers.items():
            if not isinstance(key,str) or not re.fullmatch(r'[a-zA-Z0-9-]+',key) or key.lower() in ('host','connection','content-length','content-type','origin','referer','proxy-authorization','set-cookie'):
                raise ValueError('invalid_browser_response')
            if not isinstance(value,str) or not value or len(value)>65536 or any(c in value for c in ('\r','\n','\x00')):
                raise ValueError('invalid_browser_response')
        return headers
    cookie=result.get('cookie','')
    if not result.get('ok') or not cookie or '\r' in cookie or '\n' in cookie:
        raise ValueError('playwright_login_required')
    return cookie


def cookie_header(settings,url):
    return _request(settings,url)

def auth_headers(settings,url,connection):
    return _request(settings,url,connection)
