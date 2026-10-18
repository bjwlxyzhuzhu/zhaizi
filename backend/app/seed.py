"""首次启动写入的演示种子数据。

说明：器物与铭文信息整理自公开著录与博物馆公开资料，释文为通行释文（部分为节选），
方言条目与古音为“示例数据”，全部须经研究员按 PRD §10 核校；字形为字体渲染占位，待上传拓片切图替换。
"""
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import points, retrieval
from .kg_builder import edge, link_record, node
from .models import (Adjudication, AuditLog, DialectEntry, Glyph, Inscription, KPITarget, PointRule, Reading,
                     RecordVersion, TaskBatch, TaskSubmission, TaskTemplate, TextPassage, User, Vessel)
from .config import IMAGE_CREDIT
from .security import hash_password

DEMO_PASSWORD = "Zhaizi2026"  # 演示账号密码，部署前请删除演示账号或重置
SRC = "公开著录与博物馆公开资料整理（种子数据，待研究员核校）"

# 演示账号（中性名称；正式使用时由管理员 Excel 导入真实账号）
USERS = [
    # account, name, org, identity, role, super, must_change
    ("admin", "平台管理员", "研究平台", "教师", "admin", True, False),
    ("office01", "平台办公室", "研究平台", "教师", "admin", False, False),
    ("r001", "研究员A", "人文学院", "教师", "researcher", False, False),
    ("r002", "研究员B", "历史学院", "教师", "researcher", False, False),
    ("u001", "演示研究生", "人文学院", "研究生", "user", False, False),
    ("u002", "演示本科生", "人文学院", "本科生", "user", False, True),
    ("u003", "文博人员A", "某博物馆", "文博人员", "user", False, False),
]

