"""数据驾驶舱（PRD §5.9，指标口径见附录C）。"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, require
from ..models import (Adjudication, AuditLog, DialectEntry, Glyph, KGEdge, KGNode, KPITarget, PointLedger, QAMessage,
                      SystemSetting, TaskSubmission, TrustSample, UsageLog, User, Vessel)

router = APIRouter(prefix="/dash", tags=["驾驶舱"])
DISTRICTS = ["渭滨区", "金台区", "陈仓区", "凤翔区", "岐山县", "扶风县", "眉县", "陇县", "千阳县", "麟游县", "凤县", "太白县"]


def _count(db, M, *conds):
    return db.scalar(select(func.count()).select_from(M).where(*conds)) or 0


def base_metrics(db: Session) -> dict:
    dialect_districts = db.scalar(select(func.count(func.distinct(DialectEntry.district))).where(DialectEntry.status == "approved")) or 0
    s = db.get(SystemSetting, "eval_count")
    return {"vessels": _count(db, Vessel, Vessel.status == "approved"),
            "glyphs": _count(db, Glyph, Glyph.status == "approved"),
            "dialects": _count(db, DialectEntry, DialectEntry.status == "approved"), "dialect_districts": dialect_districts,
            "kg_nodes": _count(db, KGNode), "kg_edges": _count(db, KGEdge),
            "eval_items": int(s.value) if s else 0}


def trust_metrics(db: Session) -> dict:
    sampled, accurate, claims, unsourced = db.execute(select(
        func.coalesce(func.sum(TrustSample.sampled), 0), func.coalesce(func.sum(TrustSample.accurate), 0),
        func.coalesce(func.sum(TrustSample.claims), 0), func.coalesce(func.sum(TrustSample.unsourced_claims), 0))).one()
    done = _count(db, Adjudication, Adjudication.status == "done")
    adopted = _count(db, Adjudication, Adjudication.status == "done", Adjudication.decision.in_(("adopt", "revise")))
    return {"citation_accuracy": round(accurate / sampled * 100, 1) if sampled else None, "sampled": int(sampled),
            "unsourced_rate": round(unsourced / claims * 100, 1) if claims else None,
            "adoption_rate": round(adopted / done * 100, 1) if done else None, "adjudicated": done}


def qa_trend(db: Session, days=30):
    start = (datetime.now() - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = db.execute(select(func.date(UsageLog.created_at), UsageLog.action, func.count())
                      .where(UsageLog.created_at >= start).group_by(func.date(UsageLog.created_at), UsageLog.action)).all()
    m = {}
    for d, a, c in rows:
        m.setdefault(str(d), {})[a] = c
    out = []
    for i in range(days):
        d = (start + timedelta(days=i)).date().isoformat()
        out.append({"date": d, "qa": m.get(d, {}).get("qa", 0), "vision": m.get(d, {}).get("vision", 0)})
    return out


def feeds(db: Session):
    names = {u.id: u.name for u in db.scalars(select(User))}
    adjs = db.scalars(select(Adjudication).where(Adjudication.status == "done").order_by(Adjudication.decided_at.desc()).limit(8)).all()
    label = {"adopt": "采纳", "revise": "修订", "reject": "否决"}
    logs = db.scalars(select(AuditLog).where(AuditLog.action == "数据审核").order_by(AuditLog.id.desc()).limit(8)).all()
    # 只显示脱敏信息：研究员姓氏 + 老师
    mask = lambda n: (n[0] + "老师") if n else "研究员"
    return {"adjudications": [{"title": a.title, "decision": label.get(a.decision, ""), "by": mask(names.get(a.researcher_id, "")),
                               "at": a.decided_at.isoformat(timespec="minutes") if a.decided_at else ""} for a in adjs],
            "records": [{"title": l.target, "approve": (l.detail or {}).get("approve", True), "by": mask(l.actor_name),
                         "at": l.created_at.isoformat(timespec="minutes")} for l in logs]}


@router.get("/home")
def home(u: User = Depends(current_user), db: Session = Depends(get_db)):
    names = {x.id: x.name for x in db.scalars(select(User))}
    acts = db.scalars(select(AuditLog).where(AuditLog.action.in_(("数据审核", "专家裁断", "任务审核", "发布任务批次", "图谱新增节点", "Excel导入")))
                      .order_by(AuditLog.id.desc()).limit(12)).all()
    kind = {"数据审核": "审核", "专家裁断": "裁断", "任务审核": "积分", "发布任务批次": "任务", "图谱新增节点": "图谱", "Excel导入": "系统"}
    return {"metrics": base_metrics(db), "feed": [{"kind": kind.get(a.action, "系统"), "action": a.action, "target": a.target,
                                                  "actor": (a.actor_name[:1] + "**") if u.role == "user" else a.actor_name,
                                                  "at": a.created_at.isoformat(timespec="minutes")} for a in acts]}


@router.get("/screen")
def screen(u: User = Depends(require("admin", "researcher")), db: Session = Depends(get_db)):
    vs = db.scalars(select(Vessel).where(Vessel.status == "approved")).all()
    by_d = {d: [] for d in DISTRICTS}
    for v in vs:
        if v.district in by_d:
            by_d[v.district].append({"id": v.id, "name": v.name, "period": v.period, "image": v.image})
    hz = db.scalar(select(KGNode).where(KGNode.type == "器", KGNode.name == "何尊"))
    return {"metrics": base_metrics(db), "trust": trust_metrics(db), "trend": qa_trend(db), "feeds": feeds(db),
            "districts": [{"name": d, "count": len(by_d[d]), "vessels": by_d[d][:4]} for d in DISTRICTS],
            "showcase_node": hz.id if hz else None, "updated_at": datetime.now().isoformat(timespec="seconds")}


@router.get("/progress")
def progress(u: User = Depends(require("admin", "researcher")), db: Session = Depends(get_db)):
    m = base_metrics(db)
    t = trust_metrics(db)
    current = {"vessels": m["vessels"], "dialects": m["dialects"], "kg_nodes": m["kg_nodes"], "glyphs": m["glyphs"],
               "dialect_districts": m["dialect_districts"], "eval_items": m["eval_items"],
               "citation_accuracy": t["citation_accuracy"] or 0, "adjudicated": t["adjudicated"],
               "users": _count(db, User, User.status == "active")}
    out = []
    for k in db.scalars(select(KPITarget).order_by(KPITarget.year, KPITarget.id)):
        cur = current.get(k.metric, 0)
        out.append({"id": k.id, "indicator": k.indicator, "year": k.year, "target": k.target, "unit": k.unit,
                    "current": cur, "rate": round(min(cur / k.target, 1) * 100, 1) if k.target else 0})
    from .res import workload
    return {"kpis": out, "workload": workload(u, db)}


@router.get("/ops")
def ops(u: User = Depends(require("admin")), db: Session = Depends(get_db)):
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    users = db.scalars(select(User)).all()
    by_role = {}
    by_org = {}
    for x in users:
        by_role[x.role] = by_role.get(x.role, 0) + 1
        by_org[x.org or "未填写"] = by_org.get(x.org or "未填写", 0) + 1
    dau = db.scalar(select(func.count(func.distinct(AuditLog.actor_id))).where(AuditLog.action == "登录", AuditLog.created_at >= today)) or 0
    new_today = _count(db, User, User.created_at >= today)
    dau_trend = []
    for i in range(13, -1, -1):
        d0 = today - timedelta(days=i)
        n = db.scalar(select(func.count(func.distinct(AuditLog.actor_id))).where(
            AuditLog.action == "登录", AuditLog.created_at >= d0, AuditLog.created_at < d0 + timedelta(days=1))) or 0
        dau_trend.append({"date": d0.date().isoformat(), "dau": n})
    sumt = lambda *t: -int(db.scalar(select(func.coalesce(func.sum(PointLedger.amount), 0)).where(PointLedger.type.in_(t))) or 0)
    granted = -sumt("GRANT", "IMPORT")
    task_reward = -sumt("TASK_REWARD")
    consumed = sumt("CONSUME")
    balances = {}
    for (uid, bal) in db.execute(select(PointLedger.user_id, func.sum(PointLedger.amount)).group_by(PointLedger.user_id)):
        b = int(bal)
        k = "0" if b <= 0 else "1-49" if b < 50 else "50-99" if b < 100 else "100-199" if b < 200 else "200+"
        balances[k] = balances.get(k, 0) + 1
    calls = db.execute(select(UsageLog.role, UsageLog.action, func.count(), func.sum(UsageLog.tokens_in), func.sum(UsageLog.tokens_out),
                              func.avg(UsageLog.latency_ms), func.sum(case((UsageLog.success.is_(False), 1), else_=0)))
                       .group_by(UsageLog.role, UsageLog.action)).all()
    s = {r.key: r.value for r in db.scalars(select(SystemSetting))}
    pin, pout = float(s.get("price_in", "0.0024")), float(s.get("price_out", "0.0096"))  # 元/千token，可在系统设置配置
    total_calls = sum(c[2] for c in calls)
    fails = sum(int(c[6] or 0) for c in calls)
    tin = sum(int(c[3] or 0) for c in calls)
    tout = sum(int(c[4] or 0) for c in calls)
    subs_total = _count(db, TaskSubmission)
    subs_ok = _count(db, TaskSubmission, TaskSubmission.status == "approved")
    reviewed = db.scalars(select(TaskSubmission).where(TaskSubmission.reviewed_at.is_not(None))).all()
    avg_review_h = round(sum((x.reviewed_at - x.created_at).total_seconds() for x in reviewed) / len(reviewed) / 3600, 1) if reviewed else 0
    return {
        "users": {"total": len(users), "by_role": by_role, "by_org": dict(sorted(by_org.items(), key=lambda x: -x[1])[:8]),
                  "dau": dau, "new_today": new_today, "dau_trend": dau_trend},
        "points": {"granted": granted, "consumed": consumed, "task_reward": task_reward,
                   "task_ratio": round(task_reward / (granted + task_reward) * 100, 1) if granted + task_reward else 0,
                   "balance_dist": balances},
        "model": {"calls": total_calls, "fail_rate": round(fails / total_calls * 100, 1) if total_calls else 0,
                  "avg_latency": int(sum((c[5] or 0) * c[2] for c in calls) / total_calls) if total_calls else 0,
                  "tokens_in": tin, "tokens_out": tout, "cost": round(tin / 1000 * pin + tout / 1000 * pout, 2),
                  "by_role": [{"role": c[0], "action": c[1], "calls": c[2]} for c in calls]},
        "tasks": {"submitted": subs_total, "pass_rate": round(subs_ok / subs_total * 100, 1) if subs_total else 0,
                  "avg_review_hours": avg_review_h},
        "trend": qa_trend(db, 14),
        "answers": _count(db, QAMessage, QAMessage.role == "assistant"),
    }
