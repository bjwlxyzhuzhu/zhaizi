from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .db import get_db
from .models import AuditLog, User
from .security import decode_token

ROLE_LABEL = {"admin": "管理员", "researcher": "研究员", "user": "用户"}


def _token_from(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    # 文件下载等场景允许 query 携带
    return request.query_params.get("token")


def current_user_any(request: Request, db: Session = Depends(get_db)) -> User:
    """已登录即可（含未改密用户，仅用于改密/退出/me 接口）。"""
    token = _token_from(request)
    payload = decode_token(token) if token else None
    if not payload or payload.get("kind") != "access":
        raise HTTPException(401, "登录已失效，请重新登录")
    user = db.get(User, int(payload["sub"]))
    if not user or user.status != "active" or user.token_version != payload.get("tv"):
        # AUTH-6：停用、重置密码、角色变更后旧令牌立即失效
        raise HTTPException(401, "账号状态已变更，请重新登录")
    return user


def current_user(user: User = Depends(current_user_any)) -> User:
    if user.must_change_pwd:
        raise HTTPException(403, "首次登录须先修改密码")  # AUTH-3
    return user


def require(*roles: str):
    def checker(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "无权访问")
        return user
    return checker


def require_super(user: User = Depends(current_user)) -> User:
    if not user.is_super:
        raise HTTPException(403, "仅超级管理员可操作")
    return user


def audit(db: Session, actor: User | None, action: str, target: str = "", detail: dict | None = None, ip: str = ""):
    db.add(AuditLog(actor_id=actor.id if actor else None, actor_name=actor.name if actor else "系统",
                    action=action, target=target, detail=detail or {}, ip=ip))


def client_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")
