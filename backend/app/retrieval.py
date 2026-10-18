"""检索层。

PRD 设计为 pgvector 向量检索 + 关键词补召回。MVP 开发环境没有向量模型时，
这里用“汉字二元组 TF-IDF”实现同一接口（search），后续把 _score 换成向量相似度即可。
只检索 status=approved 的条目；送云端模型的只允许 L1（数据分级，PRD §4、§6）。
"""
import math
import re
import threading
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (Adjudication, Chunk, DialectEntry, Glyph, Inscription, KGNode, Reading, TextPassage, Vessel)

_CJK = re.compile(r"[㐀-鿿\U00020000-\U0002ffff]+|[A-Za-z0-9]+")
STOP = set("的了是在和与及或吗呢么什如何怎样请问一个这那有中之其为以于也而")
STOP_BIGRAMS = {"什么", "如何", "怎么", "请问", "哪些", "是否", "可以", "一下", "意思", "含义", "理解", "列出", "证据", "文献",
                # 领域泛词与疑问搭配：几乎每条器物都含有，不能单独作为“相关”的依据
                "出土", "青铜", "发现", "哪里", "何地", "多少", "有多", "哪一", "一年", "字的", "是哪", "是谁", "记载", "了什", "么内"}

_cache_lock = threading.Lock()
_cache: dict = {"version": -1}
_version = 0


def bump():
    global _version
    _version += 1


def grams(text: str) -> list[str]:
    out = []
    for seg in _CJK.findall(text or ""):
        if seg.isascii():
            out.append(seg.lower())
            continue
        for i in range(len(seg) - 1):
            g = seg[i:i + 2]
            if g not in STOP_BIGRAMS:
                out.append(g)
        out.extend(c for c in seg if c not in STOP)
    return out


def _index(db: Session):
    with _cache_lock:
        if _cache["version"] == _version:
            return _cache
        rows = db.execute(select(Chunk)).scalars().all()
        docs = []
        df = Counter()
        for c in rows:
            tf = Counter(grams(c.title + " " + c.text))
            docs.append((c, tf))
            df.update(tf.keys())
        n = max(len(docs), 1)
        idf = {g: math.log(1 + n / (1 + d)) for g, d in df.items()}
        _cache.update(version=_version, docs=docs, idf=idf)
        return _cache


def search(db: Session, query: str, *, k: int = 12, allow_levels=("L1",), include_pending=False):
    """返回 (命中条目列表, 是否有内部资料因分级被排除)。"""
    idx = _index(db)
    q = Counter(grams(query))
    if not q:
        return [], False
    idf = idx["idf"]
    q_bigrams = sum(1 for g in q if len(g) > 1)
    scored = []
    excluded_internal = False
    for c, tf in idx["docs"]:
        if c.status != "approved" and not include_pending:
            continue
        s = 0.0
        strong = 0.0
        hits = 0
        for g, qn in q.items():
            if g in tf:
                w = idf.get(g, 0) * (1 + math.log(tf[g])) * qn
                s += w if len(g) > 1 else w * 0.25
                if len(g) > 1:
                    strong += idf.get(g, 0)
                    # 命中条目标题中的实体名（器名、字头、篇名）即已指明对象，记两次
                    hits += 2 if g in c.title else 1
        # 相关性判定：至少命中两个有区分度的二元组（问题本身很短时放宽为一个）；单字查询另行放宽
        need = 1 if q_bigrams <= 2 else 2
        if (strong < 2.0 or hits < need) and not (len(query.strip()) <= 2 and s > 0):
            continue
        if c.level not in allow_levels:
            excluded_internal = True
            continue
        scored.append((s, c))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:k]], excluded_internal


# ---------------- 检索块维护 ----------------
def _upsert(db: Session, cid: str, ref_table: str, ref_id: int, title: str, text: str, grade: str, level: str, status: str):
    c = db.scalar(select(Chunk).where(Chunk.cid == cid))
    if not c:
        c = Chunk(cid=cid, ref_table=ref_table, ref_id=ref_id)
        db.add(c)
    c.title, c.text, c.evidence_grade, c.level, c.status = title, text, grade, level, status
    bump()


