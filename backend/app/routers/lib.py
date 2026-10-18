from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import DialectEntry, Glyph, Inscription, KGNode, Reading, TextPassage, User, Vessel

router = APIRouter(prefix="/lib", tags=["资料库"])


def levels_for(u: User):
    # LIB-6：用户只能看到已审核的 L1、L2；L3 仅研究员和管理员可见
    return ("L1", "L2", "L3") if u.role in ("admin", "researcher") else ("L1", "L2")


def vessel_card(v: Vessel) -> dict:
    return {"id": v.id, "name": v.name, "category": v.category, "period": v.period, "find_place": v.find_place,
            "district": v.district, "find_date": v.find_date, "collection": v.collection, "image": v.image,
            "level": v.level, "evidence_grade": v.evidence_grade, "status": v.status}


@router.get("/vessels")
def vessels(q: str = "", period: str = "", place: str = "", char: str = "", grade: str = "",
            u: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Vessel).where(Vessel.status == "approved", Vessel.level.in_(levels_for(u)))
    if q:
        stmt = stmt.where(or_(Vessel.name.contains(q), Vessel.catalog_refs.contains(q), Vessel.find_place.contains(q),
                              Vessel.period.contains(q)))
    if period:
        stmt = stmt.where(Vessel.period.contains(period))
    if place:
        stmt = stmt.where(or_(Vessel.find_place.contains(place), Vessel.district.contains(place)))
    if grade:
        stmt = stmt.where(Vessel.evidence_grade == grade)
    if char:
        ids = [i for (i,) in db.execute(select(Inscription.vessel_id).where(Inscription.transcription.contains(char)))]
        stmt = stmt.where(Vessel.id.in_(ids))
    rows = db.scalars(stmt.order_by(Vessel.id)).all()
    return [vessel_card(v) for v in rows]


@router.get("/latest")
def latest(u: User = Depends(current_user), db: Session = Depends(get_db)):
    vs = db.scalars(select(Vessel).where(Vessel.status == "approved", Vessel.level.in_(levels_for(u)))
                    .order_by(Vessel.updated_at.desc(), Vessel.id.desc()).limit(8)).all()
    gs = db.scalars(select(Glyph).where(Glyph.status == "approved").order_by(Glyph.id.desc()).limit(8)).all()
    ds = db.scalars(select(DialectEntry).where(DialectEntry.status == "approved").order_by(DialectEntry.id.desc()).limit(8)).all()
    ts = db.scalars(select(TextPassage).where(TextPassage.status == "approved").order_by(TextPassage.id.desc()).limit(8)).all()
    return {"vessels": [vessel_card(v) for v in vs],
            "glyphs": [{"id": g.id, "character": g.character, "script": g.script} for g in gs],
            "dialects": [{"id": d.id, "word": d.word, "district": d.district, "ipa": d.ipa} for d in ds],
            "texts": [{"id": t.id, "title": t.title, "chapter": t.chapter} for t in ts]}


@router.get("/vessels/{vid}")
def vessel_detail(vid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    v = db.get(Vessel, vid)
    if not v or v.level not in levels_for(u) or (v.status != "approved" and u.role == "user"):
        raise HTTPException(404, "条目不存在或无权查看")
    ins = db.scalars(select(Inscription).where(Inscription.vessel_id == vid, Inscription.status == "approved")).all()
    glyphs = db.scalars(select(Glyph).where(Glyph.vessel_id == vid, Glyph.status == "approved")).all()
    texts = db.scalars(select(TextPassage).where(TextPassage.related_vessel_id == vid, TextPassage.status == "approved")).all()
    node = db.scalar(select(KGNode).where(KGNode.ref_table == "vessels", KGNode.ref_id == vid))
    return {**vessel_card(v), "gallery": v.gallery or [], "image_credit": v.image_credit, "catalog_refs": v.catalog_refs, "description": v.description, "source": v.source,
            "inscriptions": [{"id": i.id, "transcription": i.transcription, "interpretation": i.interpretation,
                              "char_count": i.char_count, "source": i.source, "evidence_grade": i.evidence_grade}
                             for i in ins],
            "glyphs": [{"id": g.id, "character": g.character, "script": g.script, "image_path": g.image_path} for g in glyphs],
            "texts": [{"id": t.id, "title": t.title, "chapter": t.chapter, "content": t.content, "source": t.source} for t in texts],
            "kg_node_id": node.id if node else None}


@router.get("/characters")
def characters(u: User = Depends(current_user), db: Session = Depends(get_db)):
    chars = {}
    for g in db.scalars(select(Glyph).where(Glyph.status == "approved")):
        chars.setdefault(g.character, set()).add(g.script)
    return [{"character": c, "scripts": sorted(s), "complete": len(s) >= 3} for c, s in chars.items()]


@router.get("/characters/{char}")
def character(char: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    gs = db.scalars(select(Glyph).where(Glyph.character == char, Glyph.status == "approved")).all()
    reads = db.scalars(select(Reading).where(Reading.character == char)).all()
    vids = {g.vessel_id for g in gs if g.vessel_id}
    ins_vessels = [i for (i,) in db.execute(select(Inscription.vessel_id).where(Inscription.transcription.contains(char),
                                                                              Inscription.status == "approved"))]
    vs = db.scalars(select(Vessel).where(Vessel.id.in_(vids | set(ins_vessels)), Vessel.status == "approved",
                                         Vessel.level.in_(levels_for(u)))).all()
    node = db.scalar(select(KGNode).where(KGNode.type == "字", KGNode.name == char))
    order = {"金文": 0, "石鼓文": 1, "小篆": 2}
    return {"character": char,
            "glyphs": sorted([{"id": g.id, "script": g.script, "image_path": g.image_path, "note": g.note, "source": g.source,
                               "vessel_id": g.vessel_id} for g in gs], key=lambda x: order.get(x["script"], 9)),
            "complete": len({g.script for g in gs}) >= 3,
            "readings": [{"layer": r.layer, "value": r.value, "district": r.district, "source": r.source} for r in reads],
            "vessels": [vessel_card(v) for v in vs], "kg_node_id": node.id if node else None}


@router.get("/dialects")
def dialects(q: str = "", district: str = "", u: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(DialectEntry).where(DialectEntry.status == "approved", DialectEntry.level.in_(levels_for(u)))
    if q:
        stmt = stmt.where(or_(DialectEntry.word.contains(q), DialectEntry.meaning.contains(q)))
    if district:
        stmt = stmt.where(DialectEntry.district == district)
    rows = db.scalars(stmt.order_by(DialectEntry.district, DialectEntry.id)).all()
    districts = sorted({d for (d,) in db.execute(select(DialectEntry.district).distinct())})
    # 发音人信息脱敏：只给编号末两位
    return {"districts": districts,
            "items": [{"id": d.id, "district": d.district, "speaker": "发音人" + (d.speaker_code[-2:] if d.speaker_code else "--"),
                       "word": d.word, "ipa": d.ipa, "meaning": d.meaning, "audio": d.audio_path, "source": d.source}
                      for d in rows]}


@router.get("/texts")
def texts(q: str = "", u: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(TextPassage).where(TextPassage.status == "approved", TextPassage.level.in_(levels_for(u)))
    if q:
        stmt = stmt.where(or_(TextPassage.title.contains(q), TextPassage.content.contains(q)))
    return [{"id": t.id, "title": t.title, "chapter": t.chapter, "content": t.content, "source": t.source,
             "related_vessel_id": t.related_vessel_id} for t in db.scalars(stmt)]
