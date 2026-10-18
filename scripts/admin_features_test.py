"""Integration checks with disposable data and a mocked model provider; no cloud calls."""
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
import unittest
from unittest.mock import patch

_data = tempfile.TemporaryDirectory(prefix="zhaizi-tests-")
os.environ["ZZ_DATA_DIR"] = _data.name
os.environ["ZZ_JWT_SECRET"] = secrets.token_hex(32)
os.environ["ZZ_MODEL_API_KEY"] = ""
os.environ["ZZ_BOOTSTRAP_PASSWORD"] = secrets.token_urlsafe(24)
os.environ.pop("DATABASE_URL", None)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db import SessionLocal, engine
from app.models import AuditLog, Chunk, SystemSetting, UsageLog
from app import llm, retrieval


class AdminFeatures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()
        cls.tokens, cls.users = {}, {}
        for account in ("admin", "office01", "r001", "u001", "u003"):
            r = cls.client.post("/api/auth/login", json={"account": account, "password": os.environ["ZZ_BOOTSTRAP_PASSWORD"]})
            assert r.status_code == 200, r.text
            cls.tokens[account] = {"Authorization": "Bearer " + r.json()["access_token"]}
            cls.users[account] = r.json()["user"]

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        engine.dispose()
        _data.cleanup()

    def call(self, method, path, body=None, account="office01"):
        return self.client.request(method, "/api" + path, headers=self.tokens[account], **({"json": body} if body is not None else {}))

    def test_01_settings_permissions_and_secret(self):
        key = "test-only-" + secrets.token_hex(24)
        r = self.call("PUT", "/admin/settings", {"model_base_url": "https://token.agentone.work", "model_name": "group-model", "model_api_key": key})
        self.assertEqual(r.status_code, 200, r.text)
        settings = self.call("GET", "/admin/settings")
        self.assertNotIn(key, settings.text)
        self.assertEqual(settings.json()["model_api_key_tail"], "****" + key[-4:])
        self.assertEqual(settings.json()["model_base_url"], "https://token.agentone.work/v1")
        with SessionLocal() as db:
            self.assertNotIn(key, db.get(SystemSetting, "model_api_key_enc").value)
            self.assertNotIn(key, json.dumps([a.detail for a in db.scalars(select(AuditLog))]))
        self.assertEqual(self.call("GET", "/admin/settings", account="r001").status_code, 403)
        self.assertEqual(self.call("PUT", "/admin/settings", {"model_api_key": "unauthorized"}, account="u001").status_code, 403)
        self.assertEqual(self.call("PUT", "/admin/settings", {"model_timeout": 1}).status_code, 422)
        self.assertEqual(self.call("PUT", "/admin/settings", {"model_base_url": "https://user:secret@example.com"}).status_code, 400)
        self.assertEqual(llm.normalize_base_url("https://token.agentone.work/v1/"), "https://token.agentone.work/v1")
        self.assertEqual(llm.normalize_base_url("https://example.org/compatible-mode/v1"), "https://example.org/compatible-mode/v1")
        response = httpx.Response(200, json={"data": [{"id": "group-a"}, {"id": "group-b"}, {"id": "group-a"}]})
        with patch("app.routers.admin.httpx.get", return_value=response) as upstream:
            result = self.call("POST", "/admin/settings/models", {})
            self.assertEqual(result.json()["models"], ["group-a", "group-b"])
            self.assertEqual(upstream.call_args.args[0], "https://token.agentone.work/v1/models")
            self.assertEqual(upstream.call_args.kwargs["headers"]["Authorization"], "Bearer " + key)
        with patch("app.routers.admin.httpx.get", return_value=httpx.Response(401, text=key)):
            result = self.call("POST", "/admin/settings/models", {})
            self.assertEqual(result.status_code, 502)
            self.assertNotIn(key, result.text)
        self.call("PUT", "/admin/settings", {"model_api_key": ""})
        self.assertEqual(llm.runtime_settings()["api_key"], "")
        self.assertEqual(self.call("POST", "/admin/settings/models", {}).status_code, 400)

    def test_02_notifications_delivery_and_groups(self):
        spec = {"audience": "users", "user_ids": [self.users["u001"]["id"], self.users["u001"]["id"]]}
        preview = self.call("POST", "/admin/notifications/preview", spec).json()
        self.assertEqual(preview["count"], 1)
        title = "定向通知自动化测试"
        result = self.call("POST", "/admin/notifications/send", {**spec, "title": title, "body": "仅供测试的通知正文", "recipient_signature": preview["recipient_signature"]})
        self.assertEqual(result.json()["sent"], 1)
        self.assertIn(title, self.call("GET", "/auth/notifications", account="u001").text)
        self.assertNotIn(title, self.call("GET", "/auth/notifications", account="u003").text)
        self.assertEqual(self.call("POST", "/admin/notifications/preview", {"audience": "group"}).status_code, 400)
        self.assertEqual(self.call("POST", "/admin/notifications/preview", spec, account="r001").status_code, 403)
        group = {"audience": "group", "role": "researcher", "org": "人文学院"}
        p = self.call("POST", "/admin/notifications/preview", group).json()
        self.assertEqual(p["count"], 1)
        self.assertEqual(p["sample"][0]["account"], "r001")
        stale = self.call("POST", "/admin/notifications/send", {**group, "title": "群体测试", "body": "测试", "recipient_signature": "stale"})
        self.assertEqual(stale.status_code, 409)
        user = self.call("POST", "/admin/users", {"account": "qaDisabled", "name": "测试停用账号", "status": "disabled"}).json()["user"]
        p = self.call("POST", "/admin/notifications/preview", {"audience": "users", "user_ids": [user["id"]]}).json()
        self.assertEqual(p["count"], 0)
        self.assertIn(title, self.call("GET", "/admin/notifications/history").text)

    def test_03_knowledge_dynamic_scope_and_training(self):
        bid = self.call("POST", "/admin/knowledge-bases", {"name": "自动化测试知识库"}).json()["id"]
        url = f"/admin/knowledge-bases/{bid}"
        doc = {"title": "关陇青铜知识更新测试", "content": "关陇青铜知识更新测试仅用于验证检索索引。青铜资料更新后可以检索。", "source": "自动化测试样例，非实际研究成果", "level": "L1", "status": "draft"}
        did = self.call("POST", url + "/documents", doc).json()["id"]
        cfg = {"enabled": True, "collections": [], "knowledge_base_ids": [bid]}
        self.assertEqual(self.call("PUT", "/admin/agents/text", cfg).status_code, 200)
        with SessionLocal() as db:
            found, _ = retrieval.search(db, "关陇青铜知识更新测试", collections=[], knowledge_doc_ids={did})
            self.assertFalse(found)
        doc["status"] = "approved"
        self.assertEqual(self.call("PUT", url + f"/documents/{did}", doc).status_code, 200)
        run = self.call("POST", url + "/train", {}).json()
        self.assertEqual(run["documents"], 1)
        self.assertGreater(run["chunks"], 0)
        with SessionLocal() as db:
            found, _ = retrieval.search(db, "关陇青铜知识更新测试", collections=[], knowledge_doc_ids={did})
            self.assertTrue(found)
            self.assertTrue(all(c.ref_table == "knowledge_documents" for c in found))
            hidden, _ = retrieval.search(db, "关陇青铜知识更新测试", collections=[], knowledge_doc_ids=set())
            self.assertFalse(hidden)
        session = self.call("POST", "/qa/sessions", {}).json()["id"]
        answer = self.call("POST", f"/qa/sessions/{session}/messages", {"question": "关陇青铜知识更新测试"})
        self.assertEqual(answer.status_code, 200, answer.text)
        self.assertTrue(answer.json()["answer"]["citations"])
        self.assertTrue(answer.json()["answer"]["citations"][0]["cid"].startswith("KB"))
        doc["level"] = "L2"
        self.call("PUT", url + f"/documents/{did}", doc)
        with SessionLocal() as db:
            found, excluded = retrieval.search(db, "关陇青铜知识更新测试", collections=[], knowledge_doc_ids={did})
            self.assertFalse(found)
            self.assertTrue(excluded)
        doc["status"] = "disabled"
        self.call("PUT", url + f"/documents/{did}", doc)
        with SessionLocal() as db:
            self.assertFalse(db.scalars(select(Chunk).where(Chunk.ref_table == "knowledge_documents", Chunk.ref_id == did)).all())
        self.assertEqual(self.call("POST", url + "/train", account="u001").status_code, 403)
        self.assertEqual(len(self.call("GET", url + "/training-runs").json()), 1)
        self.call("PUT", "/admin/agents/text", {**cfg, "enabled": False})
        self.assertEqual(self.call("POST", f"/qa/sessions/{session}/messages", {"question": "测试"}).status_code, 409)

    def test_04_metrics_have_no_fabricated_samples(self):
        screen = self.call("GET", "/dash/screen").json()
        self.assertEqual(len(screen["districts"]), 12)
        self.assertIsNone(screen["trust"]["citation_accuracy"])
        progress = self.call("GET", "/dash/progress").json()
        self.assertTrue(all(k["current"] is None for k in progress["kpis"] if "准确率" in k["indicator"]))
        self.assertEqual(self.call("POST", "/admin/trust-samples", {"sampled": -1, "accurate": 0, "claims": 0, "unsourced_claims": 0}).status_code, 422)

    def test_05_operations_aggregates_and_period(self):
        before = self.call("GET", "/dash/ops?days=7").json()
        self.assertEqual(len(before["trend"]), 7)
        self.assertEqual(len(before["users"]["dau_trend"]), 7)
        self.assertEqual(before["assets"]["total"], sum(row["value"] for row in before["assets"]["by_type"]))
        self.assertEqual(len(before["assets"]["districts"]), 12)
        self.assertEqual(sum(before["points"]["balance_dist"].values()), before["users"]["total"])
        self.assertEqual(before["notifications"]["read"] + before["notifications"]["unread"], before["notifications"]["total"])
        with SessionLocal() as db:
            db.add_all([UsageLog(user_id=self.users["admin"]["id"], role="admin", action="qa", tokens_in=100, tokens_out=40, latency_ms=500),
                        UsageLog(user_id=self.users["admin"]["id"], role="admin", action="vision", tokens_in=60, tokens_out=20, latency_ms=900),
                        UsageLog(user_id=self.users["admin"]["id"], role="admin", action="export", tokens_in=9999, tokens_out=9999)])
            db.commit()
        after = self.call("GET", "/dash/ops?days=30").json()
        self.assertEqual(after["model"]["calls"], before["model"]["calls"] + 2)
        self.assertEqual(after["model"]["tokens_in"], before["model"]["tokens_in"] + 160)
        self.assertEqual(after["model"]["tokens_out"], before["model"]["tokens_out"] + 60)
        self.assertEqual(len(after["trend"]), 30)
        self.assertEqual(after["knowledge"]["documents"], 1)
        self.assertEqual(after["knowledge"]["training_runs"], 1)
        self.assertEqual(self.call("GET", "/dash/ops", account="r001").status_code, 403)
        self.assertEqual(self.call("GET", "/dash/ops?days=0").status_code, 422)


if __name__ == "__main__":
    unittest.main(verbosity=2)
