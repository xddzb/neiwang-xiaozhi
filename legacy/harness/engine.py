"""AgentEngine：基于 LangChain create_agent 的统一入口。

- 工具集由 harness.tools.build_tools 提供，模型自主选择是否调用
- 多轮记忆由 LangGraph 的 InMemorySaver 按 thread_id（=用户ID）管理
- 生产环境如需重启后保留记忆，可换成 SqliteSaver
"""
from __future__ import annotations

import uuid

from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver

from .bridge import DenPlatform  # noqa: F401  供工具模块复用
from .config import load_config
from .llm.dify import DifyProvider
from .llm.langchain_dify import DifyChatModel
from .tools import build_tools

SYSTEM_PROMPT = """你是公司内网智能助手，基于 DeepSeek。
你可以直接回答业务问答、代码运维、数据分析类问题；
涉及 DEN 执行质量复核、DEN 周报时，优先使用提供的工具获取真实结果，不要编造链接或任务ID。
回答使用简体中文，简洁准确。"""

HELP = """我是基于 DeepSeek 的内网智能助手，可以直接问答，也可以帮你：
- DEN 执行质量复核：「复核 LFDENPSED5GCT000144-S」「批量复核」
- 查进度取报告：「复核进度 <任务ID>」「复核报告 <DEN编号>」
- DEN 周报：「生成本周周报」
内置指令：帮助 / 清空上下文"""


class AgentEngine:
    def __init__(self, config: dict | None = None, model=None):
        self.config = config or load_config()
        if model is None:
            model = self._build_model()
        self._threads: dict[str, str] = {}
        self._checkpointer = InMemorySaver()
        self.agent = create_agent(
            model,
            tools=build_tools(self.config),
            system_prompt=SYSTEM_PROMPT,
            checkpointer=self._checkpointer,
        )

    def _build_model(self):
        """按 llm.provider 选择模型通道：deepseek=原生 function calling；dify=提示词模拟。"""
        provider = str(self.config.get("llm", {}).get("provider") or "dify").lower()
        if provider == "deepseek":
            from langchain_openai import ChatOpenAI
            cfg = self.config["deepseek"]
            if not cfg.get("api_key"):
                raise SystemExit("llm.provider=deepseek 但 deepseek.api_key 为空，请填写 config.yaml。")
            return ChatOpenAI(
                model=cfg.get("model") or "deepseek-chat",
                api_key=cfg["api_key"],
                base_url=cfg.get("base_url") or "https://api.deepseek.com/v1",
                timeout=int(cfg.get("timeout") or 60),
            )
        return DifyChatModel(provider=DifyProvider(self.config["dify"]))

    def _thread_id(self, user_id: str) -> str:
        if user_id not in self._threads:
            self._threads[user_id] = uuid.uuid4().hex
        return self._threads[user_id]

    def handle(self, user_id: str, text: str) -> str:
        text = (text or "").strip()
        if not text:
            return "（空消息）"
        if text in ("帮助", "help", "?", "？"):
            return HELP
        if text in ("清空上下文", "重置", "reset"):
            self._threads[user_id] = uuid.uuid4().hex  # 换新 thread 即开启新会话
            return "已清空对话上下文，下一轮将开启新会话。"
        try:
            result = self.agent.invoke(
                {"messages": [{"role": "user", "content": text}]},
                config={"configurable": {"thread_id": self._thread_id(user_id)}},
            )
            last = result["messages"][-1]
            return last.content or "（模型未返回内容）"
        except Exception as exc:
            return f"处理失败：{type(exc).__name__}: {exc}"
