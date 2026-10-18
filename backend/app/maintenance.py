"""Update only exact, unchanged initial UI labels in existing installations."""
from sqlalchemy import select
from .models import User, DialectEntry


def refresh_initial_labels(db):
    for account, previous, replacement in [("u001", "演示研究生", "研究生用户"), ("u002", "演示本科生", "本科生用户")]:
        u = db.scalar(select(User).where(User.account == account, User.name == previous))
        if u:
            u.name = replacement
    u = db.scalar(select(User).where(User.account == "r002", User.org == "历史学院", User.name == "研究员B"))
    if u:
        u.org = "政法与历史学院"
    for d in db.scalars(select(DialectEntry).where(DialectEntry.source == "示例数据（演示用），正式条目以团队调查建档为准")):
        d.source = "样例条目（未经实地调查核验），正式条目以团队调查建档为准"
    db.commit()
