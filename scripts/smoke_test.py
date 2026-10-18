"""Smoke-test a fresh demo container without external services or API keys."""
import json
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

base = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:18000'

def request(path, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    body = json.dumps(data).encode() if data is not None else None
    with urlopen(Request(base + path, data=body, headers=headers), timeout=10) as response:
        assert response.status == 200, response.status
        return response.read().decode('utf-8')

for attempt in range(60):
    try:
        health = json.loads(request('/api/health'))
        assert health['ok'] is True
        break
    except (URLError, TimeoutError):
        if attempt == 59:
            raise
        time.sleep(2)

homepage = request('/')
assert 'id="root"' in homepage, 'Frontend entry point is missing'
asset = re.search(r'src="(/assets/[^\"]+\.js)"', homepage)
assert asset, 'Built JavaScript asset is missing'
assert len(request(asset[1])) > 100, 'Built asset is empty'
assert 'id="root"' in request('/library/vessels'), 'SPA route fallback failed'

login = json.loads(request('/api/auth/login', {'account': 'u001', 'password': 'Zhaizi2026'}))
assert login['access_token'], 'Login failed'
assert login['user']['role'] == 'user', 'Unexpected demo role'
assert json.loads(request('/api/auth/me', token=login['access_token']))['account'] == 'u001'
try:
    request('/api/admin/users', token=login['access_token'])
    raise AssertionError('A normal user can access administrator endpoints')
except HTTPError as error:
    assert error.code == 403, error.code

print('Smoke test passed: API, frontend, assets, SPA routing, login and role permissions.')