VESSELS = [
    dict(key="hezun", name="何尊", category="尊（盛酒器）", period="西周早期（成王五年）", find_place="宝鸡县贾村（今宝鸡市陈仓区）",
         district="陈仓区", find_date="1963年", collection="宝鸡青铜器博物院", catalog_refs="《殷周金文集成》06014",
         image="/img/vessels/hezun.jpg", evidence_grade="B", image_credit=True,
         gallery=[{"url": "/img/vessels/hezun_front.png", "caption": "何尊 · 正面"},
                  {"url": "/img/vessels/hezun_side.png", "caption": "何尊 · 侧面"},
                  {"url": "/img/vessels/hezun_inscription.png", "caption": "何尊 · 内底铭文拓片"}],
         description="尊内底铸铭文12行122字，记成王营建成周（洛邑）及对宗小子何的诰命。铭文“宅兹中或”之“中或”即“中国”，是目前所见“中国”一词最早的文字记录之一，指天下之中的地域，属方位地理概念，非现代国家名称。",
         ins=("唯王初迁宅于成周，复禀武王丰福自天。在四月丙戌，王诰宗小子于京室，曰：昔在尔考公氏，克逨文王，肆文王受兹大命。唯武王既克大邑商，则廷告于天，曰：余其宅兹中或，自之乂民。呜呼！尔有虽小子无识，视于公氏，有爵于天，彻命敬享哉！助王恭德裕天，训我不敏。王咸诰。何赐贝卅朋，用作庾公宝尊彝。唯王五祀。",
              "周成王开始营建成周，并以武王之礼祭天。四月丙戌日，王在京室诰教宗族小子何：武王攻克大邑商后告祭于天，说要居住在这天下的中心地区，从这里治理民众。何受赐贝三十朋，为庾公作此宝尊。时在成王五年。", 122)),
    dict(key="laipan", name="逨盘", category="盘（水器）", period="西周晚期（宣王）", find_place="眉县杨家村窖藏", district="眉县",
         find_date="2003年", collection="宝鸡青铜器博物院", catalog_refs="眉县杨家村窖藏发掘简报（2003）", image="/img/vessels/laipan.jpg",
         evidence_grade="B", description="盘内底铸铭文约372字，记述单氏家族八代人辅佐西周文王至宣王十二位王的事迹，可与《史记·周本纪》的王世系对读，是研究西周王世的重要材料。",
         ins=("逨曰：丕显朕皇高祖单公，桓桓克明慎厥德，夹召文王、武王，挞殷，膺受天鲁命，匍有四方，并宅厥勤疆土，用配上帝。（节选）",
              "逨追述其高祖单公能明德慎行，辅佐文王、武王伐殷，承受天命，广有四方。", 372)),
    dict(key="dayu", name="大盂鼎", category="鼎（食器）", period="西周早期（康王）", find_place="陕西郿县礼村（今眉县）", district="眉县",
         find_date="清道光年间", collection="中国国家博物馆", catalog_refs="《殷周金文集成》02837", image="/img/vessels/dayu.jpg",
         evidence_grade="B", description="鼎内壁铸铭文291字，记康王册命贵族盂，追述文王、武王受命与殷人因酗酒失国的教训，并赏赐盂人众与车马服饰，是研究西周册命与赏赐制度的重要材料。",
         ins=("唯九月，王在宗周，命盂。王若曰：盂，丕显文王，受天有大命，在武王嗣文作邦，辟厥慝，匍有四方，畯正厥民。（节选）",
              "九月，王在宗周册命盂，追述文王受天大命，武王继文王建国，广有四方。", 291)),
    dict(key="maogong", name="毛公鼎", category="鼎（食器）", period="西周晚期（宣王）", find_place="陕西岐山", district="岐山县",
         find_date="清道光末年", collection="台北故宫博物院", catalog_refs="《殷周金文集成》02841", image="/img/vessels/maogong.jpg",
         evidence_grade="B", description="鼎腹内壁铸铭文约497字，是目前所见铭文最长的青铜器之一，记宣王对重臣毛公厝的诰命与赏赐，反映西周晚期的政治局势与册命制度。",
         ins=("王若曰：父厝，丕显文武，皇天弘厌厥德，配我有周，膺受大命，率怀不廷方，亡不闬于文武耿光。（节选）",
              "王说：父厝，伟大的文王、武王，皇天嘉许其德，使周承受大命。", 497)),
    dict(key="qingongbo", name="秦公镈", category="镈（乐器）", period="春秋早期", find_place="宝鸡县太公庙村（今陈仓区）", district="陈仓区",
         find_date="1978年", collection="宝鸡青铜器博物院", catalog_refs="《殷周金文集成》00267", image="",
         evidence_grade="B", description="镈钲部与鼓部铸铭文135字，秦公追述先祖受天命、赏宅受国的历史，是研究早期秦国世系与秦文字的重要材料。",
         ins=("秦公曰：我先祖受天命，赏宅受国，烈烈昭文公、静公、宪公，不坠于上，昭合皇天。（节选）",
              "秦公追述先祖受天命、获赐宅地建国，文公、静公、宪公功业昭著。", 135)),
    dict(key="shigu", name="石鼓文", category="刻石", period="先秦秦国（年代有春秋、战国诸说）", find_place="唐初发现于陈仓（今宝鸡）一带，具体地点有凤翔诸说",
         district="凤翔区", find_date="唐初", collection="故宫博物院", catalog_refs="《石鼓文》诸拓本", image="/img/vessels/shigu.jpg",
         evidence_grade="B", description="十件鼓形刻石，各刻四言诗一首，记秦君游猎等事，是先秦秦系文字的代表，字形介于金文与小篆之间，是研究文字演变的关键材料。",
         ins=("吾车既工，吾马既同。吾车既好，吾马既阜。君子员猎，员猎员游。（《吾车》节选）",
              "我们的车已修好，马已齐备；君子去打猎，去打猎去游乐。", 0)),
    dict(key="guoji", name="虢季子白盘", category="盘（水器）", period="西周晚期（宣王十二年）", find_place="宝鸡虢川司（今陈仓区）", district="陈仓区",
         find_date="清道光年间", collection="中国国家博物馆", catalog_refs="《殷周金文集成》10173", image="/img/vessels/guoji.jpg",
         evidence_grade="B", description="盘内底铸铭文111字，记虢季子白奉命征伐猃狁于洛水之阳，献俘受赏之事，可与《诗经·小雅·六月》对读。",
         ins=("唯十又二年正月初吉丁亥，虢季子白作宝盘。丕显子白，壮武于戎工，经维四方，搏伐猃狁，于洛之阳。（节选）",
              "宣王十二年正月丁亥，虢季子白作此宝盘。子白英武，经营四方，在洛水之北征伐猃狁。", 111)),
    dict(key="qiangpan", name="墙盘", category="盘（水器）", period="西周中期（恭王）", find_place="扶风县庄白一号窖藏", district="扶风县",
         find_date="1976年", collection="宝鸡周原博物馆", catalog_refs="《殷周金文集成》10175", image="",
         evidence_grade="B", description="又称史墙盘，盘内底铸铭文284字，前半颂扬文、武、成、康、昭、穆诸王功业，后半记微氏家族史，是西周王世与家族史研究的重要材料。",
         ins=("曰古文王，初盭龢于政，上帝降懿德大屏，匍有上下，迨受万邦。（节选）",
              "追述文王始能和协政事，上帝降下美德与大助，使其广有天下，会受万邦。", 284)),
    dict(key="sanshi", name="散氏盘", category="盘（水器）", period="西周晚期", find_place="陕西凤翔", district="凤翔区",
         find_date="清乾隆年间", collection="台北故宫博物院", catalog_refs="《殷周金文集成》10176", image="",
         evidence_grade="B", description="盘内底铸铭文约350字，记夨、散两国划定田界的契约，详列踏勘路线与参与官员，是研究西周土地制度的重要材料。",
         ins=("用夨𢦚散邑，乃即散用田。（节选）", "因夨侵犯散邑，于是以田土赔偿散。", 0)),
    dict(key="weihe", name="卫盉", category="盉（酒器）", period="西周中期（恭王）", find_place="岐山县董家村窖藏", district="岐山县",
         find_date="1975年", collection="宝鸡周原博物馆", catalog_refs="《殷周金文集成》09456", image="",
         evidence_grade="B", description="盖内铸铭文132字，记裘卫以玉器、皮裘等物换取矩伯田地的经过，是研究西周土地交易的重要材料。",
         ins=("唯三年三月既生霸壬寅，王称旂于丰。矩伯庶人取瑾璋于裘卫。（节选）", "恭王三年三月壬寅，王在丰举行建旗典礼，矩伯向裘卫取得瑾璋。", 132)),
    dict(key="hugui", name="㝬簋", category="簋（食器）", period="西周晚期（厉王）", find_place="扶风县齐村", district="扶风县",
         find_date="1978年", collection="宝鸡周原博物馆", catalog_refs="《殷周金文集成》04317", image="",
         evidence_grade="B", description="又称胡簋，器形硕大，腹底铸铭文124字，为周厉王（名㝬）自作祭器，是目前所见形体最大的西周簋之一。",
         ins=("王曰：有余虽小子，余亡康昼夜，经拥先王，用配皇天。（节选）", "王说：我虽年轻，但昼夜不敢安逸，遵循先王之道以配皇天。", 124)),
    dict(key="zhegong", name="折觥", category="觥（酒器）", period="西周早期（昭王）", find_place="扶风县庄白一号窖藏", district="扶风县",
         find_date="1976年", collection="宝鸡周原博物馆", catalog_refs="《殷周金文集成》09303", image="",
         evidence_grade="B", description="器盖同铭，各40字，记王命作册折赏赐望土之事。（本条为待审示例）",
         ins=("唯五月，王在厈。戊子，令作册折贶望土于相侯。（节选）", "五月王在厈，戊子日命作册折把望地之土赐给相侯。", 40), pending=True),
]

