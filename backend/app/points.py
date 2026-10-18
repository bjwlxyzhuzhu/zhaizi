"""积分：只增不改的流水，余额 = 流水合计（PRD §4、§5.3）。

扣分流程（POINT-1）：
  发起   FREEZE   −n   （可用余额立即减少，防止并发超扣）
  成功   UNFREEZE +n  →  CONSUME −n
  失败   REFUND   +n   （超时/报错/内容安全拦截，全额退回）
"""
import threading
import uuid
from collections import defaultdict
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import PointLedger, PointRule, UsageLog, User

DEFAULT_RULES = [
    ("new_user_default", "新用户默认积分", 100),
    ("cost_qa", "AI文字问答（每次）", 1),
    ("cost_vision", "AI图像释读（每次）", 5),
    ("cost_export", "导出问答报告（每次）", 3),
    ("reward_correction", "释文纠错被采纳", 10),
    ("reward_dialect", "方言条目标注通过（每条）", 2),
    ("daily_limit", "每用户每日消耗上限", 50),
]
ACTION_RULE = {"qa": "cost_qa", "vision": "cost_vision", "export": "cost_export"}

_locks: dict[int, threading.Lock] = defaultdict(threading.Lock)
_locks_guard = threading.Lock()


def user_lock(user_id: int) -> threading.Lock:
    with _locks_guard:
        return _locks[user_id]


def rule(db: Session, key: str) -> int:
    r = db.get(PointRule, key)
    if r:
        return r.value
    return dict((k, v) for k, _, v in DEFAULT_RULES)[key]


def balance(db: Session, user_id: int) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(PointLedger.amount), 0)).where(PointLedger.user_id == user_id)) or 0)


def _today_start() -> datetime:
    n = datetime.now()
    return n.replace(hour=0, minute=0, second=0, microsecond=0)


def frozen_amount(db: Session, user_id: int) -> int:
    """尚未结算的冻结额（FREEZE 未配对 UNFREEZE/REFUND）。"""
    rows = db.execute(select(PointLedger.type, PointLedger.amount, PointLedger.ref_id)
                      .where(PointLedger.user_id == user_id, PointLedger.ref_type == "hold")).all()
    open_holds: dict[str, int] = {}
    for t, amt, ref in rows:
        if t == "FREEZE":
            open_holds[ref] = -amt
        elif t in ("UNFREEZE", "REFUND"):
            open_holds.pop(ref, None)
    return sum(open_holds.values())


def today_consumed(db: Session, user_id: int) -> int:
    used = db.scalar(select(func.coalesce(func.sum(PointLedger.amount), 0)).where(
        PointLedger.user_id == user_id, PointLedger.type == "CONSUME", PointLedger.created_at >= _today_start())) or 0
    return -int(used)


def add_entry(db: Session, user_id: int, type_: str, amount: int, *, reason: str = "", ref_type: str = "",
              ref_id: str = "", operator_id: int | None = None) -> PointLedger:
    bal = balance(db, user_id) + amount
    if bal < 0:
        raise HTTPException(400, "余额不足，扣减后不得为负")
    e = PointLedger(user_id=user_id, type=type_, amount=amount, balance_after=bal, reason=reason,
                    ref_type=ref_type, ref_id=ref_id, operator_id=operator_id)
    db.add(e)
    db.flush()
    return e


def is_free(user: User) -> bool:
    return user.role in ("admin", "researcher")


def check_affordable(db: Session, user: User, action: str) -> tuple[bool, str]:
    if is_free(user):
        return True, ""
    cost = rule(db, ACTION_RULE[action])
    if balance(db, user.id) < cost:
        return False, "积分不足，可去任务中心获取"
    limit = rule(db, "daily_limit")
    if today_consumed(db, user.id) + frozen_amount(db, user.id) + cost > limit:
        return False, f"已达每日消耗上限（{limit} 分），明日再试"
    return True, ""


class Hold:
    """一次 AI 请求的积分预扣。用独立事务提交冻结，保证并发请求立即可见。"""

    def __init__(self, user: User, action: str):
        self.user = user
        self.action = action
        self.hold_id = uuid.uuid4().hex[:16]
        self.cost = 0
        self.free = is_free(user)

    def freeze(self):
        if self.free:
            return
        with user_lock(self.user.id):
            db = SessionLocal()
            try:
                # Postgres 下锁定用户行，SQLite 下由进程锁保证串行
                db.execute(select(User).where(User.id == self.user.id).with_for_update())
                ok, msg = check_affordable(db, self.user, self.action)
                if not ok:
                    raise HTTPException(402, msg)
                self.cost = rule(db, ACTION_RULE[self.action])
                add_entry(db, self.user.id, "FREEZE", -self.cost, reason=f"{self.action} 预扣",
                          ref_type="hold", ref_id=self.hold_id)
                db.commit()
            finally:
                db.close()

    def settle(self, success: bool, reason: str = ""):
        if self.free or not self.cost:
            return
        with user_lock(self.user.id):
            db = SessionLocal()
            try:
                if success:
                    add_entry(db, self.user.id, "UNFREEZE", self.cost, reason="解冻", ref_type="hold", ref_id=self.hold_id)
                    add_entry(db, self.user.id, "CONSUME", -self.cost, reason=f"{self.action} 消耗",
                              ref_type=self.action, ref_id=self.hold_id)
                else:
                    add_entry(db, self.user.id, "REFUND", self.cost, reason=reason or "请求失败，退回",
                              ref_type="hold", ref_id=self.hold_id)
                db.commit()
            finally:
                db.close()


def log_usage(db: Session, user: User, action: str, *, cost: int, success: bool, error: str = "",
              tokens_in: int = 0, tokens_out: int = 0, latency_ms: int = 0, model: str = ""):
    db.add(UsageLog(user_id=user.id, role=user.role, action=action, cost_points=cost, charged=not is_free(user),
                    success=success, error=error[:200], tokens_in=tokens_in, tokens_out=tokens_out,
                    latency_ms=latency_ms, model=model))
