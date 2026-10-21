"""会话管理：按用户隔离多轮对话。

Dify 聊天型应用在服务端保存历史，本地只需记住 conversation_id；
history 仅用于本地展示与调试，不参与请求。
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Session:
    user_id: str
    conversation_id: str = ""
    history: list[dict] = field(default_factory=list)

    def record(self, role: str, content: str) -> None:
        self.history.append({"role": role, "content": content})

    def reset(self) -> None:
        self.conversation_id = ""
        self.history.clear()
