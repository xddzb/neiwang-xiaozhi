"""Local TLS integration tests. No organization configuration or login state is read."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import ssl
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('api_tls_fixture', ROOT/'tools/api_tool.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
PAYLOAD = b'{"marker":"SYNTHETIC_TLS_OK"}'


class Handler(BaseHTTPRequestHandler):
    redirected = 0

    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path == '/redirect':
            self.send_response(302)
            self.send_header('Location', '/received')
            self.end_headers()
            return
        if self.path == '/received':
            type(self).redirected += 1
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(PAYLOAD)))
        self.end_headers()
        self.wfile.write(PAYLOAD)


class CertificateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        openssl = os.environ.get('NEIWANG_TEST_OPENSSL') or shutil.which('openssl')
        if not openssl:
            raise unittest.SkipTest('OpenSSL is required to generate an ephemeral self-signed fixture')
        cls.temp = tempfile.TemporaryDirectory(prefix='neiwang-tls-')
        cls.addClassCleanup(cls.temp.cleanup)
        cls.home = Path(cls.temp.name)
        cert, key = cls.home/'cert.pem', cls.home/'key.pem'
        subprocess.run([openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                        '-subj', '/CN=fixture.invalid', '-keyout', str(key), '-out', str(cert)],
                       check=True, capture_output=True)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key)
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.server.socket = context.wrap_socket(cls.server.socket, server_side=True)
        cls.url = 'https://127.0.0.1:'+str(cls.server.server_port)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.addClassCleanup(cls.stop_server)

    @classmethod
    def stop_server(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def query(self, route, output):
        config = self.home/'config'
        for name in ['sources', 'connections']:
            (config/name).mkdir(parents=True, exist_ok=True)
        (config/'sources/fixture.json').write_text(json.dumps({
            'enabled': True, 'read_only': True, 'method': 'GET',
            'connection': 'fixture', 'path': route}), encoding='utf8')
        (config/'connections/fixture.json').write_text(json.dumps({
            'base_url': self.url, 'auth_mode': 'none'}), encoding='utf8')
        connection_before = (config/'connections/fixture.json').read_bytes()
        with patch.object(api, 'CONFIG', config), patch.object(sys, 'argv', [
            'api_tool.py', 'query', '--source', 'fixture', '--workspace', str(self.home), '--output', output
        ]), patch.dict(os.environ, {'no_proxy': '127.0.0.1', 'NO_PROXY': '127.0.0.1'}):
            result = api.main()
        self.assertEqual((config/'connections/fixture.json').read_bytes(), connection_before)
        return result

    def test_default_tls_still_rejects_certificate(self):
        with self.assertRaises(urllib.error.URLError) as caught:
            urllib.request.build_opener(urllib.request.ProxyHandler({})).open(self.url, timeout=5)
        self.assertIsInstance(caught.exception.reason, ssl.SSLCertVerificationError)

    def test_registered_api_downloads_self_signed_hostname_mismatch(self):
        result = self.query('/query', 'download.json')
        self.assertTrue(result['ok'], result)
        self.assertEqual((self.home/'download.json').read_bytes(), PAYLOAD)
        self.assertEqual(result['sha256'], hashlib.sha256(PAYLOAD).hexdigest())
        self.assertEqual(result['json_status'], 'validated')
        self.assertFalse(list(self.home.glob('.api-*.part')))

    def test_redirect_remains_blocked(self):
        result = self.query('/redirect', 'redirect.json')
        self.assertEqual(result['status'], 'http_error')
        self.assertEqual(result['http_status'], 302)
        self.assertEqual(Handler.redirected, 0)
        self.assertFalse((self.home/'redirect.json').exists())

    def test_real_electron_browser(self):
        electron = os.environ.get('NEIWANG_TEST_ELECTRON')
        if not electron:
            self.skipTest('Set NEIWANG_TEST_ELECTRON to run the actual desktop browser')
        env = dict(os.environ, NEIWANG_BROWSER_PROFILE=str(self.home/'browser-profile'),
                   NEIWANG_TEST_HTTPS_URL=self.url+'/query')
        env.pop('ELECTRON_RUN_AS_NODE', None)
        result = subprocess.run([electron, str(ROOT/'scripts/test-browser-certificate.cjs')],
                                env=env, capture_output=True, timeout=35)
        self.assertEqual(result.returncode, 0, result.stdout.decode('utf8', 'replace')+result.stderr.decode('utf8', 'replace'))
        self.assertIn(b'PASS: real business browser', result.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
