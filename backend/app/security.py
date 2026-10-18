import base64
import hashlib
import secrets
import string
from datetime import datetime, timedelta

import bcrypt
import jwt

from .config import ACCESS_MINUTES, JWT_SECRET, REFRESH_DAYS, SETTINGS_KEY


def hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(pwd: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pwd.encode(), hashed.encode())
    except ValueError:
        return False


def random_password(n: int = 8) -> str:
    """8 位随机初始密码，至少含 1 个字母和 1 个数字，去掉易混淆字符。"""
    letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ"
    digits = "23456789"
    while True:
        pwd = "".join(secrets.choice(letters + digits) for _ in range(n))
        if any(c in letters for c in pwd) and any(c in digits for c in pwd):
            return pwd


def password_ok(pwd: str) -> bool:
    return len(pwd) >= 8 and any(c.isalpha() for c in pwd) and any(c.isdigit() for c in pwd)


def make_token(user_id: int, token_version: int, kind: str) -> str:
    exp = datetime.utcnow() + (timedelta(minutes=ACCESS_MINUTES) if kind == "access" else timedelta(days=REFRESH_DAYS))
    return jwt.encode({"sub": str(user_id), "tv": token_version, "kind": kind, "exp": exp}, JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


# ---- 模型密钥加密存储（ADMIN-17）：用 SETTINGS_KEY 派生的密钥流做 XOR + HMAC 校验 ----
def _keystream(n: int, nonce: bytes) -> bytes:
    out = b""
    counter = 0
    while len(out) < n:
        out += hashlib.sha256(SETTINGS_KEY.encode() + nonce + counter.to_bytes(4, "big")).digest()
        counter += 1
    return out[:n]


def encrypt_secret(plain: str) -> str:
    nonce = secrets.token_bytes(12)
    data = plain.encode()
    ct = bytes(a ^ b for a, b in zip(data, _keystream(len(data), nonce)))
    mac = hashlib.sha256(SETTINGS_KEY.encode() + nonce + ct).digest()[:8]
    return base64.b64encode(nonce + mac + ct).decode()


def decrypt_secret(token: str) -> str:
    if not token:
        return ""
    raw = base64.b64decode(token)
    nonce, mac, ct = raw[:12], raw[12:20], raw[20:]
    if hashlib.sha256(SETTINGS_KEY.encode() + nonce + ct).digest()[:8] != mac:
        return ""
    return bytes(a ^ b for a, b in zip(ct, _keystream(len(ct), nonce))).decode()


ALNUM = string.ascii_letters + string.digits
