"""Run the deployment smoke checks against local sources using isolated data."""
import os
from pathlib import Path
import secrets
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
env = dict(os.environ)
env['PYTHONDONTWRITEBYTECODE'] = '1'
env['ZZ_DATA_DIR'] = str(root / '.local-smoke-data')
env['ZZ_JWT_SECRET'] = secrets.token_hex(32)
env['ZZ_MODEL_API_KEY'] = ''
env.pop('DATABASE_URL', None)
with (root / 'smoke-server.log').open('w', encoding='utf-8') as log:
    server = subprocess.Popen(
        [sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '18001'],
        cwd=root / 'backend', env=env, stdout=log, stderr=subprocess.STDOUT,
    )
    try:
        subprocess.run([sys.executable, str(root / 'scripts/smoke_test.py'), 'http://127.0.0.1:18001'], check=True)
    finally:
        server.terminate()
        server.wait(timeout=15)
