"""Private loopback cookie bridge; never returns credentials to model-facing output."""
import json,os
from pathlib import Path
import urllib.parse,urllib.request

def cookie_header(settings,url):
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
    body=json.dumps({'url':url}).encode('utf8')
    req=urllib.request.Request(f'http://127.0.0.1:{port}/session-cookie',data=body,headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req,timeout=10) as response:
        raw=response.read(65537)
    if len(raw)>65536:raise ValueError('invalid_browser_response')
    result=json.loads(raw);cookie=result.get('cookie','')
    if not result.get('ok') or not cookie or '\r' in cookie or '\n' in cookie:
        raise ValueError('playwright_login_required')
    return cookie
