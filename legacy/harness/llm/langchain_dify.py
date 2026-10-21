"""把 Dify 接口包装成 LangChain 标准的 BaseChatModel。

Dify 应用 API 与标准聊天模型的两处差异，都在这里消化：
1. Dify 只接收单条 query（多轮由服务端 conversation_id 维护），而 LangChain 每次
   传入完整消息列表 → 这里把消息列表平铺成一段带角色标记的文本，无状态发送，
   记忆由 LangChain 的 checkpointer 负责。
2. Dify 不透出 function calling → bind_tools 时把工具说明追加进提示词，
   让模型按约定输出 JSON 工具调用，这里解析成标准的 AIMessage.tool_calls。
"""
from __future__ import annotations

import json
import re
import uuid
from typing import Any, Optional, Sequence

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import Runnable
from langchain_core.tools import BaseTool
from langchain_core.utils.function_calling import convert_to_openai_tool
from pydantic import Field

from .dify import DifyProvider

TOOL_INSTRUCTION = """
你可以使用以下工具来完成用户的请求：
{tools}

规则：
- 需要调用工具时，只输出一行 JSON，格式为：{{"tool": "工具名", "args": {{"参数名": "参数值"}}}}
- 不需要工具时，直接用中文回答，不要输出 JSON。
- 调用工具后我会把结果以「工具[工具名]: 结果」的形式追加在对话里，你再继续回答或继续调用。
"""

ROLE_LABELS = {"system": "系统", "human": "用户", "ai": "你", "tool": "工具"}


def _flatten(messages: list[BaseMessage]) -> str:
    lines = []
    for m in messages:
        label = ROLE_LABELS.get(m.type, m.type)
        name = f"[{m.name}]" if isinstance(m, ToolMessage) and m.name else ""
        lines.append(f"{label}{name}: {m.content}")
    return "\n".join(lines)


class DifyChatModel(BaseChatModel):
    """Dify 应用的 LangChain 适配器。"""

    provider: Any = None          # DifyProvider 实例
    user: str = "langchain-agent"
    bound_tools: list = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "dify-chat"

    def bind_tools(self, tools: Sequence[dict | type | BaseTool], **kwargs: Any) -> Runnable:
        return self.model_copy(update={"bound_tools": list(tools)})

    def _tool_specs(self) -> str:
        specs = []
        for t in self.bound_tools:
            schema = convert_to_openai_tool(t)["function"]
            params = schema.get("parameters", {}).get("properties", {})
            args_desc = "、".join(f"{k}（{v.get('type', 'string')}）" for k, v in params.items())
            specs.append(f"- {schema['name']}：{schema.get('description', '')}。参数：{args_desc or '无'}")
        return "\n".join(specs)

    def _parse_tool_call(self, text: str) -> Optional[AIMessage]:
        names = {getattr(t, "name", None) or convert_to_openai_tool(t)["function"]["name"]
                 for t in self.bound_tools}
        for match in re.finditer(r"\{.*\}", text, re.S):
            try:
                obj = json.loads(match.group(0))
            except ValueError:
                continue
            if isinstance(obj, dict) and obj.get("tool") in names:
                call = {"name": obj["tool"], "args": obj.get("args") or {},
                        "id": f"call_{uuid.uuid4().hex[:8]}", "type": "tool_call"}
                return AIMessage(content="", tool_calls=[call])
        return None

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: Optional[list[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        prompt = _flatten(messages)
        if self.bound_tools:
            prompt += "\n" + TOOL_INSTRUCTION.format(tools=self._tool_specs())
        answer = self.provider.complete(prompt, user=self.user)
        if self.bound_tools:
            call = self._parse_tool_call(answer)
            if call is not None:
                return ChatResult(generations=[ChatGeneration(message=call)])
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=answer))])
