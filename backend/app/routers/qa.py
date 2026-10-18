import base64
import html
import time
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import llm, points, qa_engine, retrieval
from ..config import QA_CONTEXT_TURNS, RETRIEVAL_TOP_K, UPLOAD_DIR
from ..db import get_db
from ..deps import audit, client_ip, current_user, require
from ..models import Adjudication, Chunk, Glyph, PointLedger, QAMessage, QASession, User

router = APIRouter(tags=["问答"])


# ---------------- 积分（个人） ----------------
@router.get("/points/me")
def my_points(days: int = 30, u: User = Depends(current_user), db: Session = Depends(get_db)):
    since = datetime.now() - timedelta(days=days)
    rows = db.scalars(select(PointLedger).where(PointLedger.user_id == u.id, PointLedger.created_at >= since)
                      .order_by(PointLedger.id.desc()).limit(300)).all()
    limit = points.rule(db, "daily_limit")
    used = points.today_consumed(db, u.id) + points.frozen_amount(db, u.id)
    earned = lambda t: sum(e.amount for e in db.scalars(select(PointLedger).where(PointLedger.user_id == u.id, PointLedger.type == t)))
    return {
        "balance": points.balance(db, u.id), "free": points.is_free(u), "daily_limit": limit,
        "today_used": used, "today_left": max(limit - used, 0),
        "rules": {k: points.rule(db, k) for k, _, _ in points.DEFAULT_RULES},
        "summary": {"granted": earned("GRANT") + earned("IMPORT"), "task_reward": earned("TASK_REWARD"),
                    "consumed": -earned("CONSUME")},
        "ledger": [{"id": e.id, "type": e.type, "amount": e.amount, "balance_after": e.balance_after,
                    "reason": e.reason, "created_at": e.created_at.isoformat(timespec="seconds")} for e in rows],
    }


@router.get("/points/check")
def check(action: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    ok, msg = points.check_affordable(db, u, action)
    return {"ok": ok, "message": msg, "cost": 0 if points.is_free(u) else points.rule(db, points.ACTION_RULE[action])}


# ---------------- 会话 ----------------
def _msg(m: QAMessage) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content, "segments": m.segments, "citations": m.citations,
            "verify": m.verify, "status": m.status, "model": m.model.replace("演示模型", "库内检索摘引"), "latency_ms": m.latency_ms,
            "cost_points": m.cost_points, "excluded_internal": m.excluded_internal, "candidates": m.candidates,
            "image_url": f"/api/files/{m.image_path}" if m.image_path else "",
            "created_at": m.created_at.isoformat(timespec="seconds")}


