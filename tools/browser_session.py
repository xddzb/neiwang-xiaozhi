"""Site-scoped, read-only browser session adapter. Never print credentials."""
import hashlib
from contextlib import closing
import http.cookiejar
import json
import os
from pathlib import Path
import sqlite3
import time
import urllib.parse
import urllib.request


class SessionError(Exception):
    pass


def cookie_header(settings, url, unprotect=None):
    # NEIWANG_PLAYWRIGHT_SESSION_V1
    if settings.get('driver') == 'playwright':
        try:
            import importlib.util
            import sys as _browser_sys
            _browser_sys.dont_write_bytecode = True
            from pathlib import Path as _BrowserPath
            _file = _BrowserPath(__file__).resolve().parents[1]/'extensions/node_modules/@neiwang/browser-automation/session_adapter.py'
            _spec = importlib.util.spec_from_file_location('_neiwang_playwright_session', _file)
            _adapter = importlib.util.module_from_spec(_spec)
            _spec.loader.exec_module(_adapter)
            return _adapter.cookie_header(settings, url)
        except Exception:
            raise SessionError('playwright_session_unavailable: 请在业务浏览器重新登录') from None

    parsed = urllib.parse.urlsplit(url)
    origin = f'{parsed.scheme}://{parsed.netloc}'
    if parsed.scheme not in ('http', 'https') or parsed.username or parsed.password:
        raise SessionError('invalid_origin')
    if origin not in settings.get('allowed_origins', []):
        raise SessionError('origin_not_allowed')
    profile = Path(settings['profile_path']).expanduser().resolve(strict=True)
    candidates = [profile/'Network'/'Cookies', profile/'Cookies']
    database = next((p for p in candidates if p.is_file()), None)
    if database is None:
        raise SessionError('cookie_database_not_found')
    host = parsed.hostname.lower()
    # Only query this host and possible parent-domain rows, never other sites.
    domains = [host] + ['.'+'.'.join(host.split('.')[i:]) for i in range(len(host.split('.'))-1)]
    jar = http.cookiejar.CookieJar()
    key = None
    try:
        with closing(sqlite3.connect(database.as_uri()+'?mode=ro', uri=True, timeout=1)) as db:
            db.execute('PRAGMA query_only=ON')
            columns = {r[1] for r in db.execute('PRAGMA table_info(cookies)')}
            partition = 'top_frame_site_key' if 'top_frame_site_key' in columns else "''"
            rows = db.execute('SELECT host_key,name,value,encrypted_value,path,is_secure,expires_utc,'+partition+
                              ' FROM cookies WHERE host_key IN ('+','.join('?' for _ in domains)+')', domains).fetchall()
            try:
                version = int(db.execute("SELECT value FROM meta WHERE key='version'").fetchone()[0])
            except (sqlite3.Error, TypeError, ValueError):
                version = 0
        for domain, name, value, encrypted, path, secure, expiry, partition_key in rows:
            if partition_key:
                continue  # Partition context cannot be reproduced by this HTTP client.
            expires = int(expiry/1000000-11644473600) if expiry else None
            if expires is not None and expires <= time.time():
                continue
            if not (host == domain.lstrip('.') or (domain.startswith('.') and host.endswith(domain))):
                continue
            request_path = parsed.path or '/'
            if not (request_path == path or (request_path.startswith(path) and (path.endswith('/') or request_path[len(path):].startswith('/')))):
                continue
            if secure and parsed.scheme != 'https':
                continue
            if encrypted:
                encrypted = bytes(encrypted)
                if os.name != 'nt' or unprotect is None:
                    raise SessionError('encrypted_cookie_unsupported_on_this_system')
                if encrypted.startswith(b'v20'):
                    raise SessionError('app_bound_encryption_unsupported')
                if encrypted.startswith((b'v10', b'v11')):
                    try:
                        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
                    except ImportError:
                        raise SessionError('local_dependency_missing_cryptography') from None
                    if key is None:
                        import base64
                        state = json.loads((profile.parent/'Local State').read_text(encoding='utf-8'))
                        wrapped = base64.b64decode(state['os_crypt']['encrypted_key'])
                        if not wrapped.startswith(b'DPAPI'):
                            raise SessionError('browser_key_format_unsupported')
                        key = unprotect(wrapped[5:], decrypt=True)
                    raw = AESGCM(key).decrypt(encrypted[3:15], encrypted[15:], None)
                else:
                    raw = unprotect(encrypted, decrypt=True)
                if version >= 24:
                    if raw[:32] != hashlib.sha256(domain.encode()).digest():
                        raise SessionError('cookie_domain_binding_invalid')
                    raw = raw[32:]
                value = raw.decode('utf-8')
            if any(c in name+value for c in '\r\n;') or not name or '=' in name:
                raise SessionError('cookie_format_unsupported')
            jar.set_cookie(http.cookiejar.Cookie(0,name,value,None,False,domain,
                domain.startswith('.'),domain.startswith('.'),path,True,bool(secure),expires,
                expires is None,None,None,{},False))
        request = urllib.request.Request(url)
        jar.add_cookie_header(request)
        result = request.get_header('Cookie')
        if not result:
            raise SessionError('no_matching_session_cookie')
        return result
    except SessionError:
        raise
    except Exception:
        raise SessionError('browser_session_read_failed') from None