TEXTS = [
    ("尚书", "召诰", "王来绍上帝，自服于土中。旦曰：其作大邑，其自时配皇天，毖祀于上下，其自时中乂。", "hezun"),
    ("诗经", "大雅·民劳", "民亦劳止，汔可小康。惠此中国，以绥四方。", "hezun"),
    ("史记", "周本纪", "成王在丰，使召公复营洛邑，如武王之意。周公复卜申视，卒营筑，居九鼎焉。曰：此天下之中，四方入贡道里均。", "hezun"),
    ("尚书", "康诰", "惟乃丕显考文王，克明德慎罚，不敢侮鳏寡。", "dayu"),
    ("诗经", "小雅·六月", "薄伐玁狁，至于大原。文武吉甫，万邦为宪。", "guoji"),
    ("史记", "秦本纪", "襄公以兵送周平王。平王封襄公为诸侯，赐之岐以西之地。", "qingongbo"),
    ("诗经", "秦风·无衣", "岂曰无衣？与子同袍。王于兴师，修我戈矛，与子同仇。", None),
]

GLYPH_CHARS = ["宅", "兹", "中", "国", "德", "王", "周", "天", "文", "武"]

READINGS = [  # 字, 上古, 中古
    ("中", "*truŋ", "ʈjuŋ"), ("国", "*kʷˤək", "kwok"), ("宅", "*[d]ˤrak", "ɖæk"), ("兹", "*tsə", "tsi"),
    ("德", "*tˤək", "tok"), ("王", "*ɢʷaŋ", "hjwang"), ("周", "*tiw", "tɕjuw"),
]

