from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import points
from ..config import LOCK_MINUTES, LOCK_THRESHOLD, REFRESH_DAYS
from ..db import get_db
from ..deps import ROLE_LABEL, audit, client_ip, current_user, current_user_any
from ..models import Notification, User
from ..security import decode_token, hash_password, make_token, password_ok, verify_password

router = APIRouter(prefix="/auth", tags=["认证"])


class LoginIn(BaseModel):
    account: str
    password: str


class ChangePwdIn(BaseModel):
    old_password: str
    new_password: str


def user_out(db: Session, u: User) -> dict:
    return {
        "id": u.id, "account": u.account, "name": u.name, "org": u.org, "role": u.role,
        "role_label": ROLE_LABEL.get(u.role, u.role), "is_super": u.is_super, "identity_type": u.identity_type,
        "must_change_pwd": u.must_change_pwd, "points": points.balance(db, u.id),
        "unread": db.scalar(select(func.count()).select_from(Notification).where(
            Notification.user_id == u.id, Notification.read.is_(False))) or 0,
    }


def _issue(response: Response, u: User) -> str:
    response.set_cookie("zz_refresh", make_token(u.id, u.token_version, "refresh"), httponly=True,
                        samesite="lax", max_age=REFRESH_DAYS * 86400, path="/api/auth")
    return make_token(u.id, u.token_version, "access")


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.account == body.account.strip()))
    generic = HTTPException(400, "账号或密码错误")  # AUTH-1：不区分账号不存在和密码错误
    if not u:
        raise generic
    now = datetime.now()
    if u.locked_until and u.locked_until > now:
        mins = int((u.locked_until - now).total_seconds() // 60) + 1
        raise HTTPException(423, f"连续输错次数过多，账号已锁定，请 {mins} 分钟后再试")
    if not verify_password(body.password, u.password_hash):
        u.failed_attempts += 1
        if u.failed_attempts >= LOCK_THRESHOLD:
            u.locked_until = now + timedelta(minutes=LOCK_MINUTES)
            u.failed_attempts = 0
            audit(db, u, "账号锁定", u.account, {"minutes": LOCK_MINUTES}, client_ip(request))
            db.commit()
            raise HTTPException(423, f"连续输错 {LOCK_THRESHOLD} 次，账号已锁定 {LOCK_MINUTES} 分钟")
        db.commit()
        raise generic
    if u.status != "active":
        raise HTTPException(403, "账号已停用，请联系管理员")
    u.failed_attempts = 0
    u.locked_until = None
    u.last_login_at = now
    audit(db, u, "登录", u.account, {}, client_ip(request))
    db.commit()
    return {"access_token": _issue(response, u), "user": user_out(db, u)}


@router.post("/refresh")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    payload = decode_token(request.cookies.get("zz_refresh", ""))
    if not payload or payload.get("kind") != "refresh":
        raise HTTPException(401, "登录已过期")
    u = db.get(User, int(payload["sub"]))
    if not u or u.status != "active" or u.token_version != payload.get("tv"):
        raise HTTPException(401, "登录已过期")
    return {"access_token": _issue(response, u), "user": user_out(db, u)}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("zz_refresh", path="/api/auth")
    return {"ok": True}


@router.get("/me")
def me(u: User = Depends(current_user_any), db: Session = Depends(get_db)):
    return user_out(db, u)


@router.post("/change-password")
def change_password(body: ChangePwdIn, request: Request, response: Response,
                    u: User = Depends(current_user_any), db: Session = Depends(get_db)):
    if not verify_password(body.old_password, u.password_hash):
        raise HTTPException(400, "原密码不正确")
    if not password_ok(body.new_password):
        raise HTTPException(400, "新密码至少 8 位，且须同时包含字母和数字")
    if body.old_password == body.new_password:
        raise HTTPException(400, "新密码不能与原密码相同")
    u.password_hash = hash_password(body.new_password)
    u.must_change_pwd = False
    u.token_version += 1
    audit(db, u, "修改密码", u.account, {}, client_ip(request))
    db.commit()
    return {"access_token": _issue(response, u), "user": user_out(db, u)}


@router.get("/notifications")
def notifications(u: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Notification).where(Notification.user_id == u.id)
                      .order_by(Notification.id.desc()).limit(50)).all()
    return [{"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "read": n.read,
             "created_at": n.created_at.isoformat(timespec="minutes")} for n in rows]


@router.post("/notifications/read-all")
def read_all(u: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == u.id).values(read=True))
    db.commit()
    return {"ok": True}