@router.get("/qa/sessions")
def sessions(kind: str = "", u: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(QASession).where(QASession.user_id == u.id)
    if kind:
        stmt = stmt.where(QASession.kind == kind)
    rows = db.scalars(stmt.order_by(QASession.updated_at.desc()).limit(100)).all()
    return [{"id": s.id, "title": s.title, "kind": s.kind, "updated_at": s.updated_at.isoformat(timespec="minutes")} for s in rows]


class SessionIn(BaseModel):
    title: str = "新会话"
    kind: str = "text"


@router.post("/qa/sessions")
def new_session(body: SessionIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = QASession(user_id=u.id, title=body.title[:60], kind=body.kind)
    db.add(s)
    db.commit()
    return {"id": s.id, "title": s.title, "kind": s.kind}


def _own_session(db, sid, u) -> QASession:
    s = db.get(QASession, sid)
    if not s or s.user_id != u.id:
        raise HTTPException(404, "会话不存在")
    return s


@router.get("/qa/sessions/{sid}")
def session_detail(sid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _own_session(db, sid, u)
    msgs = db.scalars(select(QAMessage).where(QAMessage.session_id == sid).order_by(QAMessage.id)).all()
    return {"id": s.id, "title": s.title, "kind": s.kind, "messages": [_msg(m) for m in msgs]}


@router.delete("/qa/sessions/{sid}")
def delete_session(sid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _own_session(db, sid, u)
    s.user_id = -u.id  # 软删除：保留问答记录用于审计与统计
    db.commit()
    return {"ok": True}


class AskIn(BaseModel):
    question: str


def _run_answer(db: Session, u: User, s: QASession, question: str, action: str, *, image_rel: str = "",
                image_data_url: str | None = None, extra_query: str = "", candidates: list | None = None):
    """统一执行：预扣 → 安全 → 检索 → 模型 → 核验 → 安全 → 结算。"""
    from .agents import scope_for
    collections, doc_ids = scope_for(db, "vision" if action == "vision" else "text")
    hold = points.Hold(u, action)
    hold.freeze()  # 余额不足抛 402
    shadow_cost = points.rule(db, points.ACTION_RULE[action])
    user_msg = QAMessage(session_id=s.id, role="user", content=question, image_path=image_rel)
    db.add(user_msg)
    if s.title == "新会话":
        s.title = question[:24] or "图像释读"
    s.updated_at = datetime.now()
    db.commit()
    t0 = time.time()
    ans = QAMessage(session_id=s.id, role="assistant")
    try:
        qa_engine.check_safety(db, question)
        chunks, excluded = retrieval.search(db, question + " " + extra_query, k=RETRIEVAL_TOP_K, collections=collections, knowledge_doc_ids=doc_ids)
        history = []
        prev = db.scalars(select(QAMessage).where(QAMessage.session_id == s.id, QAMessage.id < user_msg.id,
                                                  QAMessage.status == "ok").order_by(QAMessage.id.desc())
                          .limit(QA_CONTEXT_TURNS * 2)).all()
        for m in reversed(prev):
            history.append((m.role, m.content))
        msgs = qa_engine.build_messages(question, chunks, history)
        if not chunks and action == "qa":
            text, tin, tout, model = "库内暂无相关资料。", 0, 0, llm.model_label()  # QA-5 无出处拒答，不调模型
        else:
            text, tin, tout, model = llm.chat(msgs, image_data_url=image_data_url, demo_chunks=chunks, question=question)
        qa_engine.check_safety(db, text)
        segments, citations, report = qa_engine.verify(text, chunks)
        ans.content, ans.segments, ans.citations, ans.verify = text, segments, citations, report
        ans.retrieved_ids = [c.cid for c in chunks]
        ans.model, ans.tokens_in, ans.tokens_out = model, tin, tout
        ans.excluded_internal = excluded
        ans.candidates = candidates or []
        ans.latency_ms = int((time.time() - t0) * 1000)
        ans.cost_points = hold.cost
        ans.status = "ok"
        db.add(ans)
        points.log_usage(db, u, action, cost=shadow_cost, success=True, tokens_in=tin, tokens_out=tout,
                         latency_ms=ans.latency_ms, model=model)
        db.commit()
        hold.settle(True)
    except qa_engine.Blocked as e:
        db.rollback()
        hold.settle(False, "内容安全拦截，退回")
        ans.status, ans.content = "blocked", "该请求未通过内容安全检查，已拦截，积分已退回。"
        db.add(ans)
        audit(db, u, "内容安全拦截", f"会话{s.id}", {"word": str(e), "question": question[:100]})
        points.log_usage(db, u, action, cost=shadow_cost, success=False, error="blocked")
        db.commit()
    except llm.ModelError as e:
        db.rollback()
        hold.settle(False, f"{e}，退回")
        ans.status, ans.content = "failed", f"模型调用失败：{e}。本次预扣积分已全额退回，请稍后重试。"
        db.add(ans)
        points.log_usage(db, u, action, cost=shadow_cost, success=False, error=str(e),
                         latency_ms=int((time.time() - t0) * 1000))
        db.commit()
    except Exception:
        db.rollback()
        hold.settle(False, "系统错误，退回")
        raise
    return {"question": _msg(user_msg), "answer": _msg(ans), "balance": points.balance(db, u.id)}


@router.post("/qa/sessions/{sid}/messages")
def ask(sid: int, body: AskIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _own_session(db, sid, u)
    q = body.question.strip()
    if not q:
        raise HTTPException(400, "问题不能为空")
    return _run_answer(db, u, s, q[:1000], "qa")


@router.post("/qa/vision")
async def vision(file: UploadFile = File(...), declaration: str = Form(...), hint: str = Form(""),
                 session_id: int | None = Form(None), u: User = Depends(current_user), db: Session = Depends(get_db)):
    if declaration not in ("self", "public", "licensed"):
        raise HTTPException(400, "请先选择材料来源声明")  # QA-7
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "图片不能超过 10MB")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png"):
        raise HTTPException(400, "仅支持 JPG / PNG")
    ok, msg = points.check_affordable(db, u, "vision")
    if not ok:
        raise HTTPException(402, msg)
    rel = f"vision/{uuid.uuid4().hex}.{ext}"
    (UPLOAD_DIR / "vision").mkdir(exist_ok=True)
    (UPLOAD_DIR / rel).write_bytes(data)
    s = _own_session(db, session_id, u) if session_id else None
    if not s:
        s = QASession(user_id=u.id, title="新会话", kind="vision")
        db.add(s)
        db.commit()
    settings = llm.runtime_settings()
    glyph_chars = [g for (g,) in db.execute(select(Glyph.character).distinct())]
    if settings["api_key"]:
        # 正式模型：先让模型给候选字，再用候选字检索字形库与器铭库
        import json
        mime = "image/png" if ext == "png" else "image/jpeg"
        url = f"data:{mime};base64,{base64.b64encode(data).decode()}"
        try:
            raw, *_ = llm.chat([{"role": "user", "content": llm.VISION_PROMPT + (f" 提示：{hint}" if hint else "")}],
                               image_data_url=url)
            cands = json.loads(raw[raw.find("{"): raw.rfind("}") + 1]).get("candidates", [])[:4]
        except Exception:
            cands = llm.demo_vision(hint, glyph_chars)
    else:
        cands = llm.demo_vision(hint, glyph_chars)
    top = cands[0]["char"] if cands else hint
    question = f"拓片图像释读：候选字“{top}”的字形依据与出处是什么？" + (f"（用户提示：{hint}）" if hint else "")
    res = _run_answer(db, u, s, question, "vision", image_rel=rel, extra_query=" ".join(c["char"] for c in cands) + " 字形",
                      candidates=cands)
    res["session_id"] = s.id
    res["declaration"] = declaration
    return res


class ReportIn(BaseModel):
    reason: str = ""


@router.post("/qa/messages/{mid}/report")
def report(mid: int, body: ReportIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """QA-9：一键发起释文纠错，返回带入的上下文，由前端跳到任务中心提交。"""
    m = db.get(QAMessage, mid)
    if not m:
        raise HTTPException(404, "消息不存在")
    s = _own_session(db, m.session_id, u)
    q = db.scalar(select(QAMessage).where(QAMessage.session_id == s.id, QAMessage.id < m.id, QAMessage.role == "user")
                  .order_by(QAMessage.id.desc()))
    target = (m.citations or [{}])[0]
    return {"target_type": target.get("ref_table", "qa_messages"), "target_id": target.get("cid", f"QA{m.id}"),
            "target_title": target.get("title", "AI 回答"), "context": {"question": q.content if q else "",
                                                                        "answer": m.content[:600], "message_id": m.id}}


@router.post("/qa/messages/{mid}/adjudicate")
def send_adjudication(mid: int, request: Request, u: User = Depends(require("admin", "researcher")),
                      db: Session = Depends(get_db)):
    """QA-10：研究员、管理员把 AI 释读送入裁断队列。"""
    m = db.get(QAMessage, mid)
    if not m or m.role != "assistant":
        raise HTTPException(404, "消息不存在")
    if db.scalar(select(Adjudication).where(Adjudication.qa_message_id == mid)):
        raise HTTPException(400, "该回答已在裁断队列中")
    q = db.scalar(select(QAMessage).where(QAMessage.session_id == m.session_id, QAMessage.id < m.id,
                                          QAMessage.role == "user").order_by(QAMessage.id.desc()))
    cand = m.candidates[0]["char"] if m.candidates else ""
    a = Adjudication(qa_message_id=m.id, title=(f"字形候选“{cand}”" if cand else (q.content[:30] if q else "AI 回答")),
                     candidate=m.content, question=q.content if q else "", evidence=m.citations,
                     confidence=int((m.candidates[0]["score"] if m.candidates else 0.6) * 100),
                     image_path=q.image_path if q else "", submitted_by=u.id)
    db.add(a)
    audit(db, u, "送裁断", a.title, {"message_id": mid}, client_ip(request))
    db.commit()
    return {"id": a.id}


@router.post("/qa/sessions/{sid}/export")
def export(sid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """QA-12：导出问答报告（Word 可直接打开的 .doc），用户扣 3 分。"""
    s = _own_session(db, sid, u)
    hold = points.Hold(u, "export")
    hold.freeze()
    try:
        msgs = db.scalars(select(QAMessage).where(QAMessage.session_id == sid).order_by(QAMessage.id)).all()
        parts = [f"<h1>宅兹·问答报告：{html.escape(s.title)}</h1><p>导出人：{html.escape(u.name)}　时间：{datetime.now():%Y-%m-%d %H:%M}</p>"]
        cites = {}
        for m in msgs:
            if m.role == "user":
                parts.append(f"<h3>问：{html.escape(m.content)}</h3>")
            else:
                body = "".join(f"{html.escape(seg['text'])}" + "".join(f"<sup>[{c}]</sup>" for c in seg["cites"]) +
                               (" <b style='color:#B5452F'>（D级·模型推测，未经核验）</b>" if seg["grade"] == "D" else "") +
                               ("<br/>" if seg.get("newline") else "") for seg in (m.segments or [])) or html.escape(m.content)
                parts.append(f"<p>{body}</p>")
                for c in m.citations or []:
                    cites[c["cid"]] = c
        parts.append("<h2>引用清单</h2><ol>" + "".join(
            f"<li>[{c['cid']}] {html.escape(c['title'])}（证据等级 {c['grade']}）</li>" for c in cites.values()) + "</ol>")
        parts.append("<hr/><p><i>本报告由AI辅助生成，引用以库内条目为准。</i></p>")
        doc = "<html><head><meta charset='utf-8'></head><body style='font-family:SimSun'>" + "".join(parts) + "</body></html>"
        points.log_usage(db, u, "export", cost=points.rule(db, "cost_export"), success=True)
        db.commit()
        hold.settle(True)
    except Exception:
        hold.settle(False, "导出失败，退回")
        raise
    return Response(doc.encode("utf-8"), media_type="application/msword",
                    headers={"Content-Disposition": f"attachment; filename=report_{sid}.doc"})


@router.get("/qa/chunks/{cid}")
def chunk_detail(cid: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.scalar(select(Chunk).where(Chunk.cid == cid))
    if not c:
        raise HTTPException(404, "条目不存在")
    if u.role == "user" and (c.level != "L1" or c.status != "approved"):
        raise HTTPException(404, "条目不存在")
    ref_table, ref_id = c.ref_table, c.ref_id
    if ref_table == "inscriptions":
        from ..models import Inscription
        ins = db.get(Inscription, ref_id)
        ref_table, ref_id = "vessels", ins.vessel_id if ins else ref_id
    return {"cid": c.cid, "title": c.title, "text": c.text, "grade": c.evidence_grade, "level": c.level,
            "ref_table": ref_table, "ref_id": ref_id}


@router.get("/qa/stats")
def stats(u: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.scalar(select(func.count()).select_from(QAMessage).join(QASession, QASession.id == QAMessage.session_id)
                  .where(QASession.user_id == u.id, QAMessage.role == "assistant")) or 0
    return {"answers": n}