DIALECTS = [  # 区县, 词条, IPA, 词义
    ("渭滨区", "额", "ŋɤ˥˧", "我（第一人称）"), ("渭滨区", "嫑", "pɔ˧˩", "不要"), ("金台区", "谝", "pʰiæ̃˥˧", "闲聊"),
    ("金台区", "咥", "tiɛ˧˩", "吃（大口吃）"), ("陈仓区", "瓷", "tsʰɿ˨˦", "呆、不灵活"), ("陈仓区", "嘹", "liɔ˨˦", "好、棒"),
    ("凤翔区", "中", "tʃuŋ˧˩", "“中”字单字今读"), ("凤翔区", "国", "kuei˧˩", "“国”字单字今读（关中常见读法）"),
    ("岐山县", "宅", "tsei˨˦", "“宅”字单字今读"), ("岐山县", "德", "tei˧˩", "“德”字单字今读"),
    ("扶风县", "王", "uaŋ˨˦", "“王”字单字今读"), ("扶风县", "周", "tʂou˧˩", "“周”字单字今读"), ("眉县", "兹", "tsɿ˧˩", "“兹”字单字今读"),
    ("陇县", "娃", "ua˥˧", "孩子"), ("千阳县", "碎", "suei˦", "小"), ("麟游县", "嘹扎咧", "liɔ˨˦ tsa˧ liɛ", "好极了"),
    ("凤县", "曳", "iɛ˦", "拉、拽"), ("太白县", "心疼", "ɕiẽ˧˩ tʰəŋ", "漂亮、可爱"), ("眉县", "克里马擦", "kʰei li ma tsʰa", "快速、麻利"),
    ("陈仓区", "撒", "sa˥˧", "什么（疑问代词）"), ("凤翔区", "倭也", "uo˧˩ iɛ", "那里"), ("岐山县", "臊子", "sɔ˦ tsɿ", "肉丁浇头"),
]
DIALECT_SRC = "示例数据（演示用），正式条目以团队调查建档为准"

CONCEPTS = [  # 类型, 名称, 描述
    ("义", "中国（天下之中）", "何尊铭“宅兹中或（国）”之“中国”，指天下之中、以洛邑（成周）一带为中心的地域，是方位地理概念，并非现代国家名称。"),
    ("义", "宅（居处、定居）", "宅，居也。铭文“宅兹中或”谓定居于此天下之中，“宅”在此作动词。"),
    ("义", "德", "西周金文中“德”多与天命相关，强调敬德保民，如何尊“恭德裕天”、大盂鼎追述文王之德。"),
    ("义", "天命", "西周时期以“受天有大命”解释王权的正当性，见大盂鼎、毛公鼎、逨盘等铭文。"),
    ("礼制", "册命制度", "西周王室任命官员、赏赐命服车马的礼仪制度，大盂鼎、毛公鼎铭文有完整记录。"),
    ("礼制", "赏赐贝朋", "以贝为货币单位赏赐臣下，何尊铭“何赐贝卅朋”即赏贝三十朋。"),
    ("礼制", "宗庙祭祀", "周人于宗庙、京室祭告先王与上天，何尊铭记成王“复禀武王丰福自天”。"),
    ("人", "周文王", "周文王姬昌，西周奠基者，金文中多称“丕显文王，受天有大命”。"),
    ("人", "周武王", "周武王姬发，克商建立西周；何尊铭记其“既克大邑商，则廷告于天”。"),
    ("人", "周成王", "周成王姬诵，何尊铭所记“王初迁宅于成周”之王。"),
    ("人", "何", "何尊器主，宗小子何，受成王诰教并赐贝三十朋。"),
    ("人", "毛公厝", "毛公鼎器主，宣王重臣，铭文记其受命总理朝政。"),
    ("人", "虢季子白", "虢季子白盘器主，宣王时率军征伐猃狁。"),
    ("人", "单逨", "逨盘器主，单氏家族成员，铭文追述家族八代辅佐周王。"),
    ("事", "营建成周", "周初在洛邑营建成周，作为控制东方的中心，《史记·周本纪》称“此天下之中”。"),
    ("事", "武王克商", "周武王攻克商都（大邑商），建立西周王朝。"),
    ("事", "征伐猃狁", "西周晚期与北方猃狁的战争，见虢季子白盘与《诗经·小雅·六月》。"),
    ("地", "成周（洛邑）", "西周东都，今河南洛阳一带。"),
    ("地", "宗周", "西周都城镐京一带。"),
]

