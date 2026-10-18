"""由资料库记录自动生成图谱节点与关系（PRD §10“由上述数据自动生成节点，研究员补充关系”）。"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import DialectEntry, Glyph, Inscription, KGEdge, KGNode, TextPassage, Vessel


def is_han(c: str) -> bool:
    return "㐀" <= c <= "鿿"


def node(db: Session, type_: str, name: str, *, ref_table="", ref_id=None, props=None, level="L1") -> KGNode:
    stmt = select(KGNode).where(KGNode.type == type_, KGNode.name == name)
    if ref_table:
        stmt = select(KGNode).where(KGNode.ref_table == ref_table, KGNode.ref_id == ref_id)
    n = db.scalar(stmt)
    if not n:
        n = KGNode(type=type_, name=name, ref_table=ref_table, ref_id=ref_id, props=props or {}, level=level)
        db.add(n)
        db.flush()
    else:
        n.name = name
        if props:
            n.props = {**(n.props or {}), **props}
    return n


def edge(db: Session, src: KGNode, dst: KGNode, rel: str, source: str = "", grade: str = "B"):
    e = db.scalar(select(KGEdge).where(KGEdge.src_id == src.id, KGEdge.dst_id == dst.id, KGEdge.rel_type == rel))
    if not e:
        e = KGEdge(src_id=src.id, dst_id=dst.id, rel_type=rel, source=source, evidence_grade=grade)
        db.add(e)
        db.flush()
    return e


def link_record(db: Session, table: str, obj):
    if table == "vessels":
        v: Vessel = obj
        n = node(db, "器", v.name, ref_table="vessels", ref_id=v.id, level=v.level,
                 props={"period": v.period, "grade": v.evidence_grade, "collection": v.collection,
                        "desc": f"{v.period}{v.category}，{v.find_place}出土，现藏{v.collection}。"})
        if v.district:
            place = node(db, "地", v.district, props={"desc": f"宝鸡市{v.district}"})
            edge(db, n, place, "出土于", v.source, v.evidence_grade)
    elif table == "inscriptions":
        i: Inscription = obj
        v = db.get(Vessel, i.vessel_id)
        if not v:
            return
        vn = node(db, "器", v.name, ref_table="vessels", ref_id=v.id, level=v.level)
        inn = node(db, "铭", f"{v.name}铭", ref_table="inscriptions", ref_id=i.id, level=i.level,
                   props={"char_count": i.char_count, "grade": i.evidence_grade, "desc": i.transcription[:80]})
        edge(db, vn, inn, "铸有", i.source, i.evidence_grade)
        seen = set()
        for c in i.transcription:
            if is_han(c) and c not in seen:
                seen.add(c)
                edge(db, inn, node(db, "字", c), "含字", i.source, i.evidence_grade)
    elif table == "glyphs":
        g: Glyph = obj
        cn = node(db, "字", g.character)
        gn = node(db, "字形", f"{g.character}·{g.script}", ref_table="glyphs", ref_id=g.id,
                  props={"script": g.script, "grade": "B"})
        edge(db, cn, gn, "字形", g.source, "B")
        if g.vessel_id:
            v = db.get(Vessel, g.vessel_id)
            if v:
                edge(db, gn, node(db, "器", v.name, ref_table="vessels", ref_id=v.id), "见于", g.source, "A")
    elif table == "dialect_entries":
        d: DialectEntry = obj
        if len(d.word) == 1 and is_han(d.word):
            cn = node(db, "字", d.word)
            rn = node(db, "音", f"{d.word}·{d.district}方言", props={"ipa": d.ipa, "grade": "C"})
            edge(db, cn, rn, "今读", d.source, "C")
        place = node(db, "地", d.district, props={"desc": f"宝鸡市{d.district}"})
        dn = node(db, "音", f"方言·{d.word}", ref_table="dialect_entries", ref_id=d.id,
                  props={"ipa": d.ipa, "meaning": d.meaning, "grade": "C"})
        edge(db, dn, place, "通行于", d.source, "C")
    elif table == "texts":
        t: TextPassage = obj
        tn = node(db, "文献", f"《{t.title}·{t.chapter}》" if t.chapter else f"《{t.title}》", ref_table="texts", ref_id=t.id,
                  props={"desc": t.content[:80], "grade": "B"})
        if t.related_vessel_id:
            v = db.get(Vessel, t.related_vessel_id)
            if v:
                edge(db, tn, node(db, "器", v.name, ref_table="vessels", ref_id=v.id), "对读", t.source, "B")
