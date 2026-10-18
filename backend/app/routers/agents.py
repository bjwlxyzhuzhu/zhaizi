"""Administrator-managed agent knowledge, document processing and RAG index builds."""
import json
import time
import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import audit, client_ip, current_user, require
from ..models import Chunk, KnowledgeBase, KnowledgeDocument, KnowledgeTraining, SystemSetting, User
from .. import retrieval

router = APIRouter(tags=["智能体与知识库"])
admin_only = require("admin")
COLLECTIONS = {"vessels": "器铭库", "inscriptions": "铭文释文", "glyphs": "字形谱系", "readings": "古今音韵",
               "dialect_entries": "关陇方言", "texts": "传世文献", "kg_nodes": "知识图谱", "adjudications": "专家裁断"}
AGENTS = {"text": {"name": "文献问答智能体", "description": "检索关联知识库，组织有出处的回答并核验引证。", "route": "/qa"},
          "vision": {"name": "拓片释读智能体", "description": "结合图像、字形资料与文献证据辅助释读。", "route": "/qa/vision"}}


def agent_config(db: Session, key: str):
    if key not in AGENTS:
        raise HTTPException(404, "智能体不存在")
    row = db.get(SystemSetting, "agent_" + key)
    return json.loads(row.value) if row else {"enabled": True, "collections": list(COLLECTIONS), "knowledge_base_ids": []}


@router.get("/agents")
def list_agents(u: User = Depends(current_user), db: Session = Depends(get_db)):
    return [{"id": key, **info, **agent_config(db, key)} for key, info in AGENTS.items()]


class AgentIn(BaseModel):
    enabled: bool = True
    collections: list[str] = Field(default_factory=list)
    knowledge_base_ids: list[int] = Field(default_factory=list)


