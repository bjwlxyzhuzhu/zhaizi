"""数据表，对应 PRD §7.4。图谱与向量检索块也放在关系库中（MVP 不引入 Neo4j）。"""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now():
    return datetime.now()


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    account: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(40))
    org: Mapped[str] = mapped_column(String(80), default="")
    identity_type: Mapped[str] = mapped_column(String(20), default="其他")
    role: Mapped[str] = mapped_column(String(16), default="user")  # admin / researcher / user
    is_super: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(12), default="active")  # active / disabled
    must_change_pwd: Mapped[bool] = mapped_column(Boolean, default=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(20), default="")
    email: Mapped[str] = mapped_column(String(80), default="")
    remark: Mapped[str] = mapped_column(String(200), default="")
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class PointLedger(Base):
    __tablename__ = "point_ledger"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(16), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    balance_after: Mapped[int] = mapped_column(Integer)
    ref_type: Mapped[str] = mapped_column(String(32), default="")
    ref_id: Mapped[str] = mapped_column(String(40), default="")
    reason: Mapped[str] = mapped_column(String(200), default="")
    operator_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


class PointRule(Base):
    __tablename__ = "point_rules"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    label: Mapped[str] = mapped_column(String(40), default="")
    value: Mapped[int] = mapped_column(Integer)
    updated_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class UsageLog(Base):
    """AI 调用记录：包括管理员/研究员的“影子消耗”（POINT-6、DASH-11）。"""
    __tablename__ = "usage_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    role: Mapped[str] = mapped_column(String(16))
    action: Mapped[str] = mapped_column(String(20))  # qa / vision / export
    cost_points: Mapped[int] = mapped_column(Integer, default=0)
    charged: Mapped[bool] = mapped_column(Boolean, default=False)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    error: Mapped[str] = mapped_column(String(200), default="")
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    model: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


class ImportJob(Base):
    __tablename__ = "import_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    operator_id: Mapped[int] = mapped_column(Integer)
    filename: Mapped[str] = mapped_column(String(200))
    mode: Mapped[str] = mapped_column(String(10), default="skip")
    status: Mapped[str] = mapped_column(String(12), default="preview")  # preview / done
    total: Mapped[int] = mapped_column(Integer, default=0)
    created: Mapped[int] = mapped_column(Integer, default=0)
    updated: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    result_file: Mapped[str] = mapped_column(String(200), default="")
    result_downloaded: Mapped[bool] = mapped_column(Boolean, default=False)
    error_file: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


# ---------------- 资料库 ----------------
class Vessel(Base):
    __tablename__ = "vessels"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), index=True)
    category: Mapped[str] = mapped_column(String(20), default="")
    period: Mapped[str] = mapped_column(String(40), default="")
    find_place: Mapped[str] = mapped_column(String(80), default="")
    district: Mapped[str] = mapped_column(String(20), default="")
    find_date: Mapped[str] = mapped_column(String(40), default="")
    collection: Mapped[str] = mapped_column(String(80), default="")
    catalog_refs: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    image: Mapped[str] = mapped_column(String(200), default="")
    gallery: Mapped[list] = mapped_column(JSON, default=list)  # [{url, caption}]
    image_credit: Mapped[str] = mapped_column(String(120), default="")
    level: Mapped[str] = mapped_column(String(4), default="L1")
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending / approved / rejected
    evidence_grade: Mapped[str] = mapped_column(String(2), default="B")
    source: Mapped[str] = mapped_column(String(200), default="")
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Inscription(Base):
    __tablename__ = "inscriptions"
    id: Mapped[int] = mapped_column(primary_key=True)
    vessel_id: Mapped[int] = mapped_column(ForeignKey("vessels.id"), index=True)
    transcription: Mapped[str] = mapped_column(Text, default="")
    interpretation: Mapped[str] = mapped_column(Text, default="")
    char_count: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(200), default="")
    evidence_grade: Mapped[str] = mapped_column(String(2), default="B")
    level: Mapped[str] = mapped_column(String(4), default="L1")
    status: Mapped[str] = mapped_column(String(12), default="pending")
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Glyph(Base):
    __tablename__ = "glyphs"
    id: Mapped[int] = mapped_column(primary_key=True)
    character: Mapped[str] = mapped_column(String(4), index=True)
    script: Mapped[str] = mapped_column(String(8))  # 金文 / 石鼓文 / 小篆
    vessel_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_path: Mapped[str] = mapped_column(String(200), default="")
    note: Mapped[str] = mapped_column(String(200), default="")
    source: Mapped[str] = mapped_column(String(200), default="")
    level: Mapped[str] = mapped_column(String(4), default="L1")
    status: Mapped[str] = mapped_column(String(12), default="pending")
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Reading(Base):
    __tablename__ = "readings"
    id: Mapped[int] = mapped_column(primary_key=True)
    character: Mapped[str] = mapped_column(String(4), index=True)
    layer: Mapped[str] = mapped_column(String(8))  # 上古 / 中古 / 方言
    value: Mapped[str] = mapped_column(String(60))
    district: Mapped[str] = mapped_column(String(20), default="")
    source: Mapped[str] = mapped_column(String(200), default="")


