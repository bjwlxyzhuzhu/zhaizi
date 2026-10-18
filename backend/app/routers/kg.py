from collections import deque

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from .. import retrieval
from ..db import get_db
from ..deps import audit, client_ip, current_user, require
from ..models import KGEdge, KGNode, User

router = APIRouter(prefix="/kg", tags=["知识图谱"])
TYPES = ["器", "铭", "字", "字形", "音", "义", "人", "事", "地", "文献", "礼制"]
CHAIN = ["器", "铭", "字", "音", "义"]


def _levels(u: User):
    return ("L1", "L2", "L3") if u.role in ("admin", "researcher") else ("L1", "L2")


def _n(n: KGNode, degree: int | None = None) -> dict:
    d = {"id": n.id, "type": n.type, "name": n.name, "props": n.props or {}, "ref_table": n.ref_table, "ref_id": n.ref_id}
    if degree is not None:
        d["degree"] = degree
    return d


def _e(e: KGEdge) -> dict:
    return {"id": e.id, "source": e.src_id, "target": e.dst_id, "rel": e.rel_type, "grade": e.evidence_grade, "src": e.source}


def _degrees(db) -> dict[int, int]:
    deg: dict[int, int] = {}
    for s, d in db.execute(select(KGEdge.src_id, KGEdge.dst_id)):
        deg[s] = deg.get(s, 0) + 1
        deg[d] = deg.get(d, 0) + 1
    return deg