@router.put("/admin/agents/{key}")
def configure_agent(key: str, body: AgentIn, request: Request, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    agent_config(db, key)
    if set(body.collections) - set(COLLECTIONS):
        raise HTTPException(400, "未知的资料库类型")
    existing = set(db.scalars(select(KnowledgeBase.id)).all())
    if set(body.knowledge_base_ids) - existing:
        raise HTTPException(400, "关联知识库不存在")
    row = db.get(SystemSetting, "agent_" + key)
    if not row:
        row = SystemSetting(key="agent_" + key)
        db.add(row)
    row.value, row.updated_at = json.dumps(body.model_dump()), datetime.now()
    audit(db, me, "智能体配置", key, body.model_dump(), client_ip(request))
    db.commit()
    return {"ok": True}


def scope_for(db: Session, key: str):
    config = agent_config(db, key)
    if not config["enabled"]:
        raise HTTPException(409, "该智能体已暂停服务，请联系管理员")
    doc_ids = set(db.scalars(select(KnowledgeDocument.id).where(KnowledgeDocument.base_id.in_(config["knowledge_base_ids"]), KnowledgeDocument.status == "approved")))
    return config["collections"], doc_ids


def sync_document(db: Session, doc: KnowledgeDocument):
    db.execute(delete(Chunk).where(Chunk.ref_table == "knowledge_documents", Chunk.ref_id == doc.id))
    if doc.status != "approved":
        return 0
    text = doc.content.strip()
    count = 0
    for start in range(0, len(text), 520):
        part = text[start:start + 600]
        if not part.strip():
            continue
        c = Chunk(cid="TMP" + secrets.token_hex(6), ref_table="knowledge_documents", ref_id=doc.id,
                  title=f"{doc.title[:60]} · 第 {count + 1} 段", text=part + f"\n来源：{doc.source}",
                  evidence_grade="C", level=doc.level, status="approved")
        db.add(c)
        db.flush()
        c.cid = f"KB{c.id}"
        count += 1
        if start + 600 >= len(text):
            break
    db.flush()
    return count


@router.get("/admin/knowledge-bases")
def knowledge_bases(me: User = Depends(admin_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(KnowledgeBase).order_by(KnowledgeBase.id.desc())).all()
    def item(b):
        docs = db.scalars(select(KnowledgeDocument).where(KnowledgeDocument.base_id == b.id)).all()
        ids = [d.id for d in docs]
        chunks = db.scalar(select(func.count()).select_from(Chunk).where(Chunk.ref_table == "knowledge_documents", Chunk.ref_id.in_(ids))) or 0
        return {"id": b.id, "name": b.name, "description": b.description, "documents": len(docs), "chunks": chunks,
                "trained_at": b.trained_at.isoformat(timespec="seconds") if b.trained_at else "", "updated_at": b.updated_at.isoformat(timespec="seconds")}
    return {"items": [item(b) for b in rows], "collections": COLLECTIONS}


class BaseIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)


@router.post("/admin/knowledge-bases")
def create_base(body: BaseIn, request: Request, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    if not body.name.strip():
        raise HTTPException(400, "请填写知识库名称")
    base = KnowledgeBase(name=body.name.strip(), description=body.description)
    db.add(base)
    audit(db, me, "创建知识库", base.name, {}, client_ip(request))
    db.commit()
    return {"id": base.id}


def get_base(db, bid):
    b = db.get(KnowledgeBase, bid)
    if not b:
        raise HTTPException(404, "知识库不存在")
    return b


@router.get("/admin/knowledge-bases/{bid}/documents")
def documents(bid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    get_base(db, bid)
    docs = db.scalars(select(KnowledgeDocument).where(KnowledgeDocument.base_id == bid).order_by(KnowledgeDocument.id.desc())).all()
    return [{"id": d.id, "title": d.title, "content": d.content, "source": d.source, "level": d.level, "status": d.status,
             "updated_at": d.updated_at.isoformat(timespec="minutes")} for d in docs]


class DocumentIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=100000)
    source: str = Field(min_length=1, max_length=500)
    level: str = "L1"
    status: str = "draft"


def save_document(db, bid, body, doc=None):
    base = get_base(db, bid)
    if body.level not in ("L1", "L2", "L3") or body.status not in ("draft", "approved", "disabled"):
        raise HTTPException(400, "无效的数据等级或发布状态")
    if not all(v.strip() for v in (body.title, body.content, body.source)):
        raise HTTPException(400, "标题、正文与来源不能为空")
    if doc is None:
        doc = KnowledgeDocument(base_id=bid)
        db.add(doc)
    for k, v in body.model_dump().items():
        setattr(doc, k, v.strip())
    doc.updated_at = base.updated_at = datetime.now()
    db.flush()
    sync_document(db, doc)
    return doc


@router.post("/admin/knowledge-bases/{bid}/documents")
def create_doc(bid: int, body: DocumentIn, request: Request, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    doc = save_document(db, bid, body)
    audit(db, me, "知识资料新增", doc.title, {"base_id": bid, "status": doc.status}, client_ip(request))
    db.commit()
    retrieval.bump()
    return {"id": doc.id}


@router.put("/admin/knowledge-bases/{bid}/documents/{did}")
def update_doc(bid: int, did: int, body: DocumentIn, request: Request, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    doc = db.get(KnowledgeDocument, did)
    if not doc or doc.base_id != bid:
        raise HTTPException(404, "资料不存在")
    save_document(db, bid, body, doc)
    audit(db, me, "知识资料更新", doc.title, {"base_id": bid, "status": doc.status}, client_ip(request))
    db.commit()
    retrieval.bump()
    return {"ok": True}


@router.post("/admin/knowledge-bases/{bid}/train")
def train(bid: int, request: Request, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    base = get_base(db, bid)
    start = time.perf_counter()
    docs = db.scalars(select(KnowledgeDocument).where(KnowledgeDocument.base_id == bid)).all()
    count = sum(sync_document(db, d) for d in docs)
    base.trained_at = datetime.now()
    db.commit()
    retrieval.prepare_index(db)
    run = KnowledgeTraining(base_id=bid, actor_name=me.name, documents=sum(d.status == "approved" for d in docs), chunks=count,
                            elapsed_ms=round((time.perf_counter() - start) * 1000))
    db.add(run)
    audit(db, me, "知识库索引训练", base.name, {"documents": run.documents, "chunks": count}, client_ip(request))
    db.commit()
    return {"documents": run.documents, "chunks": count, "elapsed_ms": run.elapsed_ms}


@router.get("/admin/knowledge-bases/{bid}/training-runs")
def training_runs(bid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    get_base(db, bid)
    rows = db.scalars(select(KnowledgeTraining).where(KnowledgeTraining.base_id == bid).order_by(KnowledgeTraining.id.desc()).limit(30)).all()
    return [{"id": r.id, "actor": r.actor_name, "documents": r.documents, "chunks": r.chunks, "elapsed_ms": r.elapsed_ms,
             "created_at": r.created_at.isoformat(timespec="seconds")} for r in rows]
