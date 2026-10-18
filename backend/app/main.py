from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import UPLOAD_DIR
from .db import Base, SessionLocal, engine
from .routers import admin, auth, dash, kg, lib, qa, res, tasks

app = FastAPI(title="宅兹·周秦出土文献智能研究平台", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

for r in (auth.router, admin.router, qa.router, lib.router, res.router, kg.router, tasks.router, dash.router):
    app.include_router(r, prefix="/api")


@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    from .seed import seed_if_empty
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    from . import config
    from .llm import model_label
    return {"ok": True, "model": model_label(), "anon": config.ANON, "org_line": config.ORG_LINE,
            "org_short": config.ORG_SHORT, "image_credit": config.IMAGE_CREDIT}


@app.get("/api/files/{path:path}")
def files(path: str):
    # 上传文件名为随机 UUID；只允许访问 uploads 目录内文件
    p = (UPLOAD_DIR / path).resolve()
    if UPLOAD_DIR.resolve() not in p.parents or not p.is_file():
        raise HTTPException(404, "文件不存在")
    return FileResponse(p)


# 生产环境：直接托管前端构建产物（开发时由 Vite 代理）
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        f = DIST / full_path
        if full_path and f.is_file() and DIST in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