def sync_vessel(db: Session, v: Vessel):
    text = f"{v.name}，{v.category}，{v.period}。出土：{v.find_place}{('，' + v.find_date) if v.find_date else ''}。现藏：{v.collection}。著录：{v.catalog_refs}。{v.description}"
    _upsert(db, f"V{v.id}", "vessels", v.id, f"{v.name}·器物信息", text, v.evidence_grade, v.level, v.status)


def sync_inscription(db: Session, i: Inscription):
    v = db.get(Vessel, i.vessel_id)
    name = v.name if v else "器物"
    text = f"{name}铭文释文：{i.transcription}" + (f" 通读：{i.interpretation}" if i.interpretation else "")
    _upsert(db, f"I{i.id}", "inscriptions", i.id, f"{name}·铭文", text, i.evidence_grade, i.level, i.status)


def sync_text(db: Session, t: TextPassage):
    _upsert(db, f"T{t.id}", "texts", t.id, f"《{t.title}·{t.chapter}》" if t.chapter else f"《{t.title}》",
            t.content, "B", t.level, t.status)


def sync_dialect(db: Session, d: DialectEntry):
    _upsert(db, f"D{d.id}", "dialect_entries", d.id, f"方言·{d.word}（{d.district}）",
            f"关陇方言 {d.district} “{d.word}” 读 [{d.ipa}]，义为{d.meaning}。方言今读仅作辅助证据。", "C", d.level, d.status)


def sync_glyph(db: Session, g: Glyph):
    _upsert(db, f"G{g.id}", "glyphs", g.id, f"字形·{g.character}（{g.script}）",
            f"“{g.character}”字{g.script}字形。{g.note}", "A" if g.script == "金文" and g.vessel_id else "B", g.level, g.status)


def sync_reading(db: Session, r: Reading):
    _upsert(db, f"R{r.id}", "readings", r.id, f"音·{r.character}（{r.layer}音）",
            f"“{r.character}”字{r.layer}音：{r.value}。来源：{r.source}。古音构拟存在学派差异，仅作参考。", "C", "L1", "approved")


def sync_adjudication(db: Session, a: Adjudication):
    if a.status != "done" or a.decision == "reject":
        return
    text = a.revised_text or a.candidate
    _upsert(db, f"ADJ{a.id}", "adjudications", a.id, f"专家裁断·{a.title}",
            f"{text} 裁断理由：{a.reason}", "B", "L1", "approved")


def sync_concept(db: Session, n: KGNode):
    if n.type not in ("义", "礼制", "人", "事", "地"):
        return
    desc = (n.props or {}).get("desc", "")
    if desc:
        _upsert(db, f"K{n.id}", "kg_nodes", n.id, f"{n.type}·{n.name}", desc, (n.props or {}).get("grade", "B"), n.level, "approved")


def rebuild_all(db: Session):
    for v in db.scalars(select(Vessel)):
        sync_vessel(db, v)
    for i in db.scalars(select(Inscription)):
        sync_inscription(db, i)
    for t in db.scalars(select(TextPassage)):
        sync_text(db, t)
    for d in db.scalars(select(DialectEntry)):
        sync_dialect(db, d)
    for g in db.scalars(select(Glyph)):
        sync_glyph(db, g)
    for r in db.scalars(select(Reading)):
        sync_reading(db, r)
    for a in db.scalars(select(Adjudication)):
        sync_adjudication(db, a)
    for n in db.scalars(select(KGNode)):
        sync_concept(db, n)
    db.flush()


SYNC = {"vessels": sync_vessel, "inscriptions": sync_inscription, "texts": sync_text,
        "dialect_entries": sync_dialect, "glyphs": sync_glyph}
