"""问答处理流程（PRD §7.2）：安全检查 → 检索 → 组装提示 → 调模型 → 引证核验 → 安全检查输出。"""
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import llm
from .models import Chunk, SystemSetting

DEFAULT_SENSITIVE = ["颠覆国家政权", "分裂国家", "恐怖袭击", "制造炸弹", "邪教", "暴恐"]
CITE_RE = re.compile(r"\[([A-Z]{1,3}\d{1,6})\]")
GRADE_ORDER = {"A": 0, "B": 1, "C": 2, "D": 3}
META_PREFIX = ("根据本次检索", "以上为库内条目", "库内暂无相关资料", "综上", "以下")


class Blocked(Exception):
    pass


def sensitive_words(db: Session) -> list[str]:
    s = db.get(SystemSetting, "sensitive_words")
    if s and s.value.strip():
        return [w.strip() for w in s.value.split(",") if w.strip()]
    return DEFAULT_SENSITIVE


def check_safety(db: Session, text: str):
    for w in sensitive_words(db):
        if w and w in text:
            raise Blocked(w)


def build_messages(question: str, chunks: list[Chunk], history: list[tuple[str, str]]):
    ctx = "\n".join(f"[{c.cid}]（证据等级{c.evidence_grade}）{c.title}：{c.text}" for c in chunks) or "（无）"
    msgs = [{"role": "system", "content": llm.SYSTEM_PROMPT}]
    for role, content in history:
        msgs.append({"role": role, "content": content})
    msgs.append({"role": "user", "content": f"库内条目：\n{ctx}\n\n问题：{question}"})
    return msgs


def verify(answer: str, chunks: list[Chunk]):
    """QA-3 / QA-4：核验引用 ID 必须属于本次检索结果；无效引用删除并把该句降为 D 级推测。"""
    allowed = {c.cid: c for c in chunks}
    segments = []
    removed = []
    for line in answer.split("\n"):
        # 句末标点后紧跟的 [ID] 属于前一句
        parts = [p for p in re.split(r"(?<=[。；！？])(?![\[\s]*\[)", line) if p.strip()]
        for idx, s in enumerate(parts):
            ids = CITE_RE.findall(s)
            valid = [i for i in ids if i in allowed]
            bad = [i for i in ids if i not in allowed]
            removed.extend(bad)
            clean = CITE_RE.sub("", s).strip()
            if not clean:
                continue
            is_meta = clean.startswith(META_PREFIX) or len(clean) <= 6
            speculative = clean.startswith("推测")
            if valid and not speculative:
                grade = min((allowed[i].evidence_grade for i in valid), key=lambda g: GRADE_ORDER.get(g, 9))
            elif is_meta and not speculative:
                grade = ""
            else:
                grade = "D"  # 无出处或引用无效：标为模型推测
            segments.append({"text": clean, "cites": list(dict.fromkeys(valid)), "grade": grade,
                             "newline": idx == len(parts) - 1})
    used = list(dict.fromkeys(i for s in segments for i in s["cites"]))
    citations = [{"cid": i, "title": allowed[i].title, "grade": allowed[i].evidence_grade,
                  "ref_table": allowed[i].ref_table, "ref_id": allowed[i].ref_id} for i in used]
    report = {"removed_invalid": removed, "d_segments": sum(1 for s in segments if s["grade"] == "D"),
              "cited_segments": sum(1 for s in segments if s["cites"])}
    return segments, citations, report


def chunks_by_ids(db: Session, ids: list[str]) -> list[Chunk]:
    if not ids:
        return []
    rows = db.scalars(select(Chunk).where(Chunk.cid.in_(ids))).all()
    m = {c.cid: c for c in rows}
    return [m[i] for i in ids if i in m]
