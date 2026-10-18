import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import points
from ..config import UPLOAD_DIR
from ..db import get_db
from ..deps import current_user, require
from ..models import DialectEntry, TaskBatch, TaskSubmission, TaskTemplate, User

router = APIRouter(prefix="/tasks", tags=["任务中心"])
user_only = require("user")


def _today_count(db, uid, tid):
    start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return db.scalar(select(func.count()).select_from(TaskSubmission).where(
        TaskSubmission.user_id == uid, TaskSubmission.template_id == tid, TaskSubmission.created_at >= start)) or 0


@router.get("")
def overview(u: User = Depends(current_user), db: Session = Depends(get_db)):
    tpls = db.scalars(select(TaskTemplate).where(TaskTemplate.enabled.is_(True))).all()
    reward_rule = {"correction": "reward_correction", "dialect": "reward_dialect"}
    batches = db.scalars(select(TaskBatch).where(TaskBatch.status == "open").order_by(TaskBatch.id.desc())).all()
    mine = db.scalars(select(TaskSubmission).where(TaskSubmission.user_id == u.id).order_by(TaskSubmission.id.desc()).limit(100)).all()
    done_items: dict[int, set] = {}
    for s in mine:
        if s.batch_id:
            done_items.setdefault(s.batch_id, set()).add(s.target_id)
    tmap = {t.id: t for t in tpls}
    return {
        "templates": [{"id": t.id, "code": t.code, "name": t.name, "description": t.description,
                       "reward": points.rule(db, reward_rule[t.code]) if t.code in reward_rule else t.reward,
                       "daily_limit": t.daily_limit, "today": _today_count(db, u.id, t.id)} for t in tpls],
        "batches": [{"id": b.id, "title": b.title, "description": b.description, "template": tmap[b.template_id].name if b.template_id in tmap else "",
                     "total": len(b.items), "done": len(done_items.get(b.id, set())),
                     "created_at": b.created_at.isoformat(timespec="minutes")} for b in batches],
        "mine": [{"id": s.id, "template": tmap[s.template_id].name if s.template_id in tmap else "", "target_title": s.target_title,
                  "status": s.status, "reward": s.reward, "reject_reason": s.reject_reason, "content": s.content,
                  "created_at": s.created_at.isoformat(timespec="minutes")} for s in mine],
    }


@router.get("/batches/{bid}")
def batch_items(bid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    b = db.get(TaskBatch, bid)
    if not b:
        raise HTTPException(404, "任务不存在")
    done = {s.target_id for s in db.scalars(select(TaskSubmission).where(TaskSubmission.batch_id == bid, TaskSubmission.user_id == u.id))}
    rows = db.scalars(select(DialectEntry).where(DialectEntry.id.in_(b.items))).all()
    return {"id": b.id, "title": b.title, "description": b.description,
            "items": [{"id": d.id, "district": d.district, "word": d.word, "ipa": d.ipa, "meaning": d.meaning,
                       "audio": d.audio_path, "done": str(d.id) in done} for d in rows]}


@router.post("/{code}/submissions")
async def submit(code: str, target_type: str = Form(""), target_id: str = Form(""), target_title: str = Form(""),
                 content: str = Form("{}"), batch_id: int | None = Form(None), image: UploadFile | None = File(None),
                 u: User = Depends(user_only), db: Session = Depends(get_db)):
    tpl = db.scalar(select(TaskTemplate).where(TaskTemplate.code == code, TaskTemplate.enabled.is_(True)))
    if not tpl:
        raise HTTPException(404, "任务类型不存在")
    if _today_count(db, u.id, tpl.id) >= tpl.daily_limit:
        raise HTTPException(400, f"今日“{tpl.name}”已达上限 {tpl.daily_limit} 次")
    data = json.loads(content or "{}")
    if code == "correction" and (not data.get("opinion") or not data.get("basis")):
        raise HTTPException(400, "请填写纠错意见和依据")
    if code == "dialect" and not (data.get("ipa") or data.get("meaning")):
        raise HTTPException(400, "请填写或校对音标与词义")
    if batch_id and db.scalar(select(TaskSubmission).where(TaskSubmission.batch_id == batch_id, TaskSubmission.user_id == u.id,
                                                           TaskSubmission.target_id == target_id)):
        raise HTTPException(400, "该条目已提交过")
    rel = ""
    if image and image.filename:
        raw = await image.read()
        if len(raw) > 10 * 1024 * 1024:
            raise HTTPException(400, "图片不能超过 10MB")
        rel = f"tasks/{uuid.uuid4().hex}.{image.filename.rsplit('.', 1)[-1].lower()}"
        (UPLOAD_DIR / "tasks").mkdir(exist_ok=True)
        (UPLOAD_DIR / rel).write_bytes(raw)
    s = TaskSubmission(template_id=tpl.id, batch_id=batch_id, user_id=u.id, target_type=target_type, target_id=target_id,
                       target_title=target_title[:120], content=data, image_path=rel,
                       status="pending" if tpl.need_review else "approved")
    db.add(s)
    db.commit()
    return {"id": s.id, "status": s.status}
