"""运行配置：全部可用环境变量覆盖。"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("ZZ_DATA_DIR", BASE_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
EXPORT_DIR = DATA_DIR / "exports"
for _d in (DATA_DIR, UPLOAD_DIR, EXPORT_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# 开发默认 SQLite；部署时改为 postgresql+psycopg://user:pwd@host/db
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'zhaizi.db').as_posix()}")

JWT_SECRET = os.getenv("ZZ_JWT_SECRET", "dev-secret-change-me-in-production-0123456789")
ACCESS_MINUTES = 120          # 访问令牌 2 小时
REFRESH_DAYS = 7              # 刷新令牌 7 天
LOCK_THRESHOLD = 5            # 连续 5 次错误
LOCK_MINUTES = 15             # 锁定 15 分钟

# 模型适配层（TBD-1：Qwen3.8-Max 接入方式以官方文档为准，这里按 OpenAI 兼容协议封装）
MODEL_API_KEY = os.getenv("ZZ_MODEL_API_KEY", "")
MODEL_BASE_URL = os.getenv("ZZ_MODEL_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
MODEL_NAME = os.getenv("ZZ_MODEL_NAME", "qwen3.8-max")
MODEL_TIMEOUT = int(os.getenv("ZZ_MODEL_TIMEOUT", "30"))

# 用于加密存储模型密钥（系统设置页写入）
SETTINGS_KEY = os.getenv("ZZ_SETTINGS_KEY", JWT_SECRET)

# 机构署名只从部署环境读取，源码不写死任何单位名称；留空即为匿名（双盲评审）模式
ORG_LINE = os.getenv("ZZ_ORG_LINE", "")          # 登录页底部署名，如“××大学 · ××实验室”
ORG_SHORT = os.getenv("ZZ_ORG_SHORT", "")        # 侧栏版权行
IMAGE_CREDIT = os.getenv("ZZ_IMAGE_CREDIT") or "藏品照片经馆藏单位授权用于研究"
ANON = not ORG_LINE

RETRIEVAL_TOP_K = 12
QA_CONTEXT_TURNS = 10
