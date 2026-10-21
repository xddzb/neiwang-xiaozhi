"""Dify 提供的 DeepSeek 接口。

兼容两类应用（在 config.yaml 的 dify.app_type 里指定，auto 表示自动探测）：
    chat     聊天助手 / Agent / Chatflow  → POST /v1/chat-messages（支持多轮）
    workflow 工作流                        → POST /v1/workflows/run（单轮）
"""
from __future__ import annotations

import requests

from ..session import Session
from .base import LLMProvider


class DifyError(RuntimeError):
    """携带排查提示的 Dify 调用错误。"""


class DifyProvider(LLMProvider):
    def __init__(self, config: dict):
        self.base_url = str(config.get("base_url") or "").rstrip("/")
        self.api_key = str(config.get("api_key") or "")
        self.app_type = str(config.get("app_type") or "auto").lower()
        self.input_key = str(config.get("workflow_input_key") or "query")
        self.timeout = int(config.get("timeout") or 60)

    def complete(self, text: str, user: str = "local-agent") -> str:
        """无状态调用：不携带 conversation_id，上下文由调用方（如 LangChain）自己管理。"""
        if not self.base_url or not self.api_key:
            raise DifyError("尚未配置 Dify 接口：请复制 config.example.yaml 为 config.yaml，"
                            "填写 dify.base_url 和 dify.api_key。")
        if self.app_type == "workflow":
            return self._chat_workflow(text, None)
        payload = {"inputs": {}, "query": text, "user": user,
                   "conversation_id": "", "response_mode": "blocking"}
        data = self._post("/chat-messages", payload)
        return data.get("answer") or "（Dify 返回了空回复）"

    def chat(self, text: str, session: Session) -> str:
        if not self.base_url or not self.api_key:
            raise DifyError("尚未配置 Dify 接口：请复制 config.example.yaml 为 config.yaml，"
                            "填写 dify.base_url 和 dify.api_key。")
        if self.app_type == "auto":
            self.app_type = self._detect(session)
        if self.app_type == "workflow":
            return self._chat_workflow(text, session)
        return self._chat_messages(text, session)

    def _detect(self, session: Session) -> str:
        """auto 模式：先按聊天型试，404 说明端点不存在，再按工作流试。"""
        try:
            self._post_chat_messages("你好", session)
            return "chat"
        except DifyError as exc:
            if "404" not in str(exc):
                raise
        self._post_workflow("你好")
        return "workflow"

    def _chat_messages(self, text: str, session: Session) -> str:
        data = self._post_chat_messages(text, session)
        session.conversation_id = data.get("conversation_id") or session.conversation_id
        return data.get("answer") or "（Dify 返回了空回复）"

    def _post_chat_messages(self, text: str, session: Session) -> dict:
        payload = {
            "inputs": {},
            "query": text,
            "user": session.user_id,
            "conversation_id": session.conversation_id,
            "response_mode": "blocking",
        }
        return self._post("/chat-messages", payload)

    def _chat_workflow(self, text: str, session: Session) -> str:
        data = self._post_workflow(text)
        outputs = (data.get("data") or {}).get("outputs") or {}
        if isinstance(outputs, dict):
            for key in ("text", "answer", "result", "output"):
                if outputs.get(key):
                    return str(outputs[key])
        return str(outputs) if outputs else "（工作流返回了空结果）"

    def _post_workflow(self, text: str) -> dict:
        payload = {"inputs": {self.input_key: text}, "response_mode": "blocking", "user": "local-agent"}
        return self._post("/workflows/run", payload)

    def _post(self, path: str, payload: dict) -> dict:
        url = self.base_url + path
        headers = {"Authorization": f"Bearer {self.api_key}"}
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=self.timeout)
        except requests.exceptions.ConnectionError as exc:
            raise DifyError(f"连不上 Dify（{url}）：请检查 base_url、内网/VPN 连接。") from exc
        except requests.exceptions.Timeout as exc:
            raise DifyError(f"请求 Dify 超时（{self.timeout}s）。") from exc
        if resp.status_code == 401:
            raise DifyError("401：API Key 无效，请到 Dify 控制台重新创建。")
        if resp.status_code == 404:
            raise DifyError(f"404：{url} 不存在，应用类型可能不匹配（聊天型用 /chat-messages，"
                            f"工作流用 /workflows/run）。")
        if resp.status_code != 200:
            raise DifyError(f"HTTP {resp.status_code}：{resp.text[:300]}")
        return resp.json()