@router.get("/graph")
def overview(full: bool = False, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """首屏：除低连接度的“字/音/字形”外的节点；双击再增量展开（KG-4）。full=1 返回全图（压测用）。"""
    deg = _degrees(db)
    nodes = db.scalars(select(KGNode).where(KGNode.level.in_(_levels(u)))).all()
    keep = [n for n in nodes if full or n.type not in ("字", "音", "字形") or deg.get(n.id, 0) >= 3]
    ids = {n.id for n in keep}
    edges = db.scalars(select(KGEdge).where(KGEdge.src_id.in_(ids), KGEdge.dst_id.in_(ids))).all()
    counts = {t: 0 for t in TYPES}
    for n in nodes:
        counts[n.type] = counts.get(n.type, 0) + 1
    return {"nodes": [_n(n, deg.get(n.id, 0)) for n in keep], "edges": [_e(e) for e in edges],
            "total_nodes": len(nodes), "total_edges": db.scalar(select(func.count()).select_from(KGEdge)), "counts": counts}


@router.get("/nodes")
def search(q: str = "", type: str = "", limit: int = 20, u: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(KGNode).where(KGNode.level.in_(_levels(u)))
    if q:
        stmt = stmt.where(KGNode.name.contains(q))
    if type:
        stmt = stmt.where(KGNode.type == type)
    rows = db.scalars(stmt.order_by(func.length(KGNode.name)).limit(limit)).all()
    return [_n(n) for n in rows]


@router.get("/nodes/{nid}")
def detail(nid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.get(KGNode, nid)
    if not n or n.level not in _levels(u):
        raise HTTPException(404, "节点不存在")
    out_e = db.execute(select(KGEdge, KGNode).join(KGNode, KGNode.id == KGEdge.dst_id).where(KGEdge.src_id == nid)).all()
    in_e = db.execute(select(KGEdge, KGNode).join(KGNode, KGNode.id == KGEdge.src_id).where(KGEdge.dst_id == nid)).all()
    groups: dict[str, list] = {}
    for e, m in out_e + in_e:
        groups.setdefault(m.type, []).append({**_n(m), "rel": e.rel_type, "grade": e.evidence_grade, "src": e.source,
                                              "edge_id": e.id, "direction": "out" if e.src_id == nid else "in"})
    return {**_n(n), "degree": len(out_e) + len(in_e), "neighbors": groups}


@router.get("/nodes/{nid}/neighbors")
def neighbors(nid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    edges = db.scalars(select(KGEdge).where(or_(KGEdge.src_id == nid, KGEdge.dst_id == nid))).all()
    ids = {e.src_id for e in edges} | {e.dst_id for e in edges}
    nodes = db.scalars(select(KGNode).where(KGNode.id.in_(ids), KGNode.level.in_(_levels(u)))).all()
    deg = _degrees(db)
    return {"nodes": [_n(n, deg.get(n.id, 0)) for n in nodes], "edges": [_e(e) for e in edges]}


def _adj(db):
    adj: dict[int, list[tuple[int, int]]] = {}
    for e in db.scalars(select(KGEdge)):
        adj.setdefault(e.src_id, []).append((e.dst_id, e.id))
        adj.setdefault(e.dst_id, []).append((e.src_id, e.id))
    return adj


@router.get("/path")
def path(src: int, dst: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """KG-7 两节点最短路径（BFS）。"""
    adj = _adj(db)
    prev = {src: (None, None)}
    dq = deque([src])
    while dq:
        x = dq.popleft()
        if x == dst:
            break
        for y, eid in adj.get(x, []):
            if y not in prev:
                prev[y] = (x, eid)
                dq.append(y)
    if dst not in prev:
        return {"nodes": [], "edges": []}
    nodes, edges = [], []
    cur = dst
    while cur is not None:
        nodes.append(cur)
        p, eid = prev[cur]
        if eid:
            edges.append(eid)
        cur = p
    return {"nodes": list(reversed(nodes)), "edges": list(reversed(edges))}


@router.get("/chain/{nid}")
def chain(nid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """KG-6 器—铭—字—音—义 路径：返回逐层点亮的层级（每层节点与连向上层的边）。"""
    start = db.get(KGNode, nid)
    if not start or start.type != "器":
        raise HTTPException(400, "请选择一件器物节点")
    nodes = {n.id: n for n in db.scalars(select(KGNode))}
    adj = _adj(db)
    layers = [{"type": "器", "nodes": [nid], "edges": []}]
    frontier = {nid}
    char_layer: set[int] = set()
    for t in CHAIN[1:]:
        nxt, es = set(), []
        # “义”挂在“字”上（字—义项），所以从字层出发；其余逐层向下
        for x in (char_layer if t == "义" else frontier):
            for y, eid in adj.get(x, []):
                if nodes[y].type == t:
                    nxt.add(y)
                    es.append(eid)
        if t == "字":
            # 只保留能继续连到“音”或“义”的字，路径更清晰
            good = {y for y in nxt if any(nodes[z].type in ("音", "义") for z, _ in adj.get(y, []))}
            if good:
                es = [e for e in es if any(e == eid for y in good for _, eid in adj.get(y, []))]
                nxt = good
        if not nxt:
            break
        layers.append({"type": t, "nodes": sorted(nxt), "edges": es})
        if t == "字":
            char_layer = nxt
        frontier = nxt
    return {"layers": layers}


# ---------------- 图谱编辑（RES-5，研究员） ----------------
class NodeIn(BaseModel):
    type: str
    name: str
    props: dict = {}
    level: str = "L1"


@router.post("/nodes")
def create_node(body: NodeIn, request: Request, u: User = Depends(require("researcher")), db: Session = Depends(get_db)):
    if body.type not in TYPES:
        raise HTTPException(400, "节点类型无效")
    n = KGNode(type=body.type, name=body.name, props=body.props, level=body.level)
    db.add(n)
    db.flush()
    retrieval.sync_concept(db, n)
    audit(db, u, "图谱新增节点", f"{body.type}·{body.name}", {}, client_ip(request))
    db.commit()
    return _n(n)


@router.put("/nodes/{nid}")
def update_node(nid: int, body: NodeIn, request: Request, u: User = Depends(require("researcher")), db: Session = Depends(get_db)):
    n = db.get(KGNode, nid) or _404()
    n.type, n.name, n.props, n.level = body.type, body.name, body.props, body.level
    retrieval.sync_concept(db, n)
    audit(db, u, "图谱修改节点", f"{n.type}·{n.name}", {}, client_ip(request))
    db.commit()
    return _n(n)


@router.delete("/nodes/{nid}")
def delete_node(nid: int, request: Request, u: User = Depends(require("researcher")), db: Session = Depends(get_db)):
    n = db.get(KGNode, nid) or _404()
    cnt = db.execute(delete(KGEdge).where(or_(KGEdge.src_id == nid, KGEdge.dst_id == nid))).rowcount
    db.delete(n)
    audit(db, u, "图谱删除节点", f"{n.type}·{n.name}", {"edges_removed": cnt}, client_ip(request))
    db.commit()
    return {"edges_removed": cnt}


class EdgeIn(BaseModel):
    src_id: int
    dst_id: int
    rel_type: str
    source: str
    evidence_grade: str = "B"


@router.post("/edges")
def create_edge(body: EdgeIn, request: Request, u: User = Depends(require("researcher")), db: Session = Depends(get_db)):
    if not body.rel_type.strip() or not body.source.strip():
        raise HTTPException(400, "关系须选择类型并附出处")
    if not db.get(KGNode, body.src_id) or not db.get(KGNode, body.dst_id):
        raise HTTPException(400, "节点不存在")
    e = KGEdge(**body.model_dump())
    db.add(e)
    audit(db, u, "图谱新增关系", f"{body.src_id}→{body.dst_id}:{body.rel_type}", {"source": body.source}, client_ip(request))
    db.commit()
    return _e(e)


@router.delete("/edges/{eid}")
def delete_edge(eid: int, request: Request, u: User = Depends(require("researcher")), db: Session = Depends(get_db)):
    e = db.get(KGEdge, eid) or _404()
    db.delete(e)
    audit(db, u, "图谱删除关系", f"{e.src_id}→{e.dst_id}:{e.rel_type}", {}, client_ip(request))
    db.commit()
    return {"ok": True}


def _404():
    raise HTTPException(404, "不存在")
