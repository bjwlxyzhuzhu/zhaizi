"""Run deployment smoke checks with disposable data and a local server thread."""
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import threading

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='zhaizi-smoke-') as smoke_data:
    os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
    os.environ['ZZ_DATA_DIR'] = smoke_data
    os.environ['ZZ_JWT_SECRET'] = secrets.token_hex(32)
    os.environ['ZZ_BOOTSTRAP_PASSWORD'] = secrets.token_urlsafe(24)
    os.environ['ZZ_MODEL_API_KEY'] = ''
    os.environ.pop('DATABASE_URL', None)
    sys.path.insert(0, str(root / 'backend'))
    import uvicorn
    from app.db import engine

    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config('app.main:app', host='127.0.0.1', port=port, log_level='warning'))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        subprocess.run([sys.executable, str(root / 'scripts/smoke_test.py'), f'http://127.0.0.1:{port}'], env=dict(os.environ), check=True)
    finally:
        server.should_exit = True
        thread.join(timeout=15)
        if thread.is_alive():
            raise RuntimeError('Local smoke-test server did not stop')
        engine.dispose()
