"""模型适配层（PRD §7.1）。

- 配置了密钥与模型 ID：按 OpenAI 兼容协议调用选定服务商。
- 未配置密钥：使用“演示模型”，只把检索条目摘句重组，严格带引用，不做自由发挥，
  便于在接入正式模型前跑通引证核验、积分预扣、裁断等全流程。
演示模型的故障注入：问题中含“#模拟超时”或“#模拟报错”时抛出异常，用于验证积分退回（T3）。
"""
import re
import time
from urllib.parse import urlsplit, urlunsplit

import httpx

from . import config

SYSTEM_PROMPT = (
    "你是“宅兹”周秦出土文献研究助手。只依据下面给定的库内条目作答；"
    "每个实质性判断之后用 [条目ID] 标注引用，例如 [V1]、[I3]；"
    "条目没有涉及的内容，明确回答“库内暂无相关资料”，不要自由发挥；"
    "如果必须给出推测，在该句前加“推测：”。回答使用简体中文，分条清晰。"
)

VISION_PROMPT = (
    "这是一张出土文献拓片或器物照片。请识别图中最可能的古文字，给出最多4个候选字，"
    "按 JSON 输出：{\"candidates\":[{\"char\":\"宅\",\"score\":0.8,\"reason\":\"...\"}]}，只输出 JSON。"
)


class ModelError(Exception):
    pass


PROVIDERS = [
    {"id": "tokenone", "name": "TokenOne 分组模型", "base_url": "https://token.agentone.work/v1"},
    {"id": "openai", "name": "OpenAI 官方", "base_url": "https://api.openai.com/v1"},
    {"id": "deepseek", "name": "DeepSeek 官方", "base_url": "https://api.deepseek.com/v1"},
    {"id": "dashscope", "name": "通义千问官方（百炼）", "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
    {"id": "custom", "name": "自定义 OpenAI 兼容接口", "base_url": ""},
]


def provider_for_url(base: str) -> str:
    return next((p["id"] for p in PROVIDERS if p["base_url"] == base), "custom")


def normalize_base_url(value: str) -> str:
    """Accept a provider origin or an OpenAI-compatible API base path."""
    parts = urlsplit(value.strip())
    if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError("请填写 http(s) 接口地址，不含密钥、查询参数或片段")
    path = parts.path.rstrip("/") or "/v1"
    return urlunsplit((parts.scheme, parts.netloc, path, "", ""))


def runtime_settings():
    """系统设置页可覆盖环境变量（密钥加密存储）。"""
    from .db import SessionLocal
    from .models import SystemSetting
    from .security import decrypt_secret
    db = SessionLocal()
    try:
        s = {r.key: r.value for r in db.query(SystemSetting).all()}
    finally:
        db.close()
    key = decrypt_secret(s["model_api_key_enc"]) if "model_api_key_enc" in s else config.MODEL_API_KEY
    return {
        "api_key": key,
        "base_url": normalize_base_url(s.get("model_base_url") or config.MODEL_BASE_URL),
        "model": s.get("model_name") or config.MODEL_NAME,
        "timeout": int(s.get("model_timeout") or config.MODEL_TIMEOUT),
    }


def model_label() -> str:
    s = runtime_settings()
    return (s["model"] or "尚未选择模型") if s["api_key"] else "库内检索摘引（未接入云端模型）"


def chat(messages: list[dict], *, image_data_url: str | None = None, demo_chunks=None, question: str = ""):
    """返回 (文本, tokens_in, tokens_out, 模型名)。"""
    s = runtime_settings()
    if not s["api_key"]:
        return _demo_answer(question, demo_chunks or [])
    if not s["model"]:
        raise ModelError("请在模型与 API 设置中选择或填写模型 ID")
    if image_data_url:
        last = messages[-1]
        last["content"] = [{"type": "image_url", "image_url": {"url": image_data_url}},
                           {"type": "text", "text": last["content"]}]
    try:
        r = httpx.post(f"{s['base_url'].rstrip('/')}/chat/completions",
                       headers={"Authorization": f"Bearer {s['api_key']}"},
                       json={"model": s["model"], "messages": messages},
                       timeout=s["timeout"])
    except httpx.TimeoutException as e:
        raise ModelError("模型响应超时") from e
    except httpx.HTTPError as e:
        raise ModelError(f"模型接口不可用：{e}") from e
    if r.status_code != 200:
        raise ModelError(f"模型接口返回 {r.status_code}")
    try:
        data = r.json()
        text = data["choices"][0]["message"]["content"]
        if not isinstance(text, str):
            raise ValueError("missing text")
    except (ValueError, KeyError, TypeError, IndexError) as e:
        raise ModelError("模型返回格式不符合 OpenAI 兼容对话协议") from e
    usage = data.get("usage") or {}
    return text, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), s["model"]


def _sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[。；！？])", text) if s.strip()]


def _demo_answer(question: str, chunks):
    t0 = time.time()
    if "#模拟超时" in question:
        time.sleep(1.5)
        raise ModelError("模型响应超时（测试故障注入）")
    if "#模拟报错" in question:
        raise ModelError("模型接口返回 500（测试故障注入）")
    if not chunks:
        return "库内暂无相关资料。", 0, 0, "库内检索摘引"
    from .retrieval import grams
    qg = set(g for g in grams(question) if len(g) > 1)
    lines = []
    used = 0
    for c in chunks[:5]:
        best = []
        for s in _sentences(c.text):
            hit = sum(1 for g in qg if g in s)
            if hit:
                best.append((hit, s.strip()))
        best.sort(key=lambda x: -x[0])
        picked = [s for _, s in best[:2]] or [_sentences(c.text)[0].strip()]
        # 每一句后都带引用角标，满足“每个实质性判断后附引用”
        body = "".join((s if len(s) <= 90 else s[:90] + "……").rstrip("。；") + f"。[{c.cid}]" for s in picked)
        lines.append(f"{c.title}：{body}")
        used += 1
        if used >= 4:
            break
    head = "根据本次检索到的库内条目，相关依据如下："
    tail = "以上为库内条目摘引，具体释读与分歧请以原器拓片、权威著录和专家裁断为准。"
    text = head + "\n" + "\n".join(f"{i + 1}. {l}" for i, l in enumerate(lines)) + "\n" + tail
    # 粗略估计 token 用量，供运营视图统计
    return text, 0, 0, "库内检索摘引"


def demo_vision(hint: str, glyph_chars: list[str]):
    """演示模式下没有视觉模型：以用户提示字和字形库相近字组织候选，明确标注来源。"""
    similar = {"宅": ["宅", "宇", "室", "宀"], "中": ["中", "仲", "冲", "史"], "国": ["或", "国", "域", "戈"],
               "或": ["或", "国", "域", "戈"], "王": ["王", "玉", "士", "壬"], "德": ["德", "徝", "直", "得"],
               "周": ["周", "用", "同", "凡"], "兹": ["兹", "丝", "幺", "玄"]}
    base = hint[:1] if hint else (glyph_chars[0] if glyph_chars else "宅")
    cands = similar.get(base, [base] + [c for c in glyph_chars if c != base][:3])
    scores = [0.72, 0.14, 0.08, 0.06]
    return [{"char": c, "score": scores[i], "reason": "字形库相近字（未经视觉识别，分值为候选排序权重）"}
            for i, c in enumerate(cands[:4])]
