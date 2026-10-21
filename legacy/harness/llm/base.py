"""LLMProvider 抽象接口。

换一种大模型服务（比如以后直连 DeepSeek 官方 API）时，
只需新写一个实现这个接口的类，引擎和工具代码不用动。
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from ..session import Session


class LLMProvider(ABC):
    @abstractmethod
    def chat(self, text: str, session: Session) -> str:
        """发送一轮用户消息，返回模型回复文本。

        多轮上下文由实现方维护（Dify 聊天型用 session.conversation_id）。
        实现方需要在拿到回复后更新 session.conversation_id。
        """