class DialectEntry(Base):
    __tablename__ = "dialect_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    district: Mapped[str] = mapped_column(String(20), index=True)
    speaker_code: Mapped[str] = mapped_column(String(20), default="")
    word: Mapped[str] = mapped_column(String(40), index=True)
    ipa: Mapped[str] = mapped_column(String(60), default="")
    meaning: Mapped[str] = mapped_column(String(200), default="")
    audio_path: Mapped[str] = mapped_column(String(200), default="")
    source: Mapped[str] = mapped_column(String(200), default="")
    level: Mapped[str] = mapped_column(String(4), default="L1")
    status: Mapped[str] = mapped_column(String(12), default="pending")
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class TextPassage(Base):
    __tablename__ = "texts"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(40))
    chapter: Mapped[str] = mapped_column(String(40), default="")
    content: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(200), default="")
    related_vessel_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    level: Mapped[str] = mapped_column(String(4), default="L1")
    status: Mapped[str] = mapped_column(String(12), default="pending")
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class RecordVersion(Base):
    __tablename__ = "record_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    table_name: Mapped[str] = mapped_column(String(30), index=True)
    record_id: Mapped[int] = mapped_column(Integer, index=True)
    version: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict] = mapped_column(JSON)
    action: Mapped[str] = mapped_column(String(20), default="edit")
    editor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


# ---------------- 知识图谱 ----------------
class KGNode(Base):
    __tablename__ = "kg_nodes"
    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(12), index=True)
    name: Mapped[str] = mapped_column(String(60), index=True)
    props: Mapped[dict] = mapped_column(JSON, default=dict)
    ref_table: Mapped[str] = mapped_column(String(30), default="")
    ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    level: Mapped[str] = mapped_column(String(4), default="L1")


class KGEdge(Base):
    __tablename__ = "kg_edges"
    id: Mapped[int] = mapped_column(primary_key=True)
    src_id: Mapped[int] = mapped_column(ForeignKey("kg_nodes.id", ondelete="CASCADE"), index=True)
    dst_id: Mapped[int] = mapped_column(ForeignKey("kg_nodes.id", ondelete="CASCADE"), index=True)
    rel_type: Mapped[str] = mapped_column(String(20))
    source: Mapped[str] = mapped_column(String(200), default="")
    evidence_grade: Mapped[str] = mapped_column(String(2), default="B")


# ---------------- 检索块（向量检索的替身，见 retrieval.py） ----------------
class Chunk(Base):
    __tablename__ = "chunks"
    id: Mapped[int] = mapped_column(primary_key=True)
    cid: Mapped[str] = mapped_column(String(24), unique=True, index=True)  # 引用ID，如 V1 / I1 / T3 / ADJ2
    ref_table: Mapped[str] = mapped_column(String(30))
    ref_id: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(80))
    text: Mapped[str] = mapped_column(Text)
    evidence_grade: Mapped[str] = mapped_column(String(2), default="B")
    level: Mapped[str] = mapped_column(String(4), default="L1")
    status: Mapped[str] = mapped_column(String(12), default="approved")