ADJ_SEED = [
    ("何尊字形候选", "候选字“宅”：拓片第1行第5字，构形从宀从乇，与字形库中“宅”金文写法相合。", 78),
    ("字形释读存疑", "候选字“或”：拓片第8行，可读为“国”，与“中”连读为“中或（国）”。", 64),
    ("方言条目复核", "岐山方言“宅”读 tsei，可作为“宅”字古音演变的辅助证据。", 55),
    ("器铭出处补充", "逨盘铭文“夹召文王、武王”可与《史记·周本纪》王世系对读。", 70),
    ("传世文献对照", "《尚书·召诰》“其自时中乂”与何尊“自之乂民”语义相近。", 60),
]


def seed_if_empty(db: Session):
    if db.scalar(select(User).limit(1)):
        return
    for k, label, v in points.DEFAULT_RULES:
        db.add(PointRule(key=k, label=label, value=v))
    users = {}
    for account, name, org, ident, role, sup, must in USERS:
        u = User(account=account, name=name, org=org, identity_type=ident, role=role, is_super=sup,
                 must_change_pwd=must, password_hash=hash_password(DEMO_PASSWORD))
        db.add(u)
        db.flush()
        users[account] = u
        if role == "user":
            points.add_entry(db, u.id, "GRANT", 100, reason="新用户初始积分")
    r1, r2 = users["r001"], users["r002"]
    t0 = datetime.now() - timedelta(days=12)

    # 器物与铭文：r002 录入、r001 审核（双人原则）；折觥为 r002 录入的待审示例
    vmap = {}
    for i, d in enumerate(VESSELS):
        pending = d.get("pending", False)
        st = "pending" if pending else "approved"
        v = Vessel(name=d["name"], category=d["category"], period=d["period"], find_place=d["find_place"], district=d["district"],
                   find_date=d["find_date"], collection=d["collection"], catalog_refs=d["catalog_refs"], description=d["description"],
                   image=d["image"], gallery=d.get("gallery", []),
                   image_credit=IMAGE_CREDIT if d.get("image_credit") else "",
                   evidence_grade=d["evidence_grade"], level="L1", status=st, source=SRC,
                   created_by=r2.id, reviewed_by=None if pending else r1.id, created_at=t0 + timedelta(hours=i * 7),
                   updated_at=t0 + timedelta(hours=i * 7 + 3))
        db.add(v)
        db.flush()
        vmap[d["key"]] = v
        tr, interp, cnt = d["ins"]
        ins = Inscription(vessel_id=v.id, transcription=tr, interpretation=interp,
                          char_count=cnt or sum(1 for c in tr if "㐀" <= c <= "鿿"), source="通行释文；" + d["catalog_refs"],
                          evidence_grade="B", level="L1", status=st, created_by=r2.id, reviewed_by=None if pending else r1.id)
        db.add(ins)
        db.flush()
        for tbl, obj in (("vessels", v), ("inscriptions", ins)):
            db.add(RecordVersion(table_name=tbl, record_id=obj.id, version=1, data={"seed": True}, action="create", editor_id=r2.id))
            if not pending:
                link_record(db, tbl, obj)
                db.add(AuditLog(actor_id=r1.id, actor_name=r1.name, action="数据审核", target=f"{'器物' if tbl == 'vessels' else '铭文'}#{obj.id}",
                                detail={"approve": True}, created_at=t0 + timedelta(hours=i * 7 + 3)))

    for title, chapter, content, vk in TEXTS:
        t = TextPassage(title=title, chapter=chapter, content=content, source="公有领域传世文献（通行本）",
                        related_vessel_id=vmap[vk].id if vk else None, level="L1", status="approved", created_by=r2.id, reviewed_by=r1.id)
        db.add(t)
        db.flush()
        link_record(db, "texts", t)

    # 字形：三种书体占位，金文关联何尊
    for ch in GLYPH_CHARS:
        for script in ("金文", "石鼓文", "小篆"):
            g = Glyph(character=ch, script=script, vessel_id=vmap["hezun"].id if script == "金文" and ch in "宅兹中国德王天文武" else None,
                      image_path="", note="占位字形：以字体渲染示意，待研究员上传拓片切图（透明底PNG）后替换。",
                      source="字形占位（待核对）", level="L1", status="approved", created_by=r2.id, reviewed_by=r1.id)
            db.add(g)
            db.flush()
            link_record(db, "glyphs", g)
    # 一条待审字形，用于演示双人审核（研究员A可审）
    db.add(Glyph(character="或", script="金文", vessel_id=vmap["hezun"].id, note="何尊铭“中或”之“或”，待审。",
                 source="何尊拓片切图（待上传）", level="L1", status="pending", created_by=r2.id))

    for ch, oc, mc in READINGS:
        db.add(Reading(character=ch, layer="上古", value=oc, source="Baxter–Sagart(2014)构拟（示例，待核）"))
        db.add(Reading(character=ch, layer="中古", value=mc, source="《广韵》音系转写（示例，待核）"))
        cn = node(db, "字", ch)
        edge(db, cn, node(db, "音", f"{ch}·上古音 {oc}", props={"grade": "C"}), "上古音", "Baxter–Sagart(2014)构拟（示例）", "C")
        edge(db, cn, node(db, "音", f"{ch}·中古音 {mc}", props={"grade": "C"}), "中古音", "《广韵》（示例）", "C")

    for i, (dist, word, ipa, meaning) in enumerate(DIALECTS):
        d = DialectEntry(district=dist, speaker_code=f"BJ-{dist[:2]}-{i + 1:03d}", word=word, ipa=ipa, meaning=meaning,
                         source=DIALECT_SRC, level="L1", status="approved", created_by=r2.id, reviewed_by=r1.id)
        db.add(d)
        db.flush()
        link_record(db, "dialect_entries", d)
    db.add(DialectEntry(district="陇县", speaker_code="BJ-陇县-099", word="木乱", ipa="mu luã", meaning="烦躁、不舒服（待审）",
                        source=DIALECT_SRC, level="L2", status="pending", created_by=r2.id))

    # 概念、人物、事件、礼制节点与关系
    cmap = {}
    for typ, name, desc in CONCEPTS:
        cmap[name] = node(db, typ, name, props={"desc": desc, "grade": "B"})
    E = lambda a, b, rel: edge(db, a, b, rel, "研究员补充关系（种子数据）", "B")
    hz, hz_ins = node(db, "器", "何尊", ref_table="vessels", ref_id=vmap["hezun"].id), None
    from .models import KGNode
    hz_ins = db.scalar(select(KGNode).where(KGNode.type == "铭", KGNode.name == "何尊铭"))
    for ch, cpt in (("中", "中国（天下之中）"), ("国", "中国（天下之中）"), ("或", "中国（天下之中）"), ("宅", "宅（居处、定居）"), ("德", "德"), ("天", "天命")):
        E(node(db, "字", ch), cmap[cpt], "义项")
    E(hz_ins, cmap["中国（天下之中）"], "记载")
    E(hz, cmap["周成王"], "提及")
    E(hz, cmap["周武王"], "提及")
    E(hz, cmap["周文王"], "提及")
    E(cmap["何"], hz, "器主")
    E(hz_ins, cmap["营建成周"], "记事")
    E(cmap["营建成周"], cmap["成周（洛邑）"], "地点")
    E(hz_ins, cmap["武王克商"], "追述")
    E(hz_ins, cmap["赏赐贝朋"], "礼制")
    E(hz_ins, cmap["宗庙祭祀"], "礼制")
    E(cmap["中国（天下之中）"], cmap["成周（洛邑）"], "所指")
    for k in ("dayu", "maogong"):
        vn = node(db, "器", vmap[k].name, ref_table="vessels", ref_id=vmap[k].id)
        E(vn, cmap["册命制度"], "礼制")
        E(vn, cmap["天命"], "观念")
        E(vn, cmap["周文王"], "提及")
    E(cmap["毛公厝"], node(db, "器", "毛公鼎", ref_table="vessels", ref_id=vmap["maogong"].id), "器主")
    E(cmap["虢季子白"], node(db, "器", "虢季子白盘", ref_table="vessels", ref_id=vmap["guoji"].id), "器主")
    E(node(db, "器", "虢季子白盘", ref_table="vessels", ref_id=vmap["guoji"].id), cmap["征伐猃狁"], "记事")
    E(cmap["单逨"], node(db, "器", "逨盘", ref_table="vessels", ref_id=vmap["laipan"].id), "器主")
    lp = node(db, "器", "逨盘", ref_table="vessels", ref_id=vmap["laipan"].id)
    for p in ("周文王", "周武王", "周成王"):
        E(lp, cmap[p], "提及")
    E(cmap["周武王"], cmap["武王克商"], "主导")
    E(cmap["周成王"], cmap["营建成周"], "主导")
    E(cmap["德"], cmap["天命"], "相关")
    E(node(db, "器", "墙盘", ref_table="vessels", ref_id=vmap["qiangpan"].id), cmap["周文王"], "提及")

    # 任务模板与批次
    tpl_c = TaskTemplate(code="correction", name="释文纠错", description="对存疑的释读提出修改意见，并上传依据。", reward=10, daily_limit=10)
    tpl_d = TaskTemplate(code="dialect", name="方言条目标注", description="听音频、校订音标与词义，提供来源信息。", reward=2, daily_limit=30)
    tpl_s = TaskTemplate(code="source", name="文献来源补充", description="核对器铭关联文献出处，提交明确著录。", reward=5, daily_limit=10)
    db.add_all([tpl_c, tpl_d, tpl_s])
    db.flush()
    dialect_ids = [d.id for d in db.scalars(select(DialectEntry).where(DialectEntry.status == "approved"))]
    db.add(TaskBatch(template_id=tpl_d.id, title="关陇方言条目标注·第一批", description="校对岐山、扶风、凤翔等区县单字今读的音标与词义。",
                     items=dialect_ids[:12], created_by=r1.id))
    db.add(TaskBatch(template_id=tpl_d.id, title="关陇方言条目标注·第二批", description="校对陇县、千阳、麟游等区县常用词。",
                     items=dialect_ids[12:], created_by=r2.id))
    db.add(TaskSubmission(template_id=tpl_c.id, user_id=users["u001"].id, target_type="inscriptions", target_id="I1",
                          target_title="何尊·铭文", content={"opinion": "“自之乂民”之“乂”，部分著录隶定作“辥”，建议注明异说。",
                                                            "basis": "参见相关著录的不同隶定。"}))
    db.add(TaskSubmission(template_id=tpl_d.id, user_id=users["u003"].id, batch_id=None, target_type="dialect_entries",
                          target_id=str(dialect_ids[8]), target_title="方言·宅（岐山县）", content={"ipa": "tsei˨˦", "meaning": "“宅”字单字今读，老派发音人"}))

    # 裁断队列
    hz_cids = ["V1", "I1"]
    for i, (title, cand, conf) in enumerate(ADJ_SEED):
        db.add(Adjudication(title=title, candidate=cand, question="（种子示例）", confidence=conf, submitted_by=r1.id,
                            evidence=[{"cid": c, "title": "何尊·器物信息" if c.startswith("V") else "何尊·铭文", "grade": "B"} for c in hz_cids],
                            image_path="", status="pending"))

    # 考核指标（目标值可在驾驶舱建设进度视图由管理员修改；以申请书第七部分为准）
    for ind, metric, year, target, unit in [
        ("器铭入库", "vessels", 2026, 50, "件"), ("方言条目", "dialects", 2026, 200, "条"), ("知识图谱节点", "kg_nodes", 2026, 500, "个"),
        ("字形切图", "glyphs", 2026, 60, "幅"), ("方言覆盖区县", "dialect_districts", 2026, 4, "个"), ("抽检引证准确率", "citation_accuracy", 2026, 90, "%"),
        ("器铭入库", "vessels", 2027, 200, "件"), ("方言条目", "dialects", 2027, 1000, "条"), ("知识图谱节点", "kg_nodes", 2027, 3000, "个"),
        ("评测集题数", "eval_items", 2027, 500, "题"), ("抽检引证准确率", "citation_accuracy", 2027, 95, "%")]:
        db.add(KPITarget(indicator=ind, metric=metric, year=year, target=target, unit=unit))

    db.flush()
    retrieval.rebuild_all(db)
    db.commit()