# ---------------- 问答 ----------------
class QASession(Base):
    __tablename__ = "qa_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    title: Mapped[str] = mapped_column(String(80), default="新会话")
    kind: Mapped[str] = mapped_column(String(10), default="text")  # text / vision
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class QAMessage(Base):
    __tablename__ = "qa_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("qa_sessions.id"), index=True)
    role: Mapped[str] = mapped_column(String(10))  # user / assistant
    content: Mapped[str] = mapped_column(Text, default="")
    segments: Mapped[list] = mapped_column(JSON, default=list)  # [{text, cites:[cid], grade}]
    retrieved_ids: Mapped[list] = mapped_column(JSON, default=list)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    verify: Mapped[dict] = mapped_column(JSON, default=dict)
    image_path: Mapped[str] = mapped_column(String(200), default="")
    candidates: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(12), default="ok")  # ok / failed / blocked
    model: Mapped[str] = mapped_column(String(40), default="")
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    cost_points: Mapped[int] = mapped_column(Integer, default=0)
    excluded_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Adjudication(Base):
    __tablename__ = "adjudications"
    id: Mapped[int] = mapped_column(primary_key=True)
    qa_message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(80), default="")
    candidate: Mapped[str] = mapped_column(Text, default="")
    question: Mapped[str] = mapped_column(Text, default="")
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    confidence: Mapped[int] = mapped_column(Integer, default=60)
    image_path: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending / done
    decision: Mapped[str] = mapped_column(String(10), default="")  # adopt / revise / reject
    revised_text: Mapped[str] = mapped_column(Text, default="")
    reason: Mapped[str] = mapped_column(Text, default="")
    draft: Mapped[dict] = mapped_column(JSON, default=dict)
    submitted_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    researcher_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# ---------------- 任务 ----------------
class TaskTemplate(Base):
    __tablename__ = "task_templates"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(String(200), default="")
    reward: Mapped[int] = mapped_column(Integer, default=0)
    need_review: Mapped[bool] = mapped_column(Boolean, default=True)
    daily_limit: Mapped[int] = mapped_column(Integer, default=20)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class TaskBatch(Base):
    """研究员发布的任务批次（如方言条目标注）。"""
    __tablename__ = "task_batches"
    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("task_templates.id"))
    title: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(300), default="")
    items: Mapped[list] = mapped_column(JSON, default=list)  # 关联条目ID列表
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class TaskSubmission(Base):
    __tablename__ = "task_submissions"
    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("task_templates.id"))
    batch_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    target_type: Mapped[str] = mapped_column(String(20), default="")
    target_id: Mapped[str] = mapped_column(String(40), default="")
    target_title: Mapped[str] = mapped_column(String(120), default="")
    content: Mapped[dict] = mapped_column(JSON, default=dict)
    image_path: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending / approved / rejected
    reviewer_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reject_reason: Mapped[str] = mapped_column(String(200), default="")
    reward: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    kind: Mapped[str] = mapped_column(String(16), default="system")
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(String(300), default="")
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    actor_name: Mapped[str] = mapped_column(String(40), default="")
    action: Mapped[str] = mapped_column(String(30), index=True)
    target: Mapped[str] = mapped_column(String(120), default="")
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str] = mapped_column(String(45), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


class SystemSetting(Base):
    __tablename__ = "system_settings"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class KPITarget(Base):
    __tablename__ = "kpi_targets"
    id: Mapped[int] = mapped_column(primary_key=True)
    indicator: Mapped[str] = mapped_column(String(40))
    metric: Mapped[str] = mapped_column(String(30))  # 当前值的计算口径键
    year: Mapped[int] = mapped_column(Integer)
    target: Mapped[float] = mapped_column()
    unit: Mapped[str] = mapped_column(String(10), default="")
    __table_args__ = (UniqueConstraint("indicator", "year"),)


class TrustSample(Base):
    """研究员抽检记录（附录C：引证准确率、无出处断言率 MVP 可人工录入）。"""
    __tablename__ = "trust_samples"
    id: Mapped[int] = mapped_column(primary_key=True)
    sampled: Mapped[int] = mapped_column(Integer)
    accurate: Mapped[int] = mapped_column(Integer)
    claims: Mapped[int] = mapped_column(Integer)
    unsourced_claims: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(String(200), default="")
    researcher_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
